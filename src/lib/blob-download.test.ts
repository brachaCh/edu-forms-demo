import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLOB_URL_REVOKE_DELAY_MS,
  downloadBlob,
  scheduleRevokeObjectUrl,
} from "./blob-download";

describe("blob-download", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("revokes object URL after delay, not immediately", () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
    scheduleRevokeObjectUrl("blob:test");
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BLOB_URL_REVOKE_DELAY_MS - 1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("sets anchor download with Hebrew preserved", () => {
    const clicks: string[] = [];
    const downloads: string[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const el = {
          href: "",
          rel: "",
          download: "",
          click() {
            clicks.push("click");
            downloads.push(el.download);
          },
          remove() {},
        };
        return el;
      },
      body: { appendChild: () => {}, removeChild: () => {} },
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    downloadBlob(new Blob(["x"]), 'תח"י.doc');
    expect(clicks).toEqual(["click"]);
    expect(downloads[0]).toContain("תח");
    expect(downloads[0]).toMatch(/\.doc$/);
  });
});