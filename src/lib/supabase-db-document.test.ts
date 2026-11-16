import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStudentDocumentData,
  fetchStudentDocumentDataWithRetry,
  isStudentDocumentDataError,
  parseRawDocumentDataResponse,
  StudentDocumentDataError,
  studentDocumentDataUrl,
} from "./supabase-db";

describe("raw student document payload (TZ-90)", () => {
  it("builds a same-origin GET url for one document", () => {
    expect(studentDocumentDataUrl("doc-1")).toBe("/api/tenant/documents/doc-1");
    expect(studentDocumentDataUrl("a/b")).toBe(
      "/api/tenant/documents/a%2Fb"
    );
    expect(studentDocumentDataUrl("doc-1", "print")).toBe(
      "/api/tenant/documents/doc-1?purpose=print"
    );
    expect(studentDocumentDataUrl("doc-1", "print", "bytes")).toBe(
      "/api/tenant/documents/doc-1?purpose=print&format=bytes"
    );
  });

  it("accepts a raw data URL body and rejects empty/error responses", () => {
    expect(
      parseRawDocumentDataResponse(
        "doc-1",
        200,
        "data:application/pdf;base64,JVBERi0="
      )
    ).toEqual({
      id: "doc-1",
      data_url: "data:application/pdf;base64,JVBERi0=",
    });
    expect(parseRawDocumentDataResponse("doc-1", 200, "   ")).toBeNull();
    expect(
      parseRawDocumentDataResponse("doc-1", 404, "data:application/pdf;base64,AAA")
    ).toBeNull();
    expect(parseRawDocumentDataResponse("doc-1", 500, "")).toBeNull();
  });
});

describe("fetchStudentDocumentData retries (TZ-90)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not chain a print data-URL or view GET after a bytes 413", async () => {
    const tooLarge = () =>
      new Response(JSON.stringify({ error: "DOCUMENT_TOO_LARGE" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi.fn().mockResolvedValue(tooLarge());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchStudentDocumentDataWithRetry("doc-1", 3, { purpose: "print" })
    ).rejects.toMatchObject({ status: 413, code: "DOCUMENT_TOO_LARGE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("format=bytes");
    expect(
      fetchMock.mock.calls.every((call) => String(call[0]).includes("/api/tenant/data"))
    ).toBe(false);
  });

  it("does not fall through to a view GET after a print data-URL 413", async () => {
    const tooLarge = () =>
      new Response(JSON.stringify({ error: "DOCUMENT_TOO_LARGE" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(tooLarge());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchStudentDocumentData("doc-1", { purpose: "print" })
    ).rejects.toMatchObject({ status: 413, code: "DOCUMENT_TOO_LARGE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("format=bytes");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("purpose=print");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("format=bytes");
  });

  it("prefers X-Document-Mime over Content-Type for format=bytes", async () => {
    const pdf = Buffer.from("%PDF-1.4\n");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Document-Mime": "application/pdf",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const loaded = await fetchStudentDocumentData("doc-1", { purpose: "print" });
    expect(loaded?.data_url).toMatch(/^data:application\/pdf;base64,/);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("format=bytes");
  });

  it("falls back to POST on 413 for view/download", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "DOCUMENT_TOO_LARGE" }), {
          status: 413,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { id: "doc-1", data_url: "data:application/pdf;base64,AAA" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchStudentDocumentData("doc-1")).resolves.toEqual({
      id: "doc-1",
      data_url: "data:application/pdf;base64,AAA",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not fall back to POST on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchStudentDocumentData("doc-1")).rejects.toBeInstanceOf(
      StudentDocumentDataError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to POST on 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { id: "doc-1", data_url: "data:application/pdf;base64,AAA" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchStudentDocumentData("doc-1")).resolves.toEqual({
      id: "doc-1",
      data_url: "data:application/pdf;base64,AAA",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: "POST" })
    );
  });

  it("aborts the GET when the timeout fires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchStudentDocumentData("doc-1", { timeoutMs: 20 });
    const assertion = expect(pending).rejects.toSatisfy(isAbortErrorLike);
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry the inner timeout abort", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchStudentDocumentDataWithRetry("doc-1", 3, {
      timeoutMs: 20,
    });
    const assertion = expect(pending).rejects.toSatisfy(isAbortErrorLike);
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function isAbortErrorLike(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
