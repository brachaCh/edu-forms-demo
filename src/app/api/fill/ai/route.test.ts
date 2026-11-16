import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STUDENT_PLACEHOLDER } from "@/lib/ai-student-placeholder";

const TOKEN = "A".repeat(40);
const STUDENT_NAME = "נועה כהן";
let requestId = "req-student-fill-1";

const cookiesGet = vi.fn();
const loadPendingFormFillRequest = vi.fn();
const hasValidFormFillOtpSession = vi.fn();
const assertFormFillOtpRateLimit = vi.fn();
const runAiFormFill = vi.fn();
const isSupabaseConfiguredServer = vi.fn();
const isServiceRoleConfigured = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (...args: unknown[]) => cookiesGet(...args),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfiguredServer: (...args: unknown[]) =>
    isSupabaseConfiguredServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  isServiceRoleConfigured: (...args: unknown[]) =>
    isServiceRoleConfigured(...args),
  createServiceClient: () => ({ kind: "service" }),
}));

vi.mock("@/lib/form-fill-otp-server", () => ({
  loadPendingFormFillRequest: (...args: unknown[]) =>
    loadPendingFormFillRequest(...args),
  hasValidFormFillOtpSession: (...args: unknown[]) =>
    hasValidFormFillOtpSession(...args),
  assertFormFillOtpRateLimit: (...args: unknown[]) =>
    assertFormFillOtpRateLimit(...args),
  clientIpFromRequest: () => "203.0.113.9",
}));

vi.mock("@/lib/ai-fill-form-run", () => ({
  AI_FILL_MAX_NOTES_CHARS: 2000,
  AI_FILL_MAX_EXAMPLE_CHARS: 12_000,
  runAiFormFill: (...args: unknown[]) => runAiFormFill(...args),
}));

import { POST } from "./route";

function pendingRequest(formId: string, studentName = STUDENT_NAME) {
  return {
    id: requestId,
    recipient_email: "staff@example.com",
    form_title: "טופס",
    student_name: studentName,
    form_id: formId,
    form_fill_id: "fill-1",
    status: "pending",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/fill/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.9",
    },
    body: JSON.stringify(body),
  });
}

type AiFillCall = {
  formId: string;
  studentContext?: unknown;
  exampleTemplate?: unknown;
  student_name?: unknown;
  teacherNotes?: string;
  fieldSummaries: Array<{ key: string; currentValue?: string }>;
  extraSystemLines?: string[];
  usePlaceholder?: boolean;
};

function modelBoundPayload(input: AiFillCall) {
  return JSON.stringify({
    teacherNotes: input.teacherNotes,
    fields: input.fieldSummaries.map((field) => ({
      key: field.key,
      currentValue: field.currentValue,
    })),
    extraSystemLines: input.extraSystemLines,
    studentContext: input.studentContext,
    exampleTemplate: input.exampleTemplate,
    student_name: input.student_name,
  });
}

function lastAiFillCall(): { input: AiFillCall; options: unknown } {
  expect(runAiFormFill).toHaveBeenCalled();
  return {
    input: runAiFormFill.mock.calls[0]?.[0] as AiFillCall,
    options: runAiFormFill.mock.calls[0]?.[1],
  };
}

describe("POST /api/fill/ai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestId = `req-student-fill-${crypto.randomUUID()}`;
    isSupabaseConfiguredServer.mockReturnValue(true);
    isServiceRoleConfigured.mockReturnValue(true);
    cookiesGet.mockReturnValue({ value: "otp-session-token" });
    loadPendingFormFillRequest.mockResolvedValue(pendingRequest("tachi-prep"));
    hasValidFormFillOtpSession.mockResolvedValue(true);
    assertFormFillOtpRateLimit.mockResolvedValue({ ok: true });
    runAiFormFill.mockResolvedValue({
      ok: true,
      fields: { environmental_data: "טיוטה" },
    });
  });

  it("returns 401 when the fill OTP session is missing", async () => {
    hasValidFormFillOtpSession.mockResolvedValue(false);

    const response = await POST(
      jsonRequest({
        token: TOKEN,
        teacherNotes: "תיאור קצר",
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "OTP_REQUIRED",
      maskedEmail: "s***@example.com",
    });
    expect(runAiFormFill).not.toHaveBeenCalled();
  });

  it("returns 404 for an invalid or expired link", async () => {
    loadPendingFormFillRequest.mockResolvedValue(null);

    const response = await POST(jsonRequest({ token: TOKEN }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "הקישור אינו תקין או שפג תוקפו",
    });
    expect(runAiFormFill).not.toHaveBeenCalled();
  });

  it("refuses parent questionnaires and the student interview form", async () => {
    loadPendingFormFillRequest.mockResolvedValue(
      pendingRequest("parent-questionnaire")
    );
    const parent = await POST(jsonRequest({ token: TOKEN }));
    expect(parent.status).toBe(403);
    expect(await parent.json()).toEqual({
      ok: false,
      error: "FORM_NOT_ALLOWED",
    });

    loadPendingFormFillRequest.mockResolvedValue(
      pendingRequest("student-questionnaire")
    );
    const student = await POST(jsonRequest({ token: TOKEN }));
    expect(student.status).toBe(403);
    expect(runAiFormFill).not.toHaveBeenCalled();
  });

  it("uses the form id from the token record, not a client-supplied form", async () => {
    const response = await POST(
      jsonRequest({
        token: TOKEN,
        teacherNotes: "רקע ADHD",
        fields: [
          { key: "environmental_data", currentValue: "" },
          { key: "full_name", currentValue: "שם לא אמור להישלח כמזהה" },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      fields: { environmental_data: "טיוטה" },
    });
    const { input, options } = lastAiFillCall();
    expect(input.formId).toBe("tachi-prep");
    expect(input.studentContext).toBeUndefined();
    expect(input.exampleTemplate).toBeUndefined();
    expect(input.student_name).toBeUndefined();
    expect(options).toEqual({ maxTokens: 4096 });
    const fullName = input.fieldSummaries.find((field) => field.key === "full_name");
    expect(fullName).toBeDefined();
    expect(fullName?.currentValue).toBeUndefined();
    expect(JSON.stringify(input)).not.toContain("שם לא אמור להישלח כמזהה");
    expect(assertFormFillOtpRateLimit).toHaveBeenCalledWith(
      { kind: "service" },
      `form-fill-ai:${requestId}`,
      { limit: 3, failClosed: true }
    );
    expect(assertFormFillOtpRateLimit).toHaveBeenCalledWith(
      { kind: "service" },
      "form-fill-ai-ip:203.0.113.9",
      { limit: 6, failClosed: true }
    );
  });

  it("omits identifying currentValue and scrubs the student name before the model", async () => {
    const response = await POST(
      jsonRequest({
        token: TOKEN,
        teacherNotes:
          "ולנועה מתקשה. נוֹעָה כהן בחשבון. נועה־כהן בקריאה.",
        fields: [
          { key: "full_name", currentValue: "נועה כהן" },
          {
            key: "environmental_data",
            currentValue: "רקע של נועה כהן ולנועה בבית",
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    const { input } = lastAiFillCall();
    expect(input.formId).toBe("tachi-prep");
    const fullName = input.fieldSummaries.find((field) => field.key === "full_name");
    expect(fullName?.currentValue).toBeUndefined();

    const passed = modelBoundPayload(input);
    expect(passed).not.toContain("נועה");
    expect(passed).not.toContain("כהן");
    expect(passed).not.toContain("ולנועה");
    expect(passed).not.toContain("נוֹעָה");
    expect(passed).not.toContain("נועה־כהן");
    expect(passed).not.toContain("«התלמיד/ה»");
    expect(input.teacherNotes).toMatch(/\[\[NAME_\d+\]\]/);
    expect(input.usePlaceholder).toBe(true);
    expect(input.extraSystemLines?.join(" ")).toContain(STUDENT_PLACEHOLDER);
    expect(input.extraSystemLines?.join(" ")).not.toContain("נועה");
    expect(input.studentContext).toBeUndefined();
    expect(input.exampleTemplate).toBeUndefined();
  });

  it("masks English spellings, hyphenated surnames and possessives, then restores locally", async () => {
    loadPendingFormFillRequest.mockResolvedValue(
      pendingRequest("tachi-prep", "נועה לוי-כהן")
    );
    runAiFormFill.mockImplementation(async (rawInput: unknown) => {
      const input = rawInput as AiFillCall;
      const env = input.fieldSummaries.find(
        (field) => field.key === "environmental_data"
      );
      return {
        ok: true,
        fields: {
          environmental_data: `${STUDENT_PLACEHOLDER} copied ${input.teacherNotes} // ${env?.currentValue ?? ""}`,
        },
      };
    });

    const notes = "Noa's book, Cohen. Levi-Cohen and לוי-כהן. נועה כתבה.";
    const current =
      "Noa's homework, Cohen’s notes, Levi-Cohen, כהן and לוי";

    const response = await POST(
      jsonRequest({
        token: TOKEN,
        teacherNotes: notes,
        fields: [
          { key: "full_name", currentValue: "נועה לוי-כהן" },
          { key: "environmental_data", currentValue: current },
        ],
      })
    );

    expect(response.status).toBe(200);
    const { input } = lastAiFillCall();
    const passed = modelBoundPayload(input);
    expect(passed).not.toContain("נועה");
    expect(passed).not.toContain("כהן");
    expect(passed).not.toContain("לוי");
    expect(passed).not.toMatch(/\bNoa\b/i);
    expect(passed).not.toMatch(/\bCohen\b/i);
    expect(passed).not.toMatch(/\bLevi\b/i);
    expect(passed).not.toContain("«התלמיד/ה»");
    expect(input.teacherNotes).toMatch(/\[\[NAME_\d+\]\]/);
    expect(input.teacherNotes).toMatch(/\[\[NAME_\d+\]\]'s book/);
    expect(input.usePlaceholder).toBe(true);
    expect(input.studentContext).toBeUndefined();
    expect(input.exampleTemplate).toBeUndefined();

    const envField = input.fieldSummaries.find(
      (field) => field.key === "environmental_data"
    );
    expect(envField?.currentValue).toMatch(/\[\[NAME_\d+\]\]'s homework/);
    expect(envField?.currentValue).toMatch(/\[\[NAME_\d+\]\]’s notes/);

    const body = (await response.json()) as {
      ok: boolean;
      fields: { environmental_data: string };
    };
    expect(body.ok).toBe(true);
    expect(body.fields.environmental_data).toContain("נועה copied");
    expect(body.fields.environmental_data).toContain("Noa's book");
    expect(body.fields.environmental_data).toContain("Cohen");
    expect(body.fields.environmental_data).toContain("Levi-Cohen");
    expect(body.fields.environmental_data).toContain("לוי-כהן");
    expect(body.fields.environmental_data).toContain("Noa's homework");
    expect(body.fields.environmental_data).toContain("Cohen’s notes");
    expect(body.fields.environmental_data).not.toContain(STUDENT_PLACEHOLDER);
    expect(body.fields.environmental_data).not.toMatch(/\[\[NAME_\d+\]\]/);
  });

  it("drops parent and guardian current values instead of sending them to the model", async () => {
    loadPendingFormFillRequest.mockResolvedValue(
      pendingRequest("referral-questionnaire")
    );

    const response = await POST(
      jsonRequest({
        token: TOKEN,
        teacherNotes: "נועה מתקשה בקריאה",
        fields: [
          { key: "father_name", currentValue: "דוד לוי-כהן" },
          { key: "mother_name", currentValue: "רותי כהן" },
          { key: "student_description", currentValue: "נועה משתפת בכיתה" },
        ],
      })
    );

    expect(response.status).toBe(200);
    const { input } = lastAiFillCall();
    expect(
      input.fieldSummaries.find((field) => field.key === "father_name")
        ?.currentValue
    ).toBeUndefined();
    expect(
      input.fieldSummaries.find((field) => field.key === "mother_name")
        ?.currentValue
    ).toBeUndefined();
    const description = input.fieldSummaries.find(
      (field) => field.key === "student_description"
    );
    expect(description?.currentValue).toMatch(/\[\[NAME_\d+\]\]/);
    expect(description?.currentValue).not.toContain("נועה");
    const passed = modelBoundPayload(input);
    expect(passed).not.toContain("דוד");
    expect(passed).not.toContain("רותי");
    expect(passed).not.toContain("נועה");
    expect(passed).not.toContain("כהן");
  });

  it("does not import the old name scrubber", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/fill/ai/route.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/scrubStudentNameForAi/);
    expect(source).toMatch(/prepareFillFormForAnthropic/);
    expect(source).toMatch(/restoreFillFormFields/);
  });

  it("returns 429 when the persisted per-link limit is exceeded", async () => {
    assertFormFillOtpRateLimit.mockImplementation(
      async (_client: unknown, bucket: unknown) => {
        if (String(bucket).startsWith("form-fill-ai-ip:")) {
          return { ok: true };
        }
        if (String(bucket) === `form-fill-ai:${requestId}`) {
          return { ok: false, retryAfterSec: 33 };
        }
        return { ok: true };
      }
    );

    const response = await POST(jsonRequest({ token: TOKEN }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("33");
    expect(await response.json()).toEqual({
      ok: false,
      error: "RATE_LIMITED",
    });
    expect(runAiFormFill).not.toHaveBeenCalled();
  });

  it("does not increment the per-link counter when the IP limiter blocks", async () => {
    assertFormFillOtpRateLimit.mockImplementation(
      async (_client: unknown, bucket: unknown) => {
        if (String(bucket).startsWith("form-fill-ai-ip:")) {
          return { ok: false, retryAfterSec: 40 };
        }
        return { ok: true };
      }
    );

    const response = await POST(jsonRequest({ token: TOKEN }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("40");
    expect(await response.json()).toEqual({
      ok: false,
      error: "RATE_LIMITED",
    });
    expect(runAiFormFill).not.toHaveBeenCalled();
    expect(assertFormFillOtpRateLimit).toHaveBeenCalledWith(
      { kind: "service" },
      "form-fill-ai-ip:203.0.113.9",
      { limit: 6, failClosed: true }
    );
    expect(assertFormFillOtpRateLimit).not.toHaveBeenCalledWith(
      { kind: "service" },
      `form-fill-ai:${requestId}`,
      { limit: 3, failClosed: true }
    );
    expect(assertFormFillOtpRateLimit).toHaveBeenCalledTimes(1);
  });

  it("does not call the model when the rate limit table is missing", async () => {
    assertFormFillOtpRateLimit.mockResolvedValueOnce({
      ok: false,
      retryAfterSec: 60,
      unavailable: true,
    });

    const response = await POST(jsonRequest({ token: TOKEN }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "RATE_LIMIT_UNAVAILABLE",
    });
    expect(runAiFormFill).not.toHaveBeenCalled();
  });

  it("does not call the model when the rate limit check errors", async () => {
    assertFormFillOtpRateLimit.mockRejectedValueOnce(
      new Error("Could not find the table in the schema cache")
    );

    const response = await POST(jsonRequest({ token: TOKEN }));
    expect(response.status).toBe(503);
    expect(runAiFormFill).not.toHaveBeenCalled();
  });

  it("sends teacher-added TACHI/TLA goal rows to the model and keeps names off the payload", async () => {
    loadPendingFormFillRequest.mockResolvedValue(
      pendingRequest("tachi-integrative")
    );
    runAiFormFill.mockResolvedValue({
      ok: true,
      fields: {
        "tbl_tachi-integrative-goals_r4_goal": "טיוטה ליעד נוסף",
        "tbl_tachi-integrative-goals_r5_teacher": "טיוטה למורה",
      },
    });

    const response = await POST(
      jsonRequest({
        token: TOKEN,
        teacherNotes: "לתלמיד נועה כהן יש עוד שני יעדים",
        fields: [
          { key: "full_name", currentValue: "נועה כהן" },
          { key: "tbl_tachi-integrative-goals_rows", currentValue: "6" },
          {
            key: "tbl_tachi-integrative-goals_r4_goal",
            currentValue: "יעד של נועה כהן שהמורה הוסיפה",
          },
          { key: "tbl_tachi-integrative-goals_r5_teacher", currentValue: "" },
          { key: "secret_student_notes", currentValue: "לא אמור להישלח" },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      fields: {
        "tbl_tachi-integrative-goals_r4_goal": "טיוטה ליעד נוסף",
        "tbl_tachi-integrative-goals_r5_teacher": "טיוטה למורה",
      },
    });

    const { input } = lastAiFillCall();
    expect(input.formId).toBe("tachi-integrative");
    expect(input.studentContext).toBeUndefined();
    expect(input.exampleTemplate).toBeUndefined();
    expect(input.student_name).toBeUndefined();

    const keys = input.fieldSummaries.map((field) => field.key);
    expect(keys).toContain("tbl_tachi-integrative-goals_r4_goal");
    expect(keys).toContain("tbl_tachi-integrative-goals_r5_teacher");
    expect(keys).not.toContain("secret_student_notes");

    const extraGoal = input.fieldSummaries.find(
      (field) => field.key === "tbl_tachi-integrative-goals_r4_goal"
    );
    const fullName = input.fieldSummaries.find((field) => field.key === "full_name");
    expect(fullName?.currentValue).toBeUndefined();
    expect(extraGoal?.currentValue).toBeTruthy();
    expect(extraGoal?.currentValue).toMatch(/\[\[NAME_\d+\]\]/);
    expect(extraGoal?.currentValue).not.toContain("נועה");

    const passed = modelBoundPayload(input);
    expect(passed).not.toContain("נועה");
    expect(passed).not.toContain("כהן");
    expect(passed).not.toContain("לא אמור להישלח");
    expect(passed).not.toContain("«התלמיד/ה»");
  });

  it("sends extra TLA goal rows when only extra cell keys are posted", async () => {
    loadPendingFormFillRequest.mockResolvedValue(pendingRequest("tla"));
    runAiFormFill.mockResolvedValue({
      ok: true,
      fields: { "tbl_tachi-goals_r5_goal": "טיוטה" },
    });

    const response = await POST(
      jsonRequest({
        token: TOKEN,
        fields: [
          { key: "tbl_tachi-goals_r5_goal", currentValue: "יעד תל״א נוסף" },
        ],
      })
    );

    expect(response.status).toBe(200);
    const { input } = lastAiFillCall();
    expect(input.formId).toBe("tla");
    const keys = input.fieldSummaries.map((field) => field.key);
    expect(keys).toContain("tbl_tachi-goals_r5_goal");
    expect(keys).toContain("tbl_tachi-goals_r5_methods");
    const extra = input.fieldSummaries.find(
      (field) => field.key === "tbl_tachi-goals_r5_goal"
    );
    expect(extra?.currentValue).toBe("יעד תל״א נוסף");
  });
});
