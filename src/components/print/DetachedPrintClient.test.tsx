/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetachedPrintClient } from "./DetachedPrintClient";
import { printBusStorageKey, PRINT_CONSUMED_MESSAGE } from "@/lib/detached-print";

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

describe("DetachedPrintClient queued messages (TZ-90)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("mounts with a queued error without throwing on clearInterval(ping)", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    localStorage.setItem(
      printBusStorageKey("err-key"),
      JSON.stringify({
        seq: 1,
        message: { type: "error", message: "שגיאת מסירה" },
        createdAt: Date.now(),
      })
    );

    expect(() =>
      render(<DetachedPrintClient printKey="err-key" title="הדפסת תיק" />)
    ).not.toThrow();
    expect(screen.getByText("שגיאת מסירה")).toBeTruthy();
    expect(
      setIntervalSpy.mock.calls.some((call) => call[1] === 400)
    ).toBe(false);
    setIntervalSpy.mockRestore();
  });

  it("shows a print-again message when the handoff was already consumed", () => {
    localStorage.setItem(
      "matoah-print-consumed:done-key",
      JSON.stringify({ createdAt: Date.now() })
    );
    render(<DetachedPrintClient printKey="done-key" title="הדפסת תיק" />);
    expect(screen.getByText(PRINT_CONSUMED_MESSAGE)).toBeTruthy();
  });
});
