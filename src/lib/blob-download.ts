import { sanitizeDownloadFileName } from "@/lib/download-filename";

/** Chrome may fail downloads if the blob URL is revoked immediately after click */
export const BLOB_URL_REVOKE_DELAY_MS = 60_000;

export function scheduleRevokeObjectUrl(url: string): void {
  const revoke = () => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };
  if (typeof setTimeout === "function") {
    setTimeout(revoke, BLOB_URL_REVOKE_DELAY_MS);
  } else {
    revoke();
  }
}

export function downloadViaBlobUrl(
  blobUrl: string,
  displayFileName: string,
  fallback = "document"
): void {
  const link = document.createElement("a");
  link.href = blobUrl;
  link.rel = "noopener noreferrer";
  link.download = sanitizeDownloadFileName(displayFileName, fallback);
  document.body.appendChild(link);
  link.click();
  if (typeof link.remove === "function") {
    link.remove();
  }
  scheduleRevokeObjectUrl(blobUrl);
}

export function downloadBlob(
  blob: Blob,
  displayFileName: string,
  fallback = "document"
): void {
  const url = URL.createObjectURL(blob);
  downloadViaBlobUrl(url, displayFileName, fallback);
}