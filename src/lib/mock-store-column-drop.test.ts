import { describe, expect, it } from "vitest";
import {
  isParentEmailColumnError,
  dropParentEmailColumns,
  dropExtraStudentColumns,
} from "@/lib/mock-store";
import type { Student } from "@/lib/supabase/types";

describe("isParentEmailColumnError", () => {
  it("returns true when error mentions only father_email", () => {
    expect(
      isParentEmailColumnError("column father_email does not exist")
    ).toBe(true);
  });

  it("returns true when error mentions only mother_email", () => {
    expect(
      isParentEmailColumnError("column mother_email does not exist")
    ).toBe(true);
  });

  it("returns true when error mentions both parent email columns", () => {
    expect(
      isParentEmailColumnError(
        "columns father_email, mother_email do not exist"
      )
    ).toBe(true);
  });

  it("returns false when error mentions other extra fields", () => {
    expect(
      isParentEmailColumnError("column id_number does not exist")
    ).toBe(false);
  });

  it("returns false when error mentions parent emails AND other fields", () => {
    expect(
      isParentEmailColumnError(
        "columns father_email, id_number do not exist"
      )
    ).toBe(false);
  });

  it("returns false when error doesn't mention any parent email columns", () => {
    expect(
      isParentEmailColumnError("some other error")
    ).toBe(false);
  });
});

describe("dropParentEmailColumns", () => {
  it("drops only parent email fields when error is about them", () => {
    const payload: Record<string, unknown> = {
      id: "test",
      full_name: "Test",
      email: "test@example.com",
      father_email: "dad@example.com",
      mother_email: "mom@example.com",
      id_number: "123456789",
    };
    const heldExtras: Partial<Student> = {};

    const dropped = dropParentEmailColumns(
      payload,
      "column father_email does not exist",
      heldExtras
    );

    expect(dropped).toBe(true);
    expect(payload).toEqual({
      id: "test",
      full_name: "Test",
      email: "test@example.com",
      id_number: "123456789",
    });
    expect(heldExtras).toEqual({
      father_email: "dad@example.com",
      mother_email: "mom@example.com",
    });
  });

  it("returns false when error is not about parent emails", () => {
    const payload: Record<string, unknown> = {
      father_email: "dad@example.com",
    };
    const heldExtras: Partial<Student> = {};

    const dropped = dropParentEmailColumns(
      payload,
      "column id_number does not exist",
      heldExtras
    );

    expect(dropped).toBe(false);
    expect(payload.father_email).toBe("dad@example.com");
    expect(heldExtras).toEqual({});
  });
});

describe("dropExtraStudentColumns", () => {
  it("drops only parent emails when error is specific to parent email columns", () => {
    const payload: Record<string, unknown> = {
      id: "test",
      full_name: "Test",
      father_email: "dad@example.com",
      mother_email: "mom@example.com",
      id_number: "123456789",
      birth_date: "2000-01-01",
    };
    const heldExtras: Partial<Student> = {};

    const dropped = dropExtraStudentColumns(
      payload,
      "column mother_email does not exist",
      heldExtras
    );

    expect(dropped).toBe(true);
    expect(payload.father_email).toBeUndefined();
    expect(payload.mother_email).toBeUndefined();
    expect(payload.id_number).toBe("123456789");
    expect(payload.birth_date).toBe("2000-01-01");
    expect(heldExtras.father_email).toBe("dad@example.com");
    expect(heldExtras.mother_email).toBe("mom@example.com");
  });

  it("drops all extra fields when error mentions other extra columns", () => {
    const payload: Record<string, unknown> = {
      id: "test",
      full_name: "Test",
      father_email: "dad@example.com",
      mother_email: "mom@example.com",
      id_number: "123456789",
      birth_date: "2000-01-01",
    };
    const heldExtras: Partial<Student> = {};

    const dropped = dropExtraStudentColumns(
      payload,
      "column id_number does not exist",
      heldExtras
    );

    expect(dropped).toBe(true);
    expect(payload).toEqual({
      id: "test",
      full_name: "Test",
    });
    expect(heldExtras.id_number).toBe("123456789");
    expect(heldExtras.birth_date).toBe("2000-01-01");
    expect(heldExtras.father_email).toBe("dad@example.com");
    expect(heldExtras.mother_email).toBe("mom@example.com");
  });

  it("drops all extra fields when error mentions generic column error", () => {
    const payload: Record<string, unknown> = {
      id: "test",
      full_name: "Test",
      id_number: "123456789",
    };
    const heldExtras: Partial<Student> = {};

    const dropped = dropExtraStudentColumns(
      payload,
      "column foo does not exist",
      heldExtras
    );

    expect(dropped).toBe(true);
    expect(payload).toEqual({
      id: "test",
      full_name: "Test",
    });
    expect(heldExtras.id_number).toBe("123456789");
  });

  it("returns false when error is unrelated to columns", () => {
    const payload: Record<string, unknown> = {
      id: "test",
      full_name: "Test",
      id_number: "123456789",
    };
    const heldExtras: Partial<Student> = {};

    const dropped = dropExtraStudentColumns(
      payload,
      "network error",
      heldExtras
    );

    expect(dropped).toBe(false);
    expect(payload.id_number).toBe("123456789");
    expect(heldExtras).toEqual({});
  });
});
