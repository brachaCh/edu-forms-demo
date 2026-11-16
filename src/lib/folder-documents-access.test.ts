import { describe, expect, it } from "vitest";
import {
  documentsAfterRefresh,
  documentsAllowedFromAccess,
  resolveFolderDocumentsAccess,
  shouldShowFolderUploadBlock,
  shouldShowWaiverDocumentsNote,
  type FolderDocumentsAccess,
} from "./folder-documents-access";

const listed = [{ id: "waiver-doc", name: "אישור חתום.pdf" }];

describe("folder documents access", () => {
  it("keeps documents listed after waiver access resolves and a focus refresh", () => {
    let access: FolderDocumentsAccess = "checking";
    let documents: typeof listed | [] = [];

    // Stale closure captured before the access check resolved
    // (the previous boolean defaulted to false / "not allowed").
    const staleDocumentsAllowed = documentsAllowedFromAccess(access);
    expect(staleDocumentsAllowed).toBe(false);

    access = resolveFolderDocumentsAccess(true);
    documents = documentsAfterRefresh(access, documents, listed);
    expect(access).toBe("allowed");
    expect(documents).toEqual(listed);

    // Tab return (focus / visibility): must read the resolved access, not
    // the stale "documents not allowed" value from before the check.
    documents = documentsAfterRefresh(access, documents, listed);
    expect(documents).toEqual(listed);
    expect(documentsAllowedFromAccess(access)).toBe(true);
  });

  it("never clears the list while access is unresolved", () => {
    expect(documentsAfterRefresh("checking", listed, [])).toEqual(listed);
    expect(documentsAfterRefresh("checking", listed, listed)).toEqual(listed);
    expect(documentsAfterRefresh("denied", listed, listed)).toEqual([]);
    expect(documentsAfterRefresh("allowed", [], listed)).toEqual(listed);
  });

  it("hides the waiver note and the upload block while checking", () => {
    expect(shouldShowWaiverDocumentsNote("checking")).toBe(false);
    expect(shouldShowFolderUploadBlock("checking")).toBe(false);

    expect(shouldShowWaiverDocumentsNote("allowed")).toBe(false);
    expect(shouldShowFolderUploadBlock("allowed")).toBe(true);

    expect(shouldShowWaiverDocumentsNote("denied")).toBe(true);
    expect(shouldShowFolderUploadBlock("denied")).toBe(true);
  });
});
