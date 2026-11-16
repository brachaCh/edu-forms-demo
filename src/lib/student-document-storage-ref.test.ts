import { describe, expect, it } from "vitest";
import {
  assertStoragePathBelongsToInstitution,
  buildStudentDocumentStorageRef,
  isSafeStudentDocumentStoragePath,
  isStudentDocumentStorageRef,
  parseStudentDocumentStorageRef,
  studentDocumentStorageFileName,
} from "./student-document-storage-ref";

const PATH =
  "550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf";
const INSTITUTION_A = "550e8400-e29b-41d4-a716-446655440000";
const INSTITUTION_B = "660f9500-f39c-52e5-b817-557766551111";

describe("student document storage refs", () => {
  it("round-trips a safe path", () => {
    const ref = buildStudentDocumentStorageRef(PATH);
    expect(isStudentDocumentStorageRef(ref)).toBe(true);
    expect(parseStudentDocumentStorageRef(ref)).toEqual({
      bucket: "student-documents",
      storagePath: PATH,
    });
  });

  it("rejects path traversal and extra segments", () => {
    expect(isSafeStudentDocumentStoragePath("../etc/passwd")).toBe(false);
    expect(isSafeStudentDocumentStoragePath("a/b/c/d.pdf")).toBe(false);
    expect(isSafeStudentDocumentStoragePath("a/b/c.exe")).toBe(false);
    expect(
      isStudentDocumentStorageRef("https://evil.example/storage/v1/object/x")
    ).toBe(false);
    expect(isStudentDocumentStorageRef("data:application/pdf;base64,AAAA")).toBe(
      false
    );
  });

  it("rejects backslash in path", () => {
    expect(isSafeStudentDocumentStoragePath("a\\b\\c.pdf")).toBe(false);
    expect(isSafeStudentDocumentStoragePath(`${INSTITUTION_A}\\student\\file.pdf`)).toBe(false);
  });

  it("builds a filename only for allowlisted extensions", () => {
    expect(
      studentDocumentStorageFileName("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "scan.PDF")
    ).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf");
    expect(
      studentDocumentStorageFileName("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "x.html")
    ).toBeNull();
  });
});

describe("assertStoragePathBelongsToInstitution (TZ-139 security)", () => {
  it("accepts a path belonging to the correct institution", () => {
    expect(assertStoragePathBelongsToInstitution(PATH, INSTITUTION_A)).toBe(true);
  });

  it("rejects a path belonging to another institution (cross-tenant)", () => {
    expect(assertStoragePathBelongsToInstitution(PATH, INSTITUTION_B)).toBe(false);
  });

  it("rejects traversal attempts like ../ prefix", () => {
    expect(assertStoragePathBelongsToInstitution(`../${INSTITUTION_B}/student/file.pdf`, INSTITUTION_A)).toBe(false);
  });

  it("rejects invalid path structures", () => {
    expect(assertStoragePathBelongsToInstitution("", INSTITUTION_A)).toBe(false);
    expect(assertStoragePathBelongsToInstitution("/absolute/path.pdf", INSTITUTION_A)).toBe(false);
    expect(assertStoragePathBelongsToInstitution("file.pdf", INSTITUTION_A)).toBe(false);
  });

  it("rejects paths with backslash (Windows-style traversal)", () => {
    expect(assertStoragePathBelongsToInstitution(`${INSTITUTION_A}\\student\\file.pdf`, INSTITUTION_A)).toBe(false);
  });
});
