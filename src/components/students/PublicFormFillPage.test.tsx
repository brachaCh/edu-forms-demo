/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadPublicFormFill = vi.fn();
const savePublicFormFill = vi.fn();
const requestFormFillOtp = vi.fn();
const verifyFormFillOtp = vi.fn();

vi.mock("@/lib/form-fill-request", () => ({
  loadPublicFormFill: (...args: unknown[]) => loadPublicFormFill(...args),
  savePublicFormFill: (...args: unknown[]) => savePublicFormFill(...args),
  requestFormFillOtp: (...args: unknown[]) => requestFormFillOtp(...args),
  verifyFormFillOtp: (...args: unknown[]) => verifyFormFillOtp(...args),
}));

vi.mock("@/lib/form-schemas", () => ({
  getFormSchema: () => ({
    id: "parent-questionnaire",
    title: "שאלון בדיקה",
    folder: "test",
    categoryFolder: "test",
    sections: [
      {
        title: "כללי",
        fields: [{ key: "notes", label: "הערות", type: "textarea" }],
      },
    ],
  }),
  formSupportsVoiceRecording: () => false,
}));

vi.mock("@/lib/form-ai-fill", () => ({
  formSupportsPublicLinkAiFill: () => false,
}));

vi.mock("@/components/students/PublicFormAiFillPanel", () => ({
  PublicFormAiFillPanel: () => null,
}));

import { PublicFormFillPage } from "./PublicFormFillPage";

const TOKEN = "fill-token-test-bbbbbbbbbbbbbbbbbb";

const serverRequest = {
  formId: "parent-questionnaire",
  formTitle: "שאלון בדיקה",
  studentName: "",
  data: { notes: "last saved" },
  expiresAt: "2099-01-01T00:00:00.000Z",
  status: "pending" as const,
};

function typeOtpAndVerify(code = "123456") {
  fireEvent.change(screen.getByLabelText(/קוד בן 6 ספרות/), {
    target: { value: code },
  });
  fireEvent.submit(screen.getByLabelText(/קוד בן 6 ספרות/).closest("form")!);
}

