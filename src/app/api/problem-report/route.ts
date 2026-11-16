import { NextResponse } from "next/server";
import { assertAllowedAppOrigin } from "@/lib/app-request-origin";
import { requireAuthSession } from "@/lib/platform-admin";
import { resolveReporterEmail } from "@/lib/problem-report/session-email";
import {
  loadReporterInstitution,
  resolveReporterInstitutionId,
} from "@/lib/problem-report/reporter-institution";
import { submitProblemReport } from "@/lib/problem-report/submit";
import { parseJsonBody, problemReportBodySchema } from "@/lib/validation";
import { redactPagePath, sanitizeBrowser } from "@/lib/problem-report/sanitize";
import {
  uploadAttachment,
  insertBugAttachment,
  validateMagicBytes,
  validateAttachmentSize,
  validateAttachmentCounts,
  createRecordingGrant,
  isUploadTicketSecretConfigured,
  type AttachmentKind,
} from "@/lib/problem-report/attachments";
import { z } from "zod";

export const runtime = "nodejs";

const UNAUTHORIZED = "יש להתחבר כדי לדווח על תקלה";
const INVALID_FIELDS = "נא למלא תיאור תקף";

type AttachmentInput = {
  kind: "screenshot" | "techlog";
  data: string;
  mime: string;
};

const ALLOWED_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const CATEGORY_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

const techLogEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("network"),
    method: z.enum(ALLOWED_HTTP_METHODS),
    urlPath: z.string().max(500),
    status: z.number().nullable(),
    durationMs: z.number().nullable(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("error"),
    category: z.string().max(40).regex(CATEGORY_PATTERN),
    timestamp: z.number(),
  }),
]);

const SCREEN_SIZE_PATTERN = /^\d{2,5}x\d{2,5}$/;

const techLogSnapshotSchema = z.object({
  entries: z.array(techLogEntrySchema).max(50),
  pageUrl: z.string().max(500),
  browser: z.string().max(500),
  screenSize: z.string().max(50).regex(SCREEN_SIZE_PATTERN),
  timestamp: z.number(),
});

function redactStoragePath(path: string): string {
  if (path.includes("/storage/v1/object/")) {
    const parts = path.split("/");
    const opIndex = parts.indexOf("object");
    if (opIndex >= 0 && parts[opIndex + 1] && parts[opIndex + 2]) {
      return `/storage/v1/object/${parts[opIndex + 1]}/${parts[opIndex + 2]}/...`;
    }
  }
  if (/^\/(fill|sign)\/[^/]+/.test(path)) {
    return path.startsWith("/fill/") ? "/fill/[token]" : "/sign/[token]";
  }
  return path;
}

function sanitizeTechLogServerSide(data: unknown): string | null {
  const parsed = techLogSnapshotSchema.safeParse(data);
  if (!parsed.success) return null;

  const snapshot = parsed.data;
  const sanitized = {
    entries: snapshot.entries.map((entry) => {
      if (entry.type === "network") {
        const urlPath = redactStoragePath(redactPagePath(entry.urlPath));
        return {
          ...entry,
          urlPath,
        };
      }
      return entry;
    }),
    pageUrl: redactStoragePath(redactPagePath(snapshot.pageUrl)),
    browser: sanitizeBrowser(snapshot.browser)?.slice(0, 300) ?? "",
    screenSize: snapshot.screenSize,
    timestamp: snapshot.timestamp,
  };

  return JSON.stringify(sanitized);
}

export async function POST(request: Request) {
  if (!assertAllowedAppOrigin(request).ok) {
    return NextResponse.json(
      { ok: false, error: "מקור בקשה לא מורשה" },
      { status: 403 }
    );
  }

  const auth = await requireAuthSession();
  if (!auth.ok) {
    const status = auth.status === 403 ? 403 : 401;
    return NextResponse.json({ ok: false, error: UNAUTHORIZED }, { status });
  }

  const parsed = await parseJsonBody(request, problemReportBodySchema);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: INVALID_FIELDS },
      { status: 400 }
    );
  }

  const attachments = (parsed.data.attachments ?? []) as AttachmentInput[];
  const counts = {
    screenshots: attachments.filter((a) => a.kind === "screenshot").length,
    recordings: 0,
    techlogs: attachments.filter((a) => a.kind === "techlog").length,
  };
  const countsCheck = validateAttachmentCounts(counts);
  if (!countsCheck.ok) {
    return NextResponse.json(
      { ok: false, error: countsCheck.error },
      { status: 400 }
    );
  }

  const reporter = resolveReporterEmail({
    sessionEmail: auth.session.profile.email,
    clientEmail: parsed.data.reporterEmail,
  });
  if (!reporter.ok) {
    return NextResponse.json(
      { ok: false, error: reporter.error },
      { status: 400 }
    );
  }

  const reporterInstitutionId = await resolveReporterInstitutionId(
    auth.session.userId,
    auth.session.profile.institution_id
  );
  const institution = await loadReporterInstitution(reporterInstitutionId);

  const result = await submitProblemReport({
    reporterEmail: reporter.email,
    description: parsed.data.description,
    pagePath: parsed.data.pagePath,
    browser: parsed.data.browser,
    website: parsed.data.website,
    userId: auth.session.userId,
    reporterName: auth.session.profile.full_name,
    institutionName: institution.name,
    institutionCode:
      institution.code ??
      (reporterInstitutionId === auth.session.profile.institution_id
        ? auth.session.profile.institution_code
        : null),
  });

  if (!result.ok) {
    const headers: Record<string, string> = {};
    if (result.status === 429 && result.retryAfterSec) {
      headers["Retry-After"] = String(result.retryAfterSec);
    }
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers }
    );
  }

  if ("ignored" in result) {
    return NextResponse.json({ ok: true });
  }

  const ticketId = result.ticketId;
  const bugId = result.bugId;
  const attachmentWarnings: string[] = [];

  if (!bugId && attachments.length > 0) {
    attachmentWarnings.push("הקבצים לא צורפו (גרסה ישנה של צוותא)");
  }

  if (bugId) {
    for (const att of attachments) {
      try {
        const kind = att.kind as AttachmentKind;
        let dataBytes: Buffer;
        let mime = att.mime;

        if (kind === "techlog") {
          const rawJson = Buffer.from(att.data, "base64").toString("utf-8");
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawJson);
          } catch {
            attachmentWarnings.push("techlog: JSON לא תקין");
            continue;
          }

          const sanitized = sanitizeTechLogServerSide(parsed);
          if (!sanitized) {
            attachmentWarnings.push("techlog: מבנה לא תקין");
            continue;
          }

          dataBytes = Buffer.from(sanitized, "utf-8");
          mime = "application/json";
        } else {
          dataBytes = Buffer.from(att.data, "base64");

          if (!validateMagicBytes(new Uint8Array(dataBytes), att.mime)) {
            attachmentWarnings.push(`${kind}: תוכן קובץ לא תקין`);
            continue;
          }
        }

        if (!validateAttachmentSize(kind, dataBytes.length)) {
          attachmentWarnings.push(`${kind}: קובץ גדול מדי`);
          continue;
        }

        const uploadResult = await uploadAttachment(bugId, {
          kind,
          data: new Uint8Array(dataBytes),
          mime,
        });

        if (!uploadResult.ok) {
          attachmentWarnings.push(`${kind}: העלאה נכשלה`);
          continue;
        }

        const insertResult = await insertBugAttachment(
          bugId,
          kind,
          uploadResult.storagePath,
          mime,
          uploadResult.sizeBytes
        );

        if (!insertResult.ok) {
          attachmentWarnings.push(`${kind}: שמירת רשומה נכשלה`);
        }
      } catch (err) {
        console.error("[problem-report] attachment error:", err);
        attachmentWarnings.push(`${att.kind}: שגיאה בעיבוד`);
      }
    }
  }

  let recordingGrant: string | undefined;
  const recordingMime = parsed.data.recordingMime as "video/webm" | "video/mp4" | undefined;
  if (bugId && recordingMime && isUploadTicketSecretConfigured()) {
    try {
      recordingGrant = createRecordingGrant({
        bugId,
        userId: auth.session.userId,
        mime: recordingMime,
      });
    } catch {
      console.error("[problem-report] failed to create recording grant");
    }
  }

  return NextResponse.json({
    ok: true,
    ticketId,
    bugId,
    recordingGrant,
    attachmentWarnings: attachmentWarnings.length > 0 ? attachmentWarnings : undefined,
  });
}
