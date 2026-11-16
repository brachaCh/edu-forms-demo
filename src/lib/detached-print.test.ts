import { describe, expect, it } from "vitest";
import {
  assemblePrintHtmlChunks,
  AUTO_PRINT_SCRIPT,
  detachedPrintChannelName,
  detachedPrintUrl,
  htmlDeliveryMessages,
  nextPrintEnvelope,
  parsePrintBusEnvelope,
  parsePrintReplyEnvelope,
  PRINT_HTML_CHUNK_CHARS,
  PRINT_CONSUMED_MESSAGE,
  PRINT_ORPHAN_MESSAGE,
  shouldPublishStoredPrintHtml,
  printBusStorageKey,
  printConsumedStorageKey,
  printHtmlStorageKey,
  printReplyStorageKey,
  shouldMirrorPrintMessage,
  splitPrintHtmlChunks,
  withAutoPrintScript,
} from "./detached-print";

describe("detached-print", () => {
  it("builds a /print/[key] url with the title as a query param", () => {
    expect(detachedPrintUrl("abc-123", "הדפסת טופס")).toBe(
      `/print/abc-123?title=${encodeURIComponent("הדפסת טופס").replace(/%20/g, "+")}`
    );
    expect(detachedPrintUrl("k", "")).toBe("/print/k");
  });

  it("uses a namespaced BroadcastChannel name", () => {
    expect(detachedPrintChannelName("k1")).toBe("matoah-print:k1");
  });

  it("injects the auto-print script before </body>", () => {
    const html = "<html><body><p>x</p></body></html>";
    const out = withAutoPrintScript(html);
    expect(out).toBe(`<html><body><p>x</p>${AUTO_PRINT_SCRIPT}</body></html>`);
    expect(out.indexOf("window.print()")).toBeLessThan(out.indexOf("</body>"));
  });

  it("appends the auto-print script when there is no </body>", () => {
    expect(withAutoPrintScript("<p>x</p>")).toBe(`<p>x</p>${AUTO_PRINT_SCRIPT}`);
  });

  it("splits oversized print HTML into ordered chunks and reassembles them", () => {
    const html = "א".repeat(PRINT_HTML_CHUNK_CHARS + 50);
    const chunks = splitPrintHtmlChunks(html, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(html);
    expect(assemblePrintHtmlChunks(["a", "b"], 2)).toBe("ab");
    expect(assemblePrintHtmlChunks(["a", undefined, "c"], 3)).toBeNull();
  });

  it("uses a single html message for small documents and chunks for large ones", () => {
    expect(htmlDeliveryMessages("<p>ok</p>", false)).toEqual([
      { type: "html", html: "<p>ok</p>", autoPrint: false },
    ]);
    const huge = "x".repeat(PRINT_HTML_CHUNK_CHARS + 1);
    const messages = htmlDeliveryMessages(huge, true, "id-1");
    expect(messages.length).toBe(2);
    expect(messages.every((m) => m.type === "html-chunk")).toBe(true);
    const parts = messages.map((m) =>
      m.type === "html-chunk" ? m.chunk : ""
    );
    expect(assemblePrintHtmlChunks(parts, messages.length)).toBe(huge);
  });

  it("tells the user to refresh the main page when the print window is orphaned", () => {
    expect(PRINT_ORPHAN_MESSAGE).toContain("רעננו את הדף הראשי");
  });

  it("mirrors only small handoff messages to localStorage (TZ-90)", () => {
    expect(printBusStorageKey("abc")).toBe("matoah-print-bus:abc");
    expect(printReplyStorageKey("abc")).toBe("matoah-print-reply:abc");
    expect(printHtmlStorageKey("abc")).toBe("matoah-print-html:abc");
    expect(
      shouldMirrorPrintMessage({ type: "progress", done: 1, total: 2 })
    ).toBe(true);
    expect(shouldMirrorPrintMessage({ type: "html-stored", autoPrint: false })).toBe(
      true
    );
    expect(
      shouldMirrorPrintMessage({ type: "html", html: "<p>x</p>", autoPrint: true })
    ).toBe(false);
    expect(
      shouldMirrorPrintMessage({
        type: "html-chunk",
        id: "1",
        index: 0,
        total: 1,
        chunk: "x",
        autoPrint: false,
      })
    ).toBe(false);
  });

  it("increments storage envelopes so identical progress still notifies the other window", () => {
    const first = nextPrintEnvelope(
      null,
      { type: "ready" as const },
      parsePrintReplyEnvelope
    );
    const parsedFirst = parsePrintReplyEnvelope(first);
    expect(parsedFirst?.seq).toBe(1);
    expect(parsedFirst?.message).toEqual({ type: "ready" });
    expect(typeof parsedFirst?.createdAt).toBe("number");
    const second = nextPrintEnvelope(
      first,
      { type: "ready" as const },
      parsePrintReplyEnvelope
    );
    expect(parsePrintReplyEnvelope(second)?.seq).toBe(2);
    expect(parsePrintReplyEnvelope(second)?.createdAt).toBe(parsedFirst?.createdAt);
    expect(parsePrintBusEnvelope("not-json")).toBeNull();
  });

  it("keeps a consumed-print message for F5 after read-once deletion", () => {
    expect(PRINT_CONSUMED_MESSAGE).toContain("הדפיסו שוב מהדף הראשי");
    expect(printConsumedStorageKey("abc")).toBe("matoah-print-consumed:abc");
  });

  it("deletes a late IDB put after close, fail, or consume", () => {
    expect(
      shouldPublishStoredPrintHtml({
        ok: true,
        disposed: false,
        closed: false,
        consumed: false,
      })
    ).toBe("post");
    expect(
      shouldPublishStoredPrintHtml({
        ok: true,
        disposed: true,
        closed: false,
        consumed: false,
      })
    ).toBe("delete");
    expect(
      shouldPublishStoredPrintHtml({
        ok: true,
        disposed: false,
        closed: true,
        consumed: false,
      })
    ).toBe("delete");
    expect(
      shouldPublishStoredPrintHtml({
        ok: true,
        disposed: false,
        closed: false,
        consumed: true,
      })
    ).toBe("delete");
  });
});
