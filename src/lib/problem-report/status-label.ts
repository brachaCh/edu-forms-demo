export const PROBLEM_REPORT_STATUS_VALUES = [
  "open",
  "in_progress",
  "waiting",
  "fixed",
  "closed",
] as const;

export type ProblemReportStatus = (typeof PROBLEM_REPORT_STATUS_VALUES)[number];

const STATUS_LABELS: Record<ProblemReportStatus, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  waiting: "ממתין",
  fixed: "טופל",
  closed: "נסגר",
};

export function isProblemReportStatus(
  value: string
): value is ProblemReportStatus {
  return (PROBLEM_REPORT_STATUS_VALUES as readonly string[]).includes(value);
}

export function problemReportStatusLabel(status: ProblemReportStatus): string {
  return STATUS_LABELS[status];
}
