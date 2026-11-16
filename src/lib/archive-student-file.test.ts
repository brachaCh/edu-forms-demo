import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Student, StudentDocument } from "@/lib/supabase/types";

const updateStudent = vi.fn();
const getStudentDocuments = vi.fn();
const archiveStudentDocument = vi.fn();

vi.mock("@/lib/mock-store", () => ({
  updateStudent: (...args: unknown[]) => updateStudent(...args),
  getStudentDocuments: (...args: unknown[]) => getStudentDocuments(...args),
  archiveStudentDocument: (...args: unknown[]) =>
    archiveStudentDocument(...args),
}));

import {
  archiveStudentFile,
  canArchiveStudentFile,
  canRestoreStudentFile,
  isStudentFileArchived,
  restoreStudentFile,
} from "./archive-student-file";

function baseStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "s1",
    institution_id: null,
    category: "schools",
    full_name: "יעל כהן",
    phone: null,
    father_name: null,
    mother_name: null,
    status: "integration",
    class_name: "ג1",
    teacher_name: null,
    notes: null,
    id_number: null,
    birth_date: null,
    gender: null,
    home_address: null,
    city: null,
    father_mobile: null,
    mother_mobile: null,
    email: null,
    integration_frequency: null,
    calendar_year: null,
    archived_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function doc(
  id: string,
  overrides: Partial<StudentDocument> = {}
): StudentDocument {
  return {
    id,
    student_id: "s1",
    name: `${id}.html`,
    mime_type: "text/html",
    size: 10,
    data_url: "data:text/html,",
    folder: "כללי",
    uploaded_at: "",
    archived_at: null,
    ...overrides,
  };
}

describe("archiveStudentFile", () => {
  beforeEach(() => {
    updateStudent.mockReset();
    getStudentDocuments.mockReset();
    archiveStudentDocument.mockReset();
  });

  it("detects archive state and permissions", () => {
    expect(canArchiveStudentFile(baseStudent())).toBe(true);
    expect(
      canArchiveStudentFile(baseStudent({ status: "integration-teacher" }))
    ).toBe(false);
    expect(
      canArchiveStudentFile(
        baseStudent({ archived_at: "2026-01-01T00:00:00.000Z" })
      )
    ).toBe(false);
    expect(
      canRestoreStudentFile(
        baseStudent({ archived_at: "2026-01-01T00:00:00.000Z" })
      )
    ).toBe(true);
    expect(isStudentFileArchived(baseStudent())).toBe(false);
  });

  it("archives student and active documents only", async () => {
    const next = baseStudent({ archived_at: "2026-09-06T00:00:00.000Z" });
    updateStudent.mockResolvedValue(next);
    getStudentDocuments.mockReturnValue([
      doc("d1"),
      doc("d2", { archived_at: "2025-01-01T00:00:00.000Z" }),
    ]);
    archiveStudentDocument.mockResolvedValue(undefined);

    const result = await archiveStudentFile(baseStudent());

    expect(result.ok).toBe(true);
    expect(updateStudent).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ archived_at: expect.any(String) })
    );
    expect(archiveStudentDocument).toHaveBeenCalledTimes(1);
    expect(archiveStudentDocument).toHaveBeenCalledWith("d1");
  });

  it("rejects staff without updating", async () => {
    const result = await archiveStudentFile(
      baseStudent({ status: "integration-teacher" })
    );
    expect(result).toEqual({ ok: false, error: "staff_not_allowed" });
    expect(updateStudent).not.toHaveBeenCalled();
  });

  it("restores by clearing archived_at only", async () => {
    const archived = baseStudent({
      archived_at: "2026-01-01T00:00:00.000Z",
    });
    const next = baseStudent({ archived_at: null });
    updateStudent.mockResolvedValue(next);

    const result = await restoreStudentFile(archived);

    expect(result.ok).toBe(true);
    expect(updateStudent).toHaveBeenCalledWith("s1", { archived_at: null });
    expect(archiveStudentDocument).not.toHaveBeenCalled();
  });

  it("rejects restore when not archived", async () => {
    const result = await restoreStudentFile(baseStudent());
    expect(result).toEqual({ ok: false, error: "not_archived" });
    expect(updateStudent).not.toHaveBeenCalled();
  });
});
