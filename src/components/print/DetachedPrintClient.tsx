"use client";

import { useEffect, useState } from "react";
import {
  assemblePrintHtmlChunks,
  consumePrintHandoff,
  detachedPrintChannelName,
  isPrintConsumed,
  loadPersistedPrintHtml,
  markPrintConsumed,
  parsePrintBusEnvelope,
  PRINT_CONSUMED_MESSAGE,
  PRINT_ORPHAN_MESSAGE,
  printBusStorageKey,
  withAutoPrintScript,
  writePrintReply,
  type DetachedPrintMessage,
  type DetachedPrintReply,
} from "@/lib/detached-print";

const READY_PING_MS = 400;
/**
 * TZ-88: multi-folder student files can take well over 8s before the print
 * window observes the first handoff (BroadcastChannel + storage races while
 * the opener hydrates PDFs). 20s avoids a false «לא התקבל מסמך» while the
 * main page is still working. Progress is sent immediately, but this window
 * can miss that first write.
 */
const ORPHAN_HINT_MS = 20_000;

export function DetachedPrintClient({
  printKey,
  title,
}: {
  printKey: string;
  title: string;
}) {
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    label?: string;
  } | null>(null);
  const [orphan, setOrphan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      setError(
        "הדפדפן אינו תומך בחלון הדפסה מנותק. רעננו את הדף הראשי ונסו שוב."
      );
      return;
    }
    if (title) document.title = title;

    if (isPrintConsumed(printKey)) {
      setError(PRINT_CONSUMED_MESSAGE);
      return;
    }

    const channel = new BroadcastChannel(detachedPrintChannelName(printKey));
    let gotAnything = false;
    let rendered = false;
    let ping: number | undefined;
    const chunks = new Map<
      string,
      { parts: Array<string | undefined>; total: number; autoPrint: boolean }
    >();

    const reply = (message: DetachedPrintReply) => {
      writePrintReply(printKey, message);
      try {
        channel.postMessage(message);
      } catch {
        // ignore
      }
    };

    const stopPing = () => {
      if (ping !== undefined) window.clearInterval(ping);
    };

    const render = (html: string, autoPrint: boolean) => {
      if (rendered) return;
      rendered = true;
      stopPing();
      markPrintConsumed(printKey);
      const finalHtml = autoPrint ? withAutoPrintScript(html) : html;
      // מחליפים את המסמך כולו — האפליקציה נעלמת, ה-Window (והערוץ) נשארים
      document.open();
      document.write(finalHtml);
      document.close();
      reply({ type: "printed" });
      void consumePrintHandoff(printKey);
    };

    const applyMessage = (message: DetachedPrintMessage) => {
      if (!message || typeof message !== "object") return;
      gotAnything = true;
      setOrphan(false);
      if (message.type === "progress") {
        setProgress({
          done: message.done,
          total: message.total,
          label: message.label,
        });
      } else if (message.type === "html") {
        render(message.html, message.autoPrint);
      } else if (message.type === "html-chunk") {
        let entry = chunks.get(message.id);
        if (!entry) {
          entry = {
            parts: [],
            total: message.total,
            autoPrint: message.autoPrint,
          };
          chunks.set(message.id, entry);
        }
        entry.parts[message.index] = message.chunk;
        const assembled = assemblePrintHtmlChunks(entry.parts, entry.total);
        if (assembled) {
          render(assembled, entry.autoPrint);
        }
      } else if (message.type === "html-stored") {
        void loadPersistedPrintHtml(printKey).then((stored) => {
          if (!stored || rendered) return;
          render(stored.html, stored.autoPrint);
        });
      } else if (message.type === "error") {
        stopPing();
        setError(message.message);
      } else if (message.type === "close") {
        stopPing();
        window.close();
      }
    };

    channel.onmessage = (event: MessageEvent<DetachedPrintMessage>) => {
      applyMessage(event.data);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== printBusStorageKey(printKey)) return;
      const message = parsePrintBusEnvelope(event.newValue)?.message;
      if (message) applyMessage(message);
    };
    window.addEventListener("storage", onStorage);

    // הודעות שהדף הראשי כבר כתב לפני שהחלון הספיק להאזין
    let queued: DetachedPrintMessage | undefined;
    try {
      queued = parsePrintBusEnvelope(
        localStorage.getItem(printBusStorageKey(printKey))
      )?.message;
      if (queued) applyMessage(queued);
    } catch {
      // localStorage can throw in private mode / full quota
    }
    void loadPersistedPrintHtml(printKey).then((stored) => {
      if (!stored || rendered) return;
      gotAnything = true;
      setOrphan(false);
      render(stored.html, stored.autoPrint);
    });

    // מודיעים שאנחנו כאן — עד שמגיע המסמך (הדף הראשי אולי עוד לא מאזין)
    reply({ type: "ready" });
    const skipPing = queued?.type === "error" || queued?.type === "close";
    if (!skipPing) {
      ping = window.setInterval(() => {
        if (rendered) {
          stopPing();
          return;
        }
        reply({ type: "ready" });
      }, READY_PING_MS);
    }

    const orphanTimer = window.setTimeout(() => {
      if (!gotAnything && !rendered) setOrphan(true);
    }, ORPHAN_HINT_MS);

    return () => {
      stopPing();
      window.clearTimeout(orphanTimer);
      window.removeEventListener("storage", onStorage);
      // לא סוגרים מיד — remount של React עלול לאבד נתחי HTML באמצע
      window.setTimeout(() => {
        try {
          channel.close();
        } catch {
          // ignore
        }
      }, 2_000);
    };
  }, [printKey, title]);

  const progressLine =
    progress && progress.total > 0
      ? `מכין מסמך ${progress.done} מתוך ${progress.total}…`
      : "מכין מסמכים להדפסה…";

  const alertText = error || (orphan ? PRINT_ORPHAN_MESSAGE : null);

  return (
    // שכבה קבועה על כל המסך — מכסה את הפוטר/ווידג'טים של הפריסה הראשית
    <main
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white px-6 text-center text-slate-700"
    >
      <div className="max-w-md">
        {title ? <h1 className="mb-3 text-lg font-bold text-slate-900">{title}</h1> : null}
        <p className="text-xl leading-relaxed">{progress?.label ?? progressLine}</p>
        <p className="mt-2 text-sm text-slate-500">
          כולל קבצי העלאה (PDF / Word / תמונה)
        </p>
        {alertText ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {alertText}
          </p>
        ) : null}
      </div>
    </main>
  );
}
