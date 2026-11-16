import { describe, expect, it } from "vitest";
import {
  bytesToDataUrl,
  clearPrintBytes,
  decodeBase64ToUint8Array,
  decodeDataUrlPayload,
  hasInlinePrintPayload,
  peekPrintBytes,
  printPayloadTimeoutMs,
  rememberPrintBytes,
  PRINT_LARGE_PAYLOAD_TIMEOUT_MS,
  PRINT_PAYLOAD_TIMEOUT_MS,
  repairStorageObjectUrl,
} from "./print-payload";

describe("print payload decode (TZ-102)", () => {
  it("strips whitespace and accepts url-safe base64", () => {
    const text = "hello";
    const standard = Buffer.from(text).toString("base64");
    const wrapped = `${standard.slice(0, 4)}\n${standard.slice(4)}`;
    const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_");
    expect(new TextDecoder().decode(decodeBase64ToUint8Array(wrapped)!)).toBe(
      text
    );
    expect(new TextDecoder().decode(decodeBase64ToUint8Array(urlSafe)!)).toBe(
      text
    );
  });

  it("decodes a data URL whose payload has spaces (scanner-style wrapping)", () => {
    const pdf = "%PDF-1.4\n";
    const b64 = Buffer.from(pdf).toString("base64");
    const wrapped = `data:application/pdf;base64,${b64.slice(0, 4)} ${b64.slice(4)}`;
    const decoded = decodeDataUrlPayload(wrapped);
    expect(decoded).not.toBeNull();
    expect(new TextDecoder().decode(decoded!.bytes)).toContain("%PDF");
  });

  it("round-trips bytes through a data URL", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const url = bytesToDataUrl(bytes, "application/pdf");
    expect(decodeDataUrlPayload(url)?.bytes).toEqual(bytes);
  });

  it("encodes a Uint8Array view without reading the surrounding buffer", () => {
    const buf = new Uint8Array([0, 0, 0x25, 0x50, 0x44, 0x46, 9, 9]);
    const view = buf.subarray(2, 6);
    const url = bytesToDataUrl(view, "application/pdf");
    expect(decodeDataUrlPayload(url)?.bytes).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46])
    );
  });

  it("clears remembered print bytes", () => {
    rememberPrintBytes("doc-1", new Uint8Array([1, 2, 3]));
    expect(peekPrintBytes("doc-1")?.length).toBe(3);
    clearPrintBytes();
    expect(peekPrintBytes("doc-1")).toBeUndefined();
  });

  it("treats only data: URLs as inline print payloads", () => {
    expect(hasInlinePrintPayload("data:application/pdf;base64,AAAA")).toBe(true);
    expect(
      hasInlinePrintPayload(
        "https://proj.supabase.co/storage/v1/object/public/docs/a.pdf"
      )
    ).toBe(false);
    expect(hasInlinePrintPayload("")).toBe(false);
  });

  it("re-encodes Storage path segments so parentheses and spaces survive", () => {
    const raw =
      "https://proj.supabase.co/storage/v1/object/public/docs/מכתב רופא ADHD (1).pdf";
    const repaired = repairStorageObjectUrl(raw);
    expect(repaired).toContain("ADHD");
    expect(repaired).toContain("%20");
    expect(repaired).toContain("%28");
    expect(repaired).toContain("%29");
    expect(() => new URL(repaired)).not.toThrow();
  });
});

describe("print payload timeouts (TZ-101)", () => {
  it("uses the long deadline for unknown-size PDFs and large files", () => {
    expect(printPayloadTimeoutMs(0, "pdf")).toBe(PRINT_LARGE_PAYLOAD_TIMEOUT_MS);
    expect(printPayloadTimeoutMs(2_000_000, "pdf")).toBe(
      PRINT_LARGE_PAYLOAD_TIMEOUT_MS
    );
    expect(printPayloadTimeoutMs(20_000, "pdf")).toBe(PRINT_PAYLOAD_TIMEOUT_MS);
    expect(printPayloadTimeoutMs(20_000, "html")).toBe(PRINT_PAYLOAD_TIMEOUT_MS);
  });
});