describe("PublicFormFillPage OTP expiry (TZ-94)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    loadPublicFormFill.mockReset();
    savePublicFormFill.mockReset();
    requestFormFillOtp.mockReset();
    verifyFormFillOtp.mockReset();
    requestFormFillOtp.mockResolvedValue({ ok: true, maskedEmail: "p***@example.com" });
    verifyFormFillOtp.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps typed values and retries draft save once after OTP expires", async () => {
    loadPublicFormFill
      .mockResolvedValueOnce({ ok: true, data: serverRequest })
      .mockResolvedValueOnce({
        ok: false,
        error: "OTP_REQUIRED",
        maskedEmail: "p***@example.com",
      })
      .mockResolvedValueOnce({ ok: true, data: serverRequest });
    savePublicFormFill
      .mockResolvedValueOnce({ ok: false, error: "OTP_REQUIRED" })
      .mockResolvedValueOnce({ ok: true });

    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "typed after last save" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת טיוטה" }));

    await screen.findByRole("heading", { name: "אימות למילוי הטופס" });
    expect(savePublicFormFill).toHaveBeenCalledTimes(1);
    expect(savePublicFormFill).toHaveBeenLastCalledWith(
      TOKEN,
      expect.objectContaining({ notes: "typed after last save" }),
      false
    );

    typeOtpAndVerify();

    await waitFor(() => {
      expect(savePublicFormFill).toHaveBeenCalledTimes(2);
    });
    expect(savePublicFormFill).toHaveBeenLastCalledWith(
      TOKEN,
      expect.objectContaining({ notes: "typed after last save" }),
      false
    );
    expect(verifyFormFillOtp).toHaveBeenCalledTimes(1);
    expect(await screen.findByDisplayValue("typed after last save")).toBeTruthy();
    expect(screen.getByText("הטיוטה נשמרה")).toBeTruthy();
    expect(sessionStorage.getItem(`form-fill-otp-recovery:${TOKEN}`)).toBeNull();
  });

  it("keeps typed values and retries finish-and-send once after OTP expires", async () => {
    loadPublicFormFill
      .mockResolvedValueOnce({ ok: true, data: serverRequest })
      .mockResolvedValueOnce({
        ok: false,
        error: "OTP_REQUIRED",
        maskedEmail: "p***@example.com",
      })
      .mockResolvedValueOnce({ ok: true, data: serverRequest });
    savePublicFormFill
      .mockResolvedValueOnce({ ok: false, error: "OTP_REQUIRED" })
      .mockResolvedValueOnce({ ok: true });

    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "submit typed after last save" } });
    fireEvent.click(screen.getByRole("button", { name: "סיום ושליחה" }));

    await screen.findByRole("heading", { name: "אימות למילוי הטופס" });
    expect(savePublicFormFill).toHaveBeenCalledTimes(1);
    expect(savePublicFormFill).toHaveBeenLastCalledWith(
      TOKEN,
      expect.objectContaining({ notes: "submit typed after last save" }),
      true
    );

    typeOtpAndVerify();

    await waitFor(() => {
      expect(savePublicFormFill).toHaveBeenCalledTimes(2);
    });
    expect(savePublicFormFill).toHaveBeenLastCalledWith(
      TOKEN,
      expect.objectContaining({ notes: "submit typed after last save" }),
      true
    );
    expect(await screen.findByText("הטופס התקבל בהצלחה")).toBeTruthy();
    expect(savePublicFormFill).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(`form-fill-otp-recovery:${TOKEN}`)).toBeNull();
  });

  it("does not let an in-flight autosave overwrite a parked submit", async () => {
    let phase: "init" | "otp" | "ready" = "init";
    loadPublicFormFill.mockImplementation(async () => {
      if (phase === "init") {
        phase = "otp";
        return { ok: true, data: serverRequest };
      }
      if (phase === "ready") {
        return { ok: true, data: serverRequest };
      }
      return {
        ok: false,
        error: "OTP_REQUIRED",
        maskedEmail: "p***@example.com",
      };
    });
    verifyFormFillOtp.mockImplementation(async () => {
      phase = "ready";
      return { ok: true };
    });

    let resolveAutosave: (value: { ok: boolean; error?: string }) => void = () =>
      undefined;
    const autosaveResult = new Promise<{ ok: boolean; error?: string }>(
      (resolve) => {
        resolveAutosave = resolve;
      }
    );
    const saveCalls: Array<{ data: Record<string, string>; complete: boolean }> =
      [];
    savePublicFormFill.mockImplementation(
      async (
        _token: string,
        data: Record<string, string>,
        complete: boolean
      ) => {
        saveCalls.push({ data, complete });
        const autosaves = saveCalls.filter((call) => !call.complete);
        const submits = saveCalls.filter((call) => call.complete);
        if (!complete && autosaves.length === 1) {
          return autosaveResult;
        }
        if (complete && submits.length === 1) {
          return { ok: false, error: "OTP_REQUIRED" };
        }
        return { ok: true };
      }
    );

    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "older autosave snapshot" } });
    await waitFor(() => expect(savePublicFormFill).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(savePublicFormFill).toHaveBeenLastCalledWith(
      TOKEN,
      expect.objectContaining({ notes: "older autosave snapshot" }),
      false
    );

    fireEvent.change(notes, { target: { value: "newest submit" } });
    fireEvent.click(screen.getByRole("button", { name: "סיום ושליחה" }));
    await screen.findByRole("heading", { name: "אימות למילוי הטופס" });
    expect(saveCalls.some((call) => call.complete)).toBe(true);

    resolveAutosave({ ok: false, error: "OTP_REQUIRED" });
    await waitFor(() => {
      expect(saveCalls.some((call) => !call.complete)).toBe(true);
    });

    typeOtpAndVerify();

    await waitFor(() => {
      expect(saveCalls.filter((call) => call.complete).length).toBe(2);
    });
    expect(saveCalls.filter((call) => call.complete).at(-1)?.data.notes).toBe(
      "newest submit"
    );
    expect(await screen.findByText("הטופס התקבל בהצלחה")).toBeTruthy();
    expect(saveCalls.filter((call) => call.complete).length).toBe(2);
  });
});

