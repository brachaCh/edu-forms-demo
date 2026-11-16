/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  clearPrintHandoffStorage,
  isPrintConsumed,
  listMatoahPrintStorageKeys,
  markPrintConsumed,
  persistPrintHtml,
  PRINT_HANDOFF_TTL_MS,
  printBusStorageKey,
  printConsumedStorageKey,
  printHtmlStorageKey,
  printReplyStorageKey,
  sweepExpiredPrintLocalStorage,
  writePrintBusMessage,
} from "./detached-print";

describe("detached print storage (TZ-90 read-once)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("never writes document HTML into localStorage", async () => {
    const html = "<section class='print-doc'><p>תיק תלמיד מלא</p></section>";
    await persistPrintHtml("k1", html, true);
    expect(localStorage.getItem(printHtmlStorageKey("k1"))).toBeNull();
    expect(localStorage.getItem("matoah-print-html:k1")).toBeNull();
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      expect(localStorage.getItem(key)).not.toContain(html);
    }
  });

  it("allows small progress signals in localStorage but not HTML", () => {
    expect(
      writePrintBusMessage("k2", { type: "progress", done: 1, total: 4 })
    ).toBe(true);
    const raw = localStorage.getItem(printBusStorageKey("k2"));
    expect(raw).toContain("progress");
    expect(raw).not.toContain("<html");
  });

  it("clears bus/reply/legacy HTML keys for a print key", () => {
    localStorage.setItem(printBusStorageKey("k3"), "bus");
    localStorage.setItem(printReplyStorageKey("k3"), "reply");
    localStorage.setItem(printHtmlStorageKey("k3"), "<html>secret</html>");
    markPrintConsumed("k3");
    clearPrintHandoffStorage("k3");
    expect(localStorage.getItem(printBusStorageKey("k3"))).toBeNull();
    expect(localStorage.getItem(printReplyStorageKey("k3"))).toBeNull();
    expect(localStorage.getItem(printHtmlStorageKey("k3"))).toBeNull();
    expect(isPrintConsumed("k3")).toBe(true);
  });

  it("sweeps leftover HTML keys and expired matoah-print entries", () => {
    const now = 1_000_000;
    localStorage.setItem(printHtmlStorageKey("old"), "<html>student</html>");
    localStorage.setItem(
      printBusStorageKey("fresh"),
      JSON.stringify({ seq: 1, message: { type: "progress", done: 1, total: 1 }, createdAt: now })
    );
    localStorage.setItem(
      printReplyStorageKey("stale"),
      JSON.stringify({
        seq: 1,
        message: { type: "ready" },
        createdAt: now - PRINT_HANDOFF_TTL_MS - 1,
      })
    );
    localStorage.setItem(
      printConsumedStorageKey("ancient"),
      JSON.stringify({ createdAt: now - PRINT_HANDOFF_TTL_MS - 50 })
    );

    const removed = sweepExpiredPrintLocalStorage(now);
    expect(removed).toEqual(
      expect.arrayContaining([
        printHtmlStorageKey("old"),
        printReplyStorageKey("stale"),
        printConsumedStorageKey("ancient"),
      ])
    );
    expect(localStorage.getItem(printBusStorageKey("fresh"))).toBeTruthy();
    expect(listMatoahPrintStorageKeys()).toEqual([printBusStorageKey("fresh")]);
  });
});
