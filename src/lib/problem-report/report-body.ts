import {
  TZAVTA_REPORT_DESCRIPTION_MAX,
} from "./constants";

export type ReporterContext = {
  reporterEmail: string;
  reporterName?: string | null;
  institutionName?: string | null;
  institutionCode?: string | null;
};

const TZAVTA_DESCRIPTION_TRUNCATED =
  "…(המשך בפרטי הדיווח)" as const;

function buildMetaLines(ctx: ReporterContext): string[] {
  const meta: string[] = [];
  const name = ctx.reporterName?.trim();
  if (name) meta.push(`שם: ${name}`);
  meta.push(`מייל: ${ctx.reporterEmail.trim().toLowerCase()}`);
  const institutionName = ctx.institutionName?.trim();
  const institutionCode = ctx.institutionCode?.trim();
  if (institutionName) {
    meta.push(
      institutionCode
        ? `מוסד: ${institutionName} (${institutionCode})`
        : `מוסד: ${institutionName}`
    );
  } else if (institutionCode) {
    meta.push(`קוד מוסד: ${institutionCode}`);
  }
  return meta;
}

function assembleReportBody(meta: string[], body: string): string {
  if (meta.length === 0) {
    return `תיאור:\n${body}`;
  }
  return [...meta, "", "תיאור:", body].join("\n");
}

export function buildReporterContactsDescription(
  userDescription: string,
  ctx: ReporterContext
): string {
  const body = userDescription.trim();
  return assembleReportBody(buildMetaLines(ctx), body);
}

export function buildTzavtaReportDescription(
  userDescription: string,
  ctx: ReporterContext
): string {
  const body = userDescription.trim();
  const meta = buildMetaLines(ctx);

  for (let keep = meta.length; keep >= 0; keep--) {
    const candidate = assembleReportBody(meta.slice(0, keep), body);
    if (candidate.length <= TZAVTA_REPORT_DESCRIPTION_MAX) {
      return candidate;
    }
  }

  const prefix = "תיאור:\n";
  const maxBody =
    TZAVTA_REPORT_DESCRIPTION_MAX - prefix.length - TZAVTA_DESCRIPTION_TRUNCATED.length;
  if (maxBody <= 0) {
    return prefix + TZAVTA_DESCRIPTION_TRUNCATED;
  }
  const truncated =
    body.length > maxBody
      ? body.slice(0, maxBody) + TZAVTA_DESCRIPTION_TRUNCATED
      : body;
  return prefix + truncated;
}
