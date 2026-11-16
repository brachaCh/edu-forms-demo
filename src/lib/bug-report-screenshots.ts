export const BUG_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;

export type BugScreenshotInput = {
  filename: string;
  contentType: string;
  content: string;
};

export type PreparedScreenshot = {
  filename: string;
  content: string;
  contentType: string;
};

export function sanitizeScreenshotFilename(
  name: string,
  contentType: string
): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[\r\n\0]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  if (cleaned.includes(".")) return cleaned || "screenshot.png";
  const ext =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/gif"
          ? "gif"
          : "png";
  return `${cleaned || "screenshot"}.${ext}`;
}

export function prepareBugReportScreenshots(
  shots: BugScreenshotInput[]
): { ok: true; attachments: PreparedScreenshot[] } | { ok: false } {
  const attachments: PreparedScreenshot[] = [];
  for (const shot of shots) {
    const content = shot.content.replace(/\s+/g, "");
    if (!content || !/^[A-Za-z0-9+/=]+$/.test(content)) return { ok: false };
    const approxBytes = Math.floor((content.length * 3) / 4);
    if (approxBytes > BUG_SCREENSHOT_MAX_BYTES) return { ok: false };
    attachments.push({
      filename: sanitizeScreenshotFilename(
        shot.filename || "screenshot",
        shot.contentType
      ),
      content,
      contentType: shot.contentType,
    });
  }
  return { ok: true, attachments };
}
