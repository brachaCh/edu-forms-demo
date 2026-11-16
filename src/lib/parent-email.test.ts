import { describe, expect, it } from "vitest";
import type { Student } from "@/lib/supabase/types";
import {
  buildParentEmailMapping,
  parentRecipientEmails,
} from "./parent-email";

describe("buildParentEmailMapping", () => {
  it("maps parent_sign and parent_signature to a parent card email", () => {
    const student = {
      id: "s1",
      institution_id: "i1",
      category: "schools",
      full_name: "תלמידה",
      father_name: null,
      mother_name: null,
      phone: null,
      status: null,
      class_name: null,
      teacher_name: null,
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      father_email: "dad@example.com",
      mother_email: "mom@example.com",
      email: null,
    } as Student;

    const { parentEmailByFieldKey } = buildParentEmailMapping(student);
    expect(parentEmailByFieldKey.parent_sign).toBe("dad@example.com");
    expect(parentEmailByFieldKey.parent_signature).toBe("dad@example.com");
    expect(parentEmailByFieldKey.parent1_sign).toBe("dad@example.com");
    expect(parentEmailByFieldKey.parent2_sign).toBe("mom@example.com");
    expect(parentRecipientEmails(student)).toEqual([
      "dad@example.com",
      "mom@example.com",
    ]);
  });

  it("prefills parent1_sign and parent2_sign for MOE eligibility renewal", () => {
    const student = {
      id: "s1",
      institution_id: "i1",
      category: "schools",
      full_name: "תלמיד",
      father_name: null,
      mother_name: null,
      phone: null,
      status: null,
      class_name: null,
      teacher_name: null,
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      father_email: "dad@moe.example",
      mother_email: "mom@moe.example",
      email: null,
    } as Student;

    const { parentEmailByFieldKey } = buildParentEmailMapping(student);
    expect(parentEmailByFieldKey.parent1_sign).toBe("dad@moe.example");
    expect(parentEmailByFieldKey.parent2_sign).toBe("mom@moe.example");
  });
});
