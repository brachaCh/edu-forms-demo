import { describe, expect, it } from "vitest";
import {
  blobMimeForDataUrl,
  dataUrlDeclaredMime,
  isAllowedBlobMime,
  isAllowedClientDocumentHref,
  isAllowedRasterPreviewMime,
  isAllowedStorageHttpsUrl,
  isAllowedUploadMime,
  isDangerousRenderMime,
  isDataUrl,
  isXmlLikeMime,
  normalizeMimeType,
  rewriteDataUrlMimeHeader,
} from "./data-url";

describe("data-url mime parsing", () => {
  it("is case-insensitive and whitespace-tolerant", () => {
    expect(normalizeMimeType(" APPLICATION/PDF ;charset=utf-8")).toBe(
      "application/pdf"
    );
    expect(dataUrlDeclaredMime("data: APPLICATION/PDF ;base64,JVBERi0=")).toBe(
      "application/pdf"
    );
    expect(dataUrlDeclaredMime("DATA:Application/PDF;BASE64,JVBERi0=")).toBe(
      "application/pdf"
    );
    expect(dataUrlDeclaredMime("data:;base64,PHNjcmlwdD4=")).toBeNull();
    expect(dataUrlDeclaredMime("data:,hello")).toBeNull();
    expect(isDataUrl("DATA:application/pdf;base64,JVBERi0=")).toBe(true);
    expect(isDataUrl(" javascript:alert(1)")).toBe(false);
  });

  it("rewrites a data-URL header to data:<mapped>;base64,", () => {
    expect(
      rewriteDataUrlMimeHeader(
        "data:application/octet-stream;base64,UEs=",
        "application/pdf"
      )
    ).toBe("data:application/pdf;base64,UEs=");
    expect(
      rewriteDataUrlMimeHeader("DATA:;BASE64,JVBERi0=", "application/pdf")
    ).toBe("data:application/pdf;base64,JVBERi0=");
  });

  it("treats xml / +xml / xsl / xslt as dangerous render types", () => {
    expect(isXmlLikeMime("application/rss+xml")).toBe(true);
    expect(isXmlLikeMime("text/xsl")).toBe(true);
    expect(isXmlLikeMime("application/xslt+xml")).toBe(true);
    expect(isDangerousRenderMime("text/html")).toBe(true);
    expect(isDangerousRenderMime("application/pdf")).toBe(false);
    expect(isAllowedUploadMime("application/rss+xml")).toBe(false);
  });

  it("never creates an allowlisted blob type from a typeless or xml data URL", () => {
    expect(blobMimeForDataUrl("data:;base64,PHNjcmlwdD4=")).toBe(
      "application/octet-stream"
    );
    expect(blobMimeForDataUrl("data:text/xsl;base64,PHhzbA==")).toBe(
      "application/octet-stream"
    );
    expect(blobMimeForDataUrl("data:application/xslt+xml;base64,PHhzbA==")).toBe(
      "application/octet-stream"
    );
    expect(blobMimeForDataUrl("data:application/pdf;base64,JVBERi0=")).toBe(
      "application/pdf"
    );
    expect(blobMimeForDataUrl("data:image/png;base64,AAAA")).toBe("image/png");
  });

  it("allowlists HEIC/HEIF as upload and blob types but NOT raster-preview (#108 follow-up)", () => {
    expect(isAllowedUploadMime("image/heic")).toBe(true);
    expect(isAllowedUploadMime("image/heif")).toBe(true);
    expect(isAllowedBlobMime("image/heic")).toBe(true);
    expect(isAllowedBlobMime("image/heif")).toBe(true);
    expect(isAllowedRasterPreviewMime("image/heic")).toBe(false);
    expect(isAllowedRasterPreviewMime("image/heif")).toBe(false);
    expect(blobMimeForDataUrl("data:image/heic;base64,AAAA")).toBe("image/heic");
    expect(blobMimeForDataUrl("data:image/heif;base64,AAAA")).toBe("image/heif");
  });

  it("allowlists RTF as upload and blob type but NOT raster-preview (#108 follow-up)", () => {
    expect(isAllowedUploadMime("application/rtf")).toBe(true);
    expect(isAllowedBlobMime("application/rtf")).toBe(true);
    expect(isAllowedRasterPreviewMime("application/rtf")).toBe(false);
    expect(blobMimeForDataUrl("data:application/rtf;base64,e1xydGY=")).toBe(
      "application/rtf"
    );
  });

  it("allows only data: or the configured storage https origin", () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://proj.supabase.co";
    try {
      expect(isAllowedClientDocumentHref("DATA:application/pdf;base64,AAA")).toBe(
        true
      );
      expect(
        isAllowedStorageHttpsUrl(
          "https://proj.supabase.co/storage/v1/object/public/docs/a.pdf"
        )
      ).toBe(true);
      expect(isAllowedClientDocumentHref("https://evil.example/a.pdf")).toBe(
        false
      );
      expect(isAllowedClientDocumentHref("javascript:alert(1)")).toBe(false);
      expect(
        isAllowedStorageHttpsUrl("https://proj.supabase.co/auth/v1/x")
      ).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
  });
});
