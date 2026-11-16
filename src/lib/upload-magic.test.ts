import { describe, expect, it, vi } from "vitest";
import {
  MAGIC_PREFIX_B64_CHARS,
  assertUploadMagic,
  decodeDataUrlPrefix,
  magicMatchesMime,
  sniffMagic,
} from "./upload-magic";

export function bytesToDataUrl(mime: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

export const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
export const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
export const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
export const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x34]);
export const OLE = Uint8Array.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00,
]);
export const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
export const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
export const HEIC = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
export const RTF = Uint8Array.from([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31]);

export function pdfAtOffset(offset: number): Uint8Array {
  const bytes = new Uint8Array(offset + 4);
  bytes[offset] = 0x25;
  bytes[offset + 1] = 0x50;
  bytes[offset + 2] = 0x44;
  bytes[offset + 3] = 0x46;
  return bytes;
}

describe("upload magic bytes", () => {
  it("accepts PDF, images, Word OLE and Office Open XML", () => {
    expect(magicMatchesMime(PDF, "application/pdf")).toBe(true);
    expect(magicMatchesMime(JPEG, "image/jpeg")).toBe(true);
    expect(magicMatchesMime(PNG, "image/png")).toBe(true);
    expect(magicMatchesMime(GIF, "image/gif")).toBe(true);
    expect(magicMatchesMime(WEBP, "image/webp")).toBe(true);
    expect(magicMatchesMime(OLE, "application/msword")).toBe(true);
    expect(
      magicMatchesMime(
        ZIP,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
    expect(
      magicMatchesMime(
        ZIP,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe(true);
    expect(
      assertUploadMagic(bytesToDataUrl("application/pdf", PDF), "application/pdf")
    ).toEqual({ ok: true, mimeType: "application/pdf" });
    expect(
      assertUploadMagic(bytesToDataUrl("image/png", PNG), "image/png")
    ).toEqual({ ok: true, mimeType: "image/png" });
  });

  it("accepts image-family mismatches and corrects the stored type", () => {
    expect(
      assertUploadMagic(bytesToDataUrl("image/jpeg", PNG), "image/jpeg")
    ).toEqual({ ok: true, mimeType: "image/png" });
    expect(
      assertUploadMagic(bytesToDataUrl("image/png", JPEG), "image/png")
    ).toEqual({ ok: true, mimeType: "image/jpeg" });
    expect(
      assertUploadMagic(bytesToDataUrl("image/jpeg", HEIC), "image/jpeg")
    ).toEqual({ ok: true, mimeType: "image/heic" });
  });

  it("accepts Word/Excel family mismatches and RTF", () => {
    expect(
      assertUploadMagic(bytesToDataUrl("application/msword", ZIP), "application/msword")
    ).toEqual({
      ok: true,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(
      assertUploadMagic(
        bytesToDataUrl(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          OLE
        ),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toEqual({ ok: true, mimeType: "application/msword" });
    expect(
      assertUploadMagic(bytesToDataUrl("application/msword", RTF), "application/msword")
    ).toEqual({ ok: true, mimeType: "application/rtf" });
    expect(
      assertUploadMagic(
        bytesToDataUrl("application/vnd.ms-excel", ZIP),
        "application/vnd.ms-excel"
      )
    ).toEqual({
      ok: true,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("accepts a PDF whose %PDF is at offset 500", () => {
    const delayed = pdfAtOffset(500);
    expect(sniffMagic(delayed)).toBe("pdf");
    expect(magicMatchesMime(delayed, "application/pdf")).toBe(true);
    expect(
      assertUploadMagic(bytesToDataUrl("application/pdf", delayed), "application/pdf")
    ).toEqual({ ok: true, mimeType: "application/pdf" });
  });

  it("rejects a PDF name whose payload is an executable", () => {
    const mz = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(
      assertUploadMagic(bytesToDataUrl("application/pdf", mz), "application/pdf")
    ).toEqual({ ok: false, error: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("rejects HTML, XML and scripts even with an allowed family mime", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const xml = new TextEncoder().encode("<?xml version=\"1.0\"?><x/>");
    const script = new TextEncoder().encode("#!/bin/sh\necho x");
    expect(sniffMagic(html)).toBe("html");
    expect(sniffMagic(xml)).toBe("xml");
    expect(sniffMagic(script)).toBe("script");
    expect(magicMatchesMime(html, "image/jpeg")).toBe(false);
    expect(magicMatchesMime(xml, "application/pdf")).toBe(false);
    expect(magicMatchesMime(script, "text/plain")).toBe(false);
  });

  it("does not decode the full data URL to sniff magic", () => {
    const huge = `data:application/pdf;base64,JVBERi0${"A".repeat(200_000)}`;
    const spy = vi.spyOn(globalThis, "atob");
    expect(assertUploadMagic(huge, "application/pdf")).toEqual({
      ok: true,
      mimeType: "application/pdf",
    });
    expect(spy).toHaveBeenCalled();
    for (const [arg] of spy.mock.calls) {
      expect(String(arg).length).toBeLessThanOrEqual(MAGIC_PREFIX_B64_CHARS + 4);
    }
    spy.mockRestore();
  });

  it("reads only a prefix from a data URL", () => {
    const prefix = decodeDataUrlPrefix("data:application/pdf;base64,JVBERi0=");
    expect(prefix && String.fromCharCode(...prefix.slice(0, 4))).toBe("%PDF");
  });
});
