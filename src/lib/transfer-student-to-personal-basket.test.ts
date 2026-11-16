import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Student } from "@/lib/supabase/types";

const updateStudent = vi.fn();
const loadStudentFormFill = vi.fn();
const saveStudentFormFill = vi.fn();

vi.mock("@/lib/mock-store", () => ({
  updateStudent: (...args: unknown[]) => updateStudent(...args),
  loadStudentFormFill: (...args: unknown[]) => loadStudentFormFill(...args),
  saveStudentFormFill: (...args: unknown[]) => saveStudentFormFill(...args),
}));

import {
  canTransferToPersonalBasket,
  transferStudentToPersonalBasket,
} from "./transfer-student-to-personal-basket";

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
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("transferStudentToPersonalBasket", () => {
  beforeEach(() => {
    updateStudent.mockReset();
    loadStudentFormFill.mockReset();
    saveStudentFormFill.mockReset();
    loadStudentFormFill.mockResolvedValue(null);
    saveStudentFormFill.mockResolvedValue(null);
  });

  it("allows transfer only from integration", () => {
    expect(canTransferToPersonalBasket(baseStudent())).toBe(true);
    expect(
      canTransferToPersonalBasket(baseStudent({ status: "personal-basket" }))
    ).toBe(false);
    expect(
      canTransferToPersonalBasket(baseStudent({ status: "special-ed-class" }))
    ).toBe(false);
  });

  it("updates status and frequency", async () => {
    const next = baseStudent({
      status: "personal-basket",
      integration_frequency: "low",
    });
    updateStudent.mockResolvedValue(next);

    const result = await transferStudentToPersonalBasket(
      baseStudent(),
      "low"
    );

    expect(result.ok).toBe(true);
    expect(updateStudent).toHaveBeenCalledWith("s1", {
      status: "personal-basket",
      integration_frequency: "low",
    });
    if (result.ok) {
      expect(result.student.status).toBe("personal-basket");
      expect(result.student.integration_frequency).toBe("low");
    }
  });

  it("rejects non-integration students without calling update", async () => {
    const result = await transferStudentToPersonalBasket(
      baseStudent({ status: "personal-basket" }),
      "high"
    );
    expect(result).toEqual({ ok: false, error: "not_integration" });
    expect(updateStudent).not.toHaveBeenCalled();
  });

  it("defaults frequency to high", async () => {
    updateStudent.mockResolvedValue(
      baseStudent({
        status: "personal-basket",
        integration_frequency: "high",
      })
    );

    await transferStudentToPersonalBasket(baseStudent());

    expect(updateStudent).toHaveBeenCalledWith("s1", {
      status: "personal-basket",
      integration_frequency: "high",
    });
  });

  it("TZ-75: copies integration schedule cells into personal-schedule", async () => {
    updateStudent.mockResolvedValue(
      baseStudent({
        status: "personal-basket",
        integration_frequency: "high",
      })
    );
    loadStudentFormFill.mockImplementation(
      async (_studentId: string, formId: string) => {
        if (formId === "schedule") {
          return {
            id: "sch",
            student_id: "s1",
            form_id: "schedule",
            data: { sched_sun_p1: "מורה דמו\nחשבון" },
            status: "draft",
            document_id: null,
            created_at: "",
            updated_at: "",
          };
        }
        return null;
      }
    );

    await transferStudentToPersonalBasket(baseStudent());

    expect(saveStudentFormFill).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "s1",
        formId: "personal-schedule",
        data: expect.objectContaining({
          sched_sun_p1: "מורה דמו\nחשבון",
        }),
      })
    );
  });

  it("TZ-75: does not refill a cleared personal-schedule cell on transfer", async () => {
    updateStudent.mockResolvedValue(
      baseStudent({
        status: "personal-basket",
        integration_frequency: "high",
      })
    );
    loadStudentFormFill.mockImplementation(
      async (_studentId: string, formId: string) => {
        if (formId === "personal-schedule") {
          return {
            id: "personal",
            student_id: "s1",
            form_id: "personal-schedule",
            data: { sched_sun_p1: "" },
            status: "draft",
            document_id: null,
            created_at: "",
            updated_at: "",
          };
        }
        if (formId === "schedule") {
          return {
            id: "sch",
            student_id: "s1",
            form_id: "schedule",
            data: { sched_sun_p1: "מורה דמו\nחשבון" },
            status: "draft",
            document_id: null,
            created_at: "",
            updated_at: "",
          };
        }
        return null;
      }
    );

    await transferStudentToPersonalBasket(baseStudent());

    expect(saveStudentFormFill).not.toHaveBeenCalled();
  });

  it("TZ-75: does not refill a cleared schedule-detailed cell on transfer", async () => {
    updateStudent.mockResolvedValue(
      baseStudent({
        status: "personal-basket",
        integration_frequency: "high",
      })
    );
    loadStudentFormFill.mockImplementation(
      async (_studentId: string, formId: string) => {
        if (formId === "schedule-detailed") {
          return {
            id: "detailed",
            student_id: "s1",
            form_id: "schedule-detailed",
            data: { sched_sun_p1: "", sched_sun_p1_in_class: "1" },
            status: "draft",
            document_id: null,
            created_at: "",
            updated_at: "",
          };
        }
        if (formId === "schedule") {
          return {
            id: "sch",
            student_id: "s1",
            form_id: "schedule",
            data: {
              sched_sun_p1: "מורה דמו\nחשבון",
              sched_sun_p1_in_class: "1",
            },
            status: "draft",
            document_id: null,
            created_at: "",
            updated_at: "",
          };
        }
        return null;
      }
    );

    await transferStudentToPersonalBasket(baseStudent());

    expect(saveStudentFormFill).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "s1",
        formId: "personal-schedule",
        data: expect.objectContaining({
          sched_sun_p1: "",
          sched_sun_p1_in_class: "1",
        }),
      })
    );
    const saved = saveStudentFormFill.mock.calls[0]?.[0] as {
      data: Record<string, string>;
    };
    expect(saved.data.sched_sun_p1).toBe("");
  });

  it("TZ-75: transfer does not copy in-class/other from shiluv schedule", async () => {
    updateStudent.mockResolvedValue(
      baseStudent({
        status: "personal-basket",
        integration_frequency: "high",
      })
    );
    loadStudentFormFill.mockImplementation(
      async (_studentId: string, formId: string) => {
        if (formId === "schedule") {
          return {
            id: "sch",
            student_id: "s1",
            form_id: "schedule",
            data: {
              sched_sun_p1: "מורה דמו\nחשבון",
              sched_sun_p1_in_class: "1",
              sched_sun_p1_other: "1",
            },
            status: "draft",
            document_id: null,
            created_at: "",
            updated_at: "",
          };
        }
        return null;
      }
    );

    await transferStudentToPersonalBasket(baseStudent());

    const saved = saveStudentFormFill.mock.calls[0]?.[0] as {
      data: Record<string, string>;
    };
    expect(saved.data.sched_sun_p1).toBe("מורה דמו\nחשבון");
    expect(saved.data.sched_sun_p1_in_class).toBeUndefined();
    expect(saved.data.sched_sun_p1_other).toBeUndefined();
  });
});
