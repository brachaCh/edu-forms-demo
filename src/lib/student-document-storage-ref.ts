/** Stable pointer stored in `student_documents.data_url` for Storage objects. */

export const STUDENT_DOCUMENTS_BUCKET = "student-documents";
export const STUDENT_DOCUMENT_STORAGE_REF_PREFIX = "storage://";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,80}$/;
const SAFE_EXT = /^(pdf|doc|docx|xls|xlsx|jpg|jpeg|png|gif|webp)$/i;

export function isStudentDocumentStorageRef(
  value: string | null | undefined
): boolean {
  return parseStudentDocumentStorageRef(value) != null;
}

export function buildStudentDocumentStorageRef(storagePath: string): string {
  return `${STUDENT_DOCUMENT_STORAGE_REF_PREFIX}${STUDENT_DOCUMENTS_BUCKET}/${storagePath}`;
}

export function parseStudentDocumentStorageRef(
  value: string | null | undefined
): { bucket: string; storagePath: string } | null {
  const raw = String(value ?? "").trim();
  const prefix = `${STUDENT_DOCUMENT_STORAGE_REF_PREFIX}${STUDENT_DOCUMENTS_BUCKET}/`;
  if (!raw.startsWith(prefix)) return null;
  const storagePath = raw.slice(prefix.length);
  if (!isSafeStudentDocumentStoragePath(storagePath)) return null;
  return { bucket: STUDENT_DOCUMENTS_BUCKET, storagePath };
}

export function isSafeStudentDocumentStoragePath(path: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/") || path.endsWith("/")) {
    return false;
  }
  if (path.includes("\\")) return false;
  const parts = path.split("/");
  if (parts.length !== 3) return false;
  const [institutionId, studentId, filename] = parts;
  if (!SAFE_SEGMENT.test(institutionId) || !SAFE_SEGMENT.test(studentId)) {
    return false;
  }
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return false;
  const stem = filename.slice(0, dot);
  const ext = filename.slice(dot + 1);
  return SAFE_SEGMENT.test(stem) && SAFE_EXT.test(ext);
}

export function assertStoragePathBelongsToInstitution(
  storagePath: string,
  institutionId: string
): boolean {
  if (!isSafeStudentDocumentStoragePath(storagePath)) return false;
  const pathInstitution = storagePath.split("/")[0];
  return pathInstitution === institutionId;
}

export function extractStudentIdFromStoragePath(storagePath: string): string | null {
  if (!isSafeStudentDocumentStoragePath(storagePath)) return null;
  return storagePath.split("/")[1];
}

export function studentDocumentStorageFileName(
  objectId: string,
  originalName: string
): string | null {
  if (!SAFE_SEGMENT.test(objectId)) return null;
  const i = originalName.lastIndexOf(".");
  if (i < 0) return null;
  const ext = originalName.slice(i + 1).toLowerCase();
  if (!SAFE_EXT.test(ext)) return null;
  return `${objectId}.${ext}`;
}
