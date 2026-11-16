/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SimpleSignSubmissionStatus } from "@/lib/simplesign-signature-request";

const { loadSimpleSignSubmissions, loadStudentFormFillById } = vi.hoisted(() => ({
  loadSimpleSignSubmissions: vi.fn(),
  loadStudentFormFillById: vi.fn(),
}));

vi.mock("@/lib/simplesign-signature-request", () => ({
  loadSimpleSignSubmissions,
}));

vi.mock("@/lib/mock-store", () => ({
  loadStudentFormFillById,
}));

import {
  hasPendingSimpleSignSubmission,
  idleSimpleSignSubmissions,
  SIMPLE_SIGN_SYNC_POLL_MS,
  useSimpleSignSubmissionsSync,
} from "@/lib/simplesign/use-simple-sign-submissions-sync";

function pendingSubmission(
  id = "sub-1"
): SimpleSignSubmissionStatus {
  return {
    id,
    parentRole: "father",
    signatureFieldKey: "father_signature",
    status: "pending",
    signingUrl: null,
    signerEmail: "parent@example.com",
    signerName: "האב",
    signedAt: null,
    createdAt: "2026-10-14T00:00:00.000Z",
    signedPdfStored: false,
  };
}

function completedSubmission(
  id = "sub-1"
): SimpleSignSubmissionStatus {
  return {
    ...pendingSubmission(id),
    status: "signed",
    signedAt: "2026-10-19T12:00:00.000Z",
    signedPdfStored: true,
    signedPdfDocumentId: "doc-1",
  };
}

type HookProps = {
  activeFillId: string | undefined;
  formId: string | undefined;
  studentId: string | undefined;
  enabled: boolean;
  hasPendingSubmission: boolean;
};

function savedFillProps(
  overrides: Partial<HookProps> = {}
): HookProps {
  return {
    activeFillId: "fill-1",
    formId: "waiver-confidentiality",
    studentId: "student-1",
    enabled: true,
    hasPendingSubmission: false,
    ...overrides,
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("idleSimpleSignSubmissions", () => {
  it("returns the same empty array so React does not re-render", () => {
    const empty: SimpleSignSubmissionStatus[] = [];
    expect(idleSimpleSignSubmissions(empty)).toBe(empty);
  });

  it("clears a non-empty list", () => {
    const prev = [pendingSubmission()];
    const next = idleSimpleSignSubmissions(prev);
    expect(next).toEqual([]);
    expect(next).not.toBe(prev);
  });
});

describe("hasPendingSimpleSignSubmission", () => {
  it("is true for pending or signed-without-PDF — matching main's poll gate", () => {
    expect(hasPendingSimpleSignSubmission([pendingSubmission()])).toBe(true);
    expect(
      hasPendingSimpleSignSubmission([
        { status: "signed", signedPdfStored: false },
      ])
    ).toBe(true);
  });

  it("is false once every row is signed and the PDF is stored", () => {
    expect(hasPendingSimpleSignSubmission([completedSubmission()])).toBe(false);
    expect(hasPendingSimpleSignSubmission([])).toBe(false);
  });
});

describe("useSimpleSignSubmissionsSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadSimpleSignSubmissions.mockReset();
    loadStudentFormFillById.mockReset();
    loadSimpleSignSubmissions.mockResolvedValue({
      ok: true,
      submissions: [pendingSubmission()],
    });
    loadStudentFormFillById.mockResolvedValue({ data: {} });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not loop when the early-exit reset is already empty", () => {
    const initial: SimpleSignSubmissionStatus[] = [];
    let state = initial;
    let stateChanges = 0;
    const setSubmissions = vi.fn(
      (
        update: SimpleSignSubmissionStatus[] | ((prev: SimpleSignSubmissionStatus[]) => SimpleSignSubmissionStatus[])
      ) => {
        const next = typeof update === "function" ? update(state) : update;
        if (next === state) return;
        state = next;
        stateChanges += 1;
      }
    );
    const setData = vi.fn();

    const { rerender } = renderHook(
      (props: HookProps) =>
        useSimpleSignSubmissionsSync({
          ...props,
          setSubmissions,
          setData,
        }),
      {
        initialProps: {
          activeFillId: undefined,
          formId: undefined,
          studentId: undefined,
          enabled: false,
          hasPendingSubmission: false,
        },
      }
    );

    for (let i = 0; i < 20; i++) {
      rerender({
        activeFillId: undefined,
        formId: undefined,
        studentId: undefined,
        enabled: false,
        hasPendingSubmission: false,
      });
    }

    expect(state).toBe(initial);
    expect(stateChanges).toBe(0);
    expect(loadSimpleSignSubmissions).not.toHaveBeenCalled();
    for (const call of setSubmissions.mock.calls) {
      const update = call[0];
      expect(typeof update).toBe("function");
      if (typeof update !== "function") continue;
      expect(update(initial)).toBe(initial);
    }
  });

  it("polls once per 12s and does not multiply after a server response or rerender", async () => {
    const setSubmissions = vi.fn();
    const setData = vi.fn();
    const baseProps = savedFillProps({ hasPendingSubmission: true });

    const { rerender, unmount } = renderHook(
      (props: HookProps) =>
        useSimpleSignSubmissionsSync({
          ...props,
          setSubmissions,
          setData,
        }),
      { initialProps: baseProps }
    );

    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(1);
    expect(loadSimpleSignSubmissions).toHaveBeenCalledWith("fill-1");

    rerender({ ...baseProps });
    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS - 1);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS * 2);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);
  });

  it("starts 12s polling on a saved fill when submissions go from none to pending", async () => {
    const setSubmissions = vi.fn();
    const setData = vi.fn();
    loadSimpleSignSubmissions.mockResolvedValue({
      ok: true,
      submissions: [],
    });

    const { rerender, result } = renderHook(
      (props: HookProps) =>
        useSimpleSignSubmissionsSync({
          ...props,
          setSubmissions,
          setData,
        }),
      { initialProps: savedFillProps({ hasPendingSubmission: false }) }
    );

    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(1);

    loadSimpleSignSubmissions.mockResolvedValue({
      ok: true,
      submissions: [pendingSubmission()],
    });
    rerender(savedFillProps({ hasPendingSubmission: true }));
    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(2);

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(4);

    rerender(savedFillProps({ hasPendingSubmission: true }));
    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(4);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(5);
  });

  it("stops polling when pending submissions become completed, matching main", async () => {
    const setSubmissions = vi.fn();
    const setData = vi.fn();

    const { rerender, unmount } = renderHook(
      (props: HookProps) =>
        useSimpleSignSubmissionsSync({
          ...props,
          setSubmissions,
          setData,
        }),
      { initialProps: savedFillProps({ hasPendingSubmission: true }) }
    );

    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(2);

    loadSimpleSignSubmissions.mockResolvedValue({
      ok: true,
      submissions: [completedSubmission()],
    });
    rerender(savedFillProps({ hasPendingSubmission: false }));
    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS * 2);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);
  });

  it("cleans up the previous interval when fill id changes so polls are not stacked", async () => {
    const setSubmissions = vi.fn();
    const setData = vi.fn();

    const { rerender, unmount } = renderHook(
      (props: HookProps) =>
        useSimpleSignSubmissionsSync({
          ...props,
          setSubmissions,
          setData,
        }),
      {
        initialProps: savedFillProps({
          activeFillId: "fill-a",
          hasPendingSubmission: true,
        }),
      }
    );

    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(1);
    expect(loadSimpleSignSubmissions).toHaveBeenLastCalledWith("fill-a");

    rerender(
      savedFillProps({
        activeFillId: "fill-b",
        hasPendingSubmission: true,
      })
    );
    await flushMicrotasks();
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(2);
    expect(loadSimpleSignSubmissions).toHaveBeenLastCalledWith("fill-b");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);
    expect(
      loadSimpleSignSubmissions.mock.calls.slice(2).every((call) => call[0] === "fill-b")
    ).toBe(true);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIMPLE_SIGN_SYNC_POLL_MS);
    });
    expect(loadSimpleSignSubmissions).toHaveBeenCalledTimes(3);
  });
});
