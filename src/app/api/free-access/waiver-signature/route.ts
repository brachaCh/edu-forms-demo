import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { CONFIDENTIALITY_WAIVER_FORM_ID } from "@/lib/confidentiality-waiver-gate";
import {
  createServiceClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfiguredServer } from "@/lib/supabase/server";
import { parentFacingOrigin } from "@/lib/app-origin";
import { parseJsonBody, waiverSignatureBodySchema } from "@/lib/validation";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FREE_ACCESS_INSTITUTION_CODE = "free-access-demo";
const FREE_ACCESS_STUDENT_NAME = "תלמיד דמו — כניסה חופשית";
const EXPIRY_DAYS = 30;
const MAX_SNAPSHOT_CHARS = 700_000;
const RESEND_TEST_FROM = "פרוטוקל <onboarding@resend.dev>";
const PROJECT_FROM = "פרוטוקל <noreply@example.com>";

const ALLOWED_FIELD_KEYS = new Set(["father_signature", "mother_signature"]);

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveFrom(): string {
  const forceTest =
    (process.env.RESEND_FORCE_TEST_FROM ?? "").trim().toLowerCase() === "true";
  if (forceTest) return RESEND_TEST_FROM;
  const explicit = (process.env.RESEND_FROM_EMAIL ?? "").trim();
  if (explicit) {
    if (/onboarding@resend\.dev/i.test(explicit)) return RESEND_TEST_FROM;
    if (!explicit.includes("<")) return `פרוטוקל <${explicit}>`;
    return explicit;
  }
  return PROJECT_FROM;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function sendSignatureEmail(args: {
  to: string;
  formTitle: string;
  studentName: string;
  fieldLabel: string;
  link: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, detail: "חסר מפתח Resend בשרת" };
  }

  const from = resolveFrom();
  const safeTitle = escapeHtml(args.formTitle);
  const safeStudent = escapeHtml(args.studentName);
  const safeLabel = escapeHtml(args.fieldLabel);
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
    <h2>${safeTitle}</h2>
    ${safeStudent ? `<p><strong>עבור:</strong> ${safeStudent}</p>` : ""}
    <p>התבקשת לחתום בשדה: <strong>${safeLabel}</strong></p>
    <p><a href="${args.link}" style="display:inline-block;padding:12px 22px;background:#2f7d6d;color:white;text-decoration:none;border-radius:8px">פתיחת הטופס וחתימה</a></p>
    <p style="color:#64748b;font-size:13px">הקישור אישי, חד־פעמי ותקף למשך ${EXPIRY_DAYS} ימים. (כניסה חופשית — התנסות)</p>
  </div>`;
  const text = `${args.formTitle}\n${args.studentName}\nחתימה: ${args.fieldLabel}\n${args.link}\nהקישור תקף למשך ${EXPIRY_DAYS} ימים.`;

  const response = await Promise.resolve(new Response(JSON.stringify({ error: "DEMO_DISABLED" }), { status: 503, headers: { "Content-Type": "application/json" } }));

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[free-access-waiver-signature] resend", response.status, detail);
    return { ok: false, detail: detail || `Resend ${response.status}` };
  }
  return { ok: true };
}

async function ensureFreeAccessStudent(
  db: ReturnType<typeof createServiceClient>
): Promise<{ ok: true; studentId: string } | { ok: false; error: string }> {
  let institutionId: string | null = null;

  const { data: existingInst, error: instFindError } = await db
    .from("institutions")
    .select("id")
    .eq("code", FREE_ACCESS_INSTITUTION_CODE)
    .maybeSingle();
  if (instFindError) {
    return { ok: false, error: `מוסד דמו: ${instFindError.message}` };
  }
  if (existingInst?.id) {
    institutionId = existingInst.id as string;
  } else {
    const { data: createdInst, error: instCreateError } = await db
      .from("institutions")
      .insert({
        code: FREE_ACCESS_INSTITUTION_CODE,
        name: "כניסה חופשית — דמו",
        school_name: "בית ספר דמו",
      })
      .select("id")
      .single();
    if (instCreateError || !createdInst?.id) {
      return {
        ok: false,
        error: `יצירת מוסד דמו נכשלה: ${instCreateError?.message ?? ""}`,
      };
    }
    institutionId = createdInst.id as string;
  }

  const { data: existingStudent, error: studentFindError } = await db
    .from("students")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("full_name", FREE_ACCESS_STUDENT_NAME)
    .maybeSingle();
  if (studentFindError) {
    return { ok: false, error: `תלמיד דמו: ${studentFindError.message}` };
  }
  if (existingStudent?.id) {
    return { ok: true, studentId: existingStudent.id as string };
  }

  const { data: createdStudent, error: studentCreateError } = await db
    .from("students")
    .insert({
      institution_id: institutionId,
      category: "schools",
      full_name: FREE_ACCESS_STUDENT_NAME,
      father_name: "אב דמו",
      mother_name: "אם דמו",
      status: "integration",
      class_name: "כיתה דמו",
      notes: "תלמיד לדמו של כניסה חופשית — חתימת ויתור סודיות",
    })
    .select("id")
    .single();
  if (studentCreateError || !createdStudent?.id) {
    return {
      ok: false,
      error: `יצירת תלמיד דמו נכשלה: ${studentCreateError?.message ?? ""}`,
    };
  }
  return { ok: true, studentId: createdStudent.id as string };
}

export async function GET(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "השרת אינו מוגדר לשליחת חתימות" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const fillId = cleanString(url.searchParams.get("fillId"), 60);
  if (!UUID_RE.test(fillId)) {
    return NextResponse.json(
      { ok: false, error: "מזהה טופס אינו תקין" },
      { status: 400 }
    );
  }

  try {
    const db = createServiceClient();
    const { data: fill, error } = await db
      .from("student_form_fills")
      .select("id, form_id, data")
      .eq("id", fillId)
      .eq("form_id", CONFIDENTIALITY_WAIVER_FORM_ID)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    if (!fill) {
      return NextResponse.json(
        { ok: false, error: "הטופס לא נמצא" },
        { status: 404 }
      );
    }
    const raw =
      fill.data && typeof fill.data === "object"
        ? (fill.data as Record<string, unknown>)
        : {};
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      data[key] = String(value ?? "");
    }
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("[free-access-waiver-signature] GET", err);
    return NextResponse.json(
      { ok: false, error: "טעינת החתימות נכשלה" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfiguredServer() || !isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "השרת אינו מוגדר לשליחת חתימות" },
      { status: 503 }
    );
  }

  const parsed = await parseJsonBody(request, waiverSignatureBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "בקשה לא תקינה" },
      { status: 400 }
    );
  }

  const email = parsed.data.email;
  const formTitle = parsed.data.formTitle;
  const studentName = parsed.data.studentName ?? "";
  const snapshotHtml = parsed.data.snapshotHtml;
  const formData = parsed.data.formData ?? {};
  const rawAssignments = parsed.data.assignments ?? [];
  const origin = parentFacingOrigin(request);

  if (!formTitle) {
    return NextResponse.json(
      { ok: false, error: "פרטי השליחה אינם תקינים" },
      { status: 400 }
    );
  }
  if (!snapshotHtml || snapshotHtml.length > MAX_SNAPSHOT_CHARS) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "הטופס כבד מדי או ריק לשליחה לחתימה. נסו שוב בלי תמונות גדולות.",
      },
      { status: 413 }
    );
  }

  const assignments: Array<{
    email: string;
    fieldKey: string;
    fieldLabel: string;
  }> = [];
  for (const item of rawAssignments) {
    const fieldKey = item.fieldKey;
    const fieldLabel = item.fieldLabel;
    const assignmentEmail =
      (item.email ?? "").trim().toLowerCase() || email;
    if (!ALLOWED_FIELD_KEYS.has(fieldKey) || !fieldLabel) {
      return NextResponse.json(
        { ok: false, error: "שדה חתימה אינו מורשה בכניסה חופשית" },
        { status: 400 }
      );
    }
    if (assignmentEmail !== email) {
      return NextResponse.json(
        {
          ok: false,
          error: "בכניסה חופשית אפשר לשלוח לחתימה רק למייל שנרשמתם איתו",
        },
        { status: 400 }
      );
    }
    assignments.push({ email, fieldKey, fieldLabel });
  }

  if (assignments.length === 0) {
    // ברירת מחדל — שני שדות ההורים למייל הסשן
    assignments.push(
      { email, fieldKey: "father_signature", fieldLabel: "חתימת האב" },
      { email, fieldKey: "mother_signature", fieldLabel: "חתימת האם" }
    );
  }

  const pairKeys = assignments.map((a) => `${a.fieldKey}\0${a.email}`);
  if (new Set(pairKeys).size !== pairKeys.length) {
    return NextResponse.json(
      { ok: false, error: "אותה כתובת כבר משויכת לאותו שדה חתימה" },
      { status: 400 }
    );
  }

  const dataToSave: Record<string, string> = {};
  for (const [key, value] of Object.entries(formData)) {
    if (ALLOWED_FIELD_KEYS.has(key)) continue; // חתימות מגיעות רק מקישורי המייל
    dataToSave[key] = String(value ?? "");
  }

  try {
    const db = createServiceClient();
    const student = await ensureFreeAccessStudent(db);
    if (!student.ok) {
      return NextResponse.json(
        { ok: false, error: student.error },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();
    const { data: fill, error: fillError } = await db
      .from("student_form_fills")
      .insert({
        student_id: student.studentId,
        form_id: CONFIDENTIALITY_WAIVER_FORM_ID,
        data: dataToSave,
        status: "saved",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (fillError || !fill?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: `שמירת טיוטת הוויתור בשרת נכשלה: ${fillError?.message ?? ""}`,
        },
        { status: 500 }
      );
    }

    const formFillId = fill.id as string;
    const expiresAt = new Date(
      Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    for (const fieldKey of [...new Set(assignments.map((a) => a.fieldKey))]) {
      await db
        .from("form_signature_requests")
        .update({ status: "revoked" })
        .eq("form_fill_id", formFillId)
        .eq("signature_field_key", fieldKey)
        .eq("status", "pending");
    }

    for (const assignment of assignments) {
      const token = randomToken();
      const hash = tokenHash(token);
      const { error: insertError } = await db
        .from("form_signature_requests")
        .insert({
          form_fill_id: formFillId,
          recipient_email: assignment.email,
          signature_field_key: assignment.fieldKey,
          signature_field_label: assignment.fieldLabel,
          form_title: formTitle,
          student_name: studentName,
          snapshot_html: snapshotHtml,
          token_hash: hash,
          expires_at: expiresAt,
        });
      if (insertError) {
        return NextResponse.json(
          {
            ok: false,
            error: `יצירת קישור החתימה נכשלה: ${insertError.message}`,
          },
          { status: 500 }
        );
      }

      const link = `${origin}/sign/${encodeURIComponent(token)}`;
      const sent = await sendSignatureEmail({
        to: assignment.email,
        formTitle,
        studentName,
        fieldLabel: assignment.fieldLabel,
        link,
      });
      if (!sent.ok) {
        await db
          .from("form_signature_requests")
          .update({ status: "revoked" })
          .eq("token_hash", hash);
        return NextResponse.json(
          {
            ok: false,
            error:
              sent.detail ||
              "שליחת המייל נכשלה. בדקו את הגדרות Resend בשרת.",
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ ok: true, fillId: formFillId });
  } catch (err) {
    console.error("[free-access-waiver-signature] POST", err);
    const detail = err instanceof Error ? err.message : "";
    return NextResponse.json(
      {
        ok: false,
        error: detail
          ? `שליחת החתימה נכשלה: ${detail}`
          : "שליחת החתימה נכשלה",
      },
      { status: 500 }
    );
  }
}
