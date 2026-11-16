/**
 * Folder-document access is async (waiver / form check).
 * A boolean defaulting to false looks like "denied" and also goes stale
 * inside focus/visibility refresh closures.
 */
export type FolderDocumentsAccess = "checking" | "allowed" | "denied";

export function resolveFolderDocumentsAccess(
  allowed: boolean
): FolderDocumentsAccess {
  return allowed ? "allowed" : "denied";
}

export function documentsAllowedFromAccess(
  access: FolderDocumentsAccess
): boolean {
  return access === "allowed";
}

/**
 * Focus / visibility reload: keep the current list while access is still
 * unresolved. Clear only after a resolved denial.
 */
export function documentsAfterRefresh<T>(
  access: FolderDocumentsAccess,
  current: T[],
  loaded: T[]
): T[] {
  if (access === "checking") return current;
  if (access === "denied") return [];
  return loaded;
}

export function shouldShowWaiverDocumentsNote(
  access: FolderDocumentsAccess
): boolean {
  return access === "denied";
}

export function shouldShowFolderUploadBlock(
  access: FolderDocumentsAccess
): boolean {
  return access !== "checking";
}
