import type { StudentDocument } from "@/lib/supabase/types";

export type DirectUploadKind = "upload" | "paper-waiver";

type UploadUrlResponse = {
  ok?: boolean;
  signedUrl?: string;
  storagePath?: string;
  uploadTicket?: string;
  error?: string;
};

type ConfirmUploadResponse = {
  ok?: boolean;
  data?: StudentDocument;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export async function persistStudentDocumentViaSignedUpload(input: {
  studentId: string;
  file: File;
  folder: string;
  kind: DirectUploadKind;
}): Promise<StudentDocument> {
  const urlResponse = await fetch("/api/tenant/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: input.studentId,
      fileName: input.file.name,
      mimeType: input.file.type,
      size: input.file.size,
      folder: input.folder,
      kind: input.kind,
    }),
  });
  const urlBody = await readJson<UploadUrlResponse>(urlResponse);
  if (!urlResponse.ok || !urlBody?.ok || !urlBody.signedUrl || !urlBody.uploadTicket) {
    if (urlResponse.status === 413 || urlBody?.error === "FILE_TOO_LARGE") {
      throw new Error("FILE_TOO_LARGE");
    }
    throw new Error(urlBody?.error || "FILE_TYPE_NOT_ALLOWED");
  }

  const uploadResponse = await fetch(urlBody.signedUrl, {
    method: "PUT",
    body: input.file,
    headers: {
      "Content-Type": input.file.type || "application/octet-stream",
    },
  });
  if (!uploadResponse.ok) {
    throw new Error("העלאת הקובץ נכשלה. נסו שוב.");
  }

  const confirmResponse = await fetch("/api/tenant/documents/confirm-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadTicket: urlBody.uploadTicket }),
  });
  const confirmBody = await readJson<ConfirmUploadResponse>(confirmResponse);
  if (!confirmResponse.ok || !confirmBody?.ok || !confirmBody.data) {
    if (confirmResponse.status === 413 || confirmBody?.error === "FILE_TOO_LARGE") {
      throw new Error("FILE_TOO_LARGE");
    }
    throw new Error(confirmBody?.error || "העלאת הקובץ נכשלה. נסו שוב.");
  }
  return confirmBody.data;
}