describe("typing during in-flight save (PR #110 follow-up)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    loadPublicFormFill.mockReset();
    savePublicFormFill.mockReset();
    requestFormFillOtp.mockReset();
    verifyFormFillOtp.mockReset();
    requestFormFillOtp.mockResolvedValue({ ok: true, maskedEmail: "p***@example.com" });
    verifyFormFillOtp.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves values typed during in-flight save when OTP_REQUIRED is returned", async () => {
    let resolveSave: (value: { ok: boolean; error?: string }) => void = () => undefined;
    const saveInFlight = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      resolveSave = resolve;
    });

    let phase: "init" | "otp" | "ready" = "init";
    loadPublicFormFill.mockImplementation(async () => {
      if (phase === "init") {
        phase = "otp";
        return { ok: true, data: serverRequest };
      }
      if (phase === "ready") {
        return { ok: true, data: serverRequest };
      }
      return { ok: false, error: "OTP_REQUIRED", maskedEmail: "p***@example.com" };
    });
    verifyFormFillOtp.mockImplementation(async () => {
      phase = "ready";
      return { ok: true };
    });

    const saveCalls: Array<{ data: Record<string, string>; complete: boolean }> = [];
    savePublicFormFill.mockImplementation(
      async (_token: string, data: Record<string, string>, complete: boolean) => {
        saveCalls.push({ data: { ...data }, complete });
        if (complete && saveCalls.filter((c) => c.complete).length === 1) {
          return saveInFlight;
        }
        return { ok: true };
      }
    );

    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "value at request start" } });
    fireEvent.click(screen.getByRole("button", { name: "סיום ושליחה" }));

    await waitFor(() => expect(saveCalls.length).toBe(1));
    expect(saveCalls[0].data.notes).toBe("value at request start");

    fireEvent.change(notes, { target: { value: "typed while in flight" } });
    await new Promise((r) => setTimeout(r, 50));

    resolveSave({ ok: false, error: "OTP_REQUIRED" });

    await screen.findByRole("heading", { name: "אימות למילוי הטופס" });

    typeOtpAndVerify();

    await waitFor(() => expect(saveCalls.filter((c) => c.complete).length).toBe(2));
    const retryCall = saveCalls.filter((c) => c.complete).at(-1)!;
    expect(retryCall.data.notes).toBe("typed while in flight");
    expect(await screen.findByText("הטופס התקבל בהצלחה")).toBeTruthy();
  });

  it("parked recovery from typing during autosave has the newer value", async () => {
    let resolveSave: (value: { ok: boolean; error?: string }) => void = () => undefined;
    const saveInFlight = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      resolveSave = resolve;
    });

    let phase: "init" | "otp" | "ready" = "init";
    loadPublicFormFill.mockImplementation(async () => {
      if (phase === "init") {
        phase = "otp";
        return { ok: true, data: serverRequest };
      }
      if (phase === "ready") {
        return { ok: true, data: serverRequest };
      }
      return { ok: false, error: "OTP_REQUIRED", maskedEmail: "p***@example.com" };
    });
    verifyFormFillOtp.mockImplementation(async () => {
      phase = "ready";
      return { ok: true };
    });

    const saveCalls: Array<{ data: Record<string, string>; complete: boolean }> = [];
    savePublicFormFill.mockImplementation(
      async (_token: string, data: Record<string, string>, complete: boolean) => {
        saveCalls.push({ data: { ...data }, complete });
        if (!complete && saveCalls.filter((c) => !c.complete).length === 1) {
          return saveInFlight;
        }
        return { ok: true };
      }
    );

    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "value at autosave start" } });

    await waitFor(() => expect(saveCalls.length).toBe(1), { timeout: 3000 });
    expect(saveCalls[0].complete).toBe(false);
    expect(saveCalls[0].data.notes).toBe("value at autosave start");

    fireEvent.change(notes, { target: { value: "typed during autosave" } });
    await new Promise((r) => setTimeout(r, 50));

    resolveSave({ ok: false, error: "OTP_REQUIRED" });

    await screen.findByRole("heading", { name: "אימות למילוי הטופס" });

    const raw = sessionStorage.getItem(`form-fill-otp-recovery:${TOKEN}`);
    expect(raw).not.toBeNull();
    const parked = JSON.parse(raw!);
    expect(parked.data.notes).toBe("typed during autosave");
  });
});

describe("reviewer adversarial (PR #110)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    loadPublicFormFill.mockReset();
    savePublicFormFill.mockReset();
    requestFormFillOtp.mockReset();
    verifyFormFillOtp.mockReset();
    requestFormFillOtp.mockResolvedValue({ ok: true, maskedEmail: "p***@example.com" });
  });

  afterEach(() => {
    cleanup();
  });

  it("lingering parked submit (restored on load without verify) must not auto-submit after a later autosave OTP expiry", async () => {
    sessionStorage.setItem(
      `form-fill-otp-recovery:${TOKEN}`,
      JSON.stringify({ data: { notes: "old parked" }, pendingAction: "submit" })
    );
    let phase: "ok" | "otp" = "ok";
    loadPublicFormFill.mockImplementation(async () =>
      phase === "ok"
        ? { ok: true, data: serverRequest }
        : { ok: false, error: "OTP_REQUIRED", maskedEmail: "p***@example.com" }
    );
    verifyFormFillOtp.mockImplementation(async () => {
      phase = "ok";
      return { ok: true };
    });
    let n = 0;
    savePublicFormFill.mockImplementation(
      async (_t: string, _d: unknown, complete: boolean) => {
        n += 1;
        if (!complete && n === 1) {
          phase = "otp";
          return { ok: false, error: "OTP_REQUIRED" };
        }
        return { ok: true };
      }
    );
    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "newest typed" } });
    await screen.findByRole("heading", { name: "אימות למילוי הטופס" }, {
      timeout: 4000,
    });
    typeOtpAndVerify();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const calls = savePublicFormFill.mock.calls.map((call) => ({
      d: call[1],
      complete: call[2],
    }));
    expect(calls.some((call) => call.complete)).toBe(false);
  });

  it("normal path: autosave without OTP expiry makes exactly one draft save, no gate", async () => {
    loadPublicFormFill.mockResolvedValue({ ok: true, data: serverRequest });
    savePublicFormFill.mockResolvedValue({ ok: true });
    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "hello" } });
    await waitFor(() => expect(savePublicFormFill).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(savePublicFormFill).toHaveBeenLastCalledWith(
      TOKEN,
      expect.objectContaining({ notes: "hello" }),
      false
    );
    fireEvent.click(screen.getByRole("button", { name: "סיום ושליחה" }));
    expect(await screen.findByText("הטופס התקבל בהצלחה")).toBeTruthy();
    expect(savePublicFormFill).toHaveBeenCalledTimes(2);
    expect(verifyFormFillOtp).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(`form-fill-otp-recovery:${TOKEN}`)).toBeNull();
  });

  it("OTP enforced: wrong code does not retry the parked submit", async () => {
    loadPublicFormFill
      .mockResolvedValueOnce({ ok: true, data: serverRequest })
      .mockResolvedValue({
        ok: false,
        error: "OTP_REQUIRED",
        maskedEmail: "p***@example.com",
      });
    savePublicFormFill.mockResolvedValue({ ok: false, error: "OTP_REQUIRED" });
    verifyFormFillOtp.mockResolvedValue({ ok: false, error: "OTP_INVALID" });
    render(<PublicFormFillPage token={TOKEN} />);
    const notes = await screen.findByLabelText(/הערות/);
    fireEvent.change(notes, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "סיום ושליחה" }));
    await screen.findByRole("heading", { name: "אימות למילוי הטופס" });
    typeOtpAndVerify("000000");
    await screen.findByText(/הקוד שגוי/);
    expect(savePublicFormFill).toHaveBeenCalledTimes(1);
    const raw = sessionStorage.getItem(`form-fill-otp-recovery:${TOKEN}`);
    expect(JSON.parse(raw!)).toEqual({
      data: { notes: "x" },
      pendingAction: "submit",
    });
    expect(Object.keys(sessionStorage).every((key) => key.endsWith(TOKEN))).toBe(
      true
    );
  });
});
