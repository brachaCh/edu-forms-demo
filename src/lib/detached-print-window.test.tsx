/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetachedPrintClient } from "@/components/print/DetachedPrintClient";
import {
  openDetachedPrintWindow,
  parsePrintBusEnvelope,
  printBusStorageKey,
} from "./detached-print";
import {
  PRINT_FOLDERS_FAILED_MESSAGE,
  PRINT_NO_CONTENT_MESSAGE,
} from "./student-document-print";

class FakeBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
  }
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

describe("detached print fail/close before ready (TZ-90)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function busMessage(key: string) {
    return parsePrintBusEnvelope(localStorage.getItem(printBusStorageKey(key)))
      ?.message;
  }

  it("keeps an empty-folder error on the bus after teardown if ready never arrives", async () => {
    const win = openDetachedPrintWindow("הדפסת תיקייה ריקה");
    expect(win).not.toBeNull();
    win!.setProgress(0, 0, "טוען מסמכים להדפסה…");
    win!.fail(PRINT_NO_CONTENT_MESSAGE);

    expect(busMessage(win!.key)).toEqual({
      type: "error",
      message: PRINT_NO_CONTENT_MESSAGE,
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(busMessage(win!.key)).toEqual({
      type: "error",
      message: PRINT_NO_CONTENT_MESSAGE,
    });

    vi.useRealTimers();
    render(
      <DetachedPrintClient printKey={win!.key} title="הדפסת תיקייה ריקה" />
    );
    expect(screen.getByText(PRINT_NO_CONTENT_MESSAGE)).toBeTruthy();
    expect(screen.queryByText("לא התקבל מסמך להדפסה")).toBeNull();
  });

  it("keeps a fast-failure error on the bus after teardown if ready never arrives", async () => {
    const win = openDetachedPrintWindow("הדפסת תיק");
    expect(win).not.toBeNull();
    win!.setProgress(0, 0, "טוען מסמכים להדפסה…");
    win!.fail(PRINT_FOLDERS_FAILED_MESSAGE);

    await vi.advanceTimersByTimeAsync(300);
    expect(busMessage(win!.key)).toEqual({
      type: "error",
      message: PRINT_FOLDERS_FAILED_MESSAGE,
    });

    vi.useRealTimers();
    render(<DetachedPrintClient printKey={win!.key} title="הדפסת תיק" />);
    expect(screen.getByText(PRINT_FOLDERS_FAILED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText("לא התקבל מסמך להדפסה")).toBeNull();
  });

  it("does not discard an undelivered close during teardown", async () => {
    const win = openDetachedPrintWindow("הדפסה");
    expect(win).not.toBeNull();
    win!.close();
    expect(busMessage(win!.key)).toEqual({ type: "close" });
    await vi.advanceTimersByTimeAsync(300);
    expect(busMessage(win!.key)).toEqual({ type: "close" });
  });
});
