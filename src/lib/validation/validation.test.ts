import { describe, expect, it } from "vitest";
import {
  emailSchema,
  problemReportBodySchema,
  problemReportStatusBodySchema,
  formFillOtpVerifyBodySchema,
  formFillCreateBodySchema,
  formFillPublicBodySchema,
  formFillTokenBodySchema,
  inviteEmailStrictSchema,
  platformSubscriptionPatchSchema,
  registerBodySchema,
  signatureCreateBodySchema,
  simpleSignCreateBodySchema,
  specialEdHomeroomInviteBodySchema,
  teacherInviteAcceptBodySchema,
  studentDocumentSchema,
  studentPatchSchema,
  studentWriteSchema,
  tenantRequestSchema,
  waiverSignatureBodySchema,
} from "./index";
import {
  MAX_SAFE_UPLOAD_BODY_CHARS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_DATA_URL_CHARS,
} from "@/lib/upload-guard";

describe("validation primitives", () => {
  it("normalizes email", () => {
    expect(emailSchema.parse("  A@B.com ")).toBe("a@b.com");
  });

  it("rejects invalid email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("problemReportBodySchema", () => {
  it("accepts a report without a client email", () => {
    expect(
      problemReportBodySchema.parse({
        description: "  השמירה נכשלה  ",
        pagePath: "/personal-area",
        browser: "Mozilla/5.0",
      })
    ).toEqual({
      description: "השמירה נכשלה",
      pagePath: "/personal-area",
      browser: "Mozilla/5.0",
    });
  });

  it("normalizes an optional matching client email", () => {
    expect(
      problemReportBodySchema.parse({
        reporterEmail: "  Teacher@School.IL ",
        description: "תקלה",
      })
    ).toMatchObject({
      reporterEmail: "teacher@school.il",
      description: "תקלה",
    });
  });

  it("rejects invalid email, empty description, and overlong text", () => {
    expect(
      problemReportBodySchema.safeParse({
        reporterEmail: "not-an-email",
        description: "תקלה",
      }).success
    ).toBe(false);
    expect(
      problemReportBodySchema.safeParse({
        description: "   ",
      }).success
    ).toBe(false);
    expect(
      problemReportBodySchema.safeParse({
        description: "א".repeat(4001),
      }).success
    ).toBe(false);
  });
});

describe("problemReportStatusBodySchema", () => {
  it("accepts TZ-n ticket ids and official statuses", () => {
    expect(
      problemReportStatusBodySchema.parse({
        ticketId: " TZ-18 ",
        status: "fixed",
      })
    ).toEqual({
      ticketId: "TZ-18",
      status: "fixed",
    });
  });

  it("rejects unofficial statuses and a client reporterEmail", () => {
    expect(
      problemReportStatusBodySchema.safeParse({
        ticketId: "TZ-18",
        status: "resolved",
      }).success
    ).toBe(false);
    expect(
      problemReportStatusBodySchema.safeParse({
        ticketId: "TZ-18",
        status: "fixed",
        reporterEmail: "teacher@school.il",
      }).success
    ).toBe(false);
  });

  it("rejects a non TZ-n id", () => {
    expect(
      problemReportStatusBodySchema.safeParse({
        ticketId: "BUG-18",
        status: "open",
      }).success
    ).toBe(false);
  });
});

describe("inviteEmailStrictSchema", () => {
  it("strips invisible characters and normalizes", () => {
    expect(inviteEmailStrictSchema.parse("  Dana\u200b@School.IL ")).toBe(
      "dana@school.il"
    );
  });

  it("rejects non-ASCII email", () => {
    expect(inviteEmailStrictSchema.safeParse("מחנכת@school.il").success).toBe(
      false
    );
  });
});

describe("specialEdHomeroomInviteBodySchema", () => {
  it("accepts a valid class invite payload", () => {
    const parsed = specialEdHomeroomInviteBodySchema.parse({
      className: "  א1  ",
      teacherName: " רחל כהן ",
      email: "Dana@School.IL",
    });
    expect(parsed).toEqual({
      className: "א1",
      teacherName: "רחל כהן",
      email: "dana@school.il",
    });
  });

  it("rejects missing name or invalid email", () => {
    expect(
      specialEdHomeroomInviteBodySchema.safeParse({
        className: "א1",
        teacherName: "  ",
        email: "dana@school.il",
      }).success
    ).toBe(false);
    expect(
      specialEdHomeroomInviteBodySchema.safeParse({
        className: "א1",
        teacherName: "רחל",
        email: "not-an-email",
      }).success
    ).toBe(false);
  });
});

describe("teacherInviteAcceptBodySchema", () => {
  it("accepts an existing-user join without password or registration fields", () => {
    expect(
      teacherInviteAcceptBodySchema.parse({
        token: "a".repeat(32),
        existingUserAccept: true,
      })
    ).toMatchObject({ existingUserAccept: true });
  });

  it("still requires password and terms for a new registration", () => {
    expect(
      teacherInviteAcceptBodySchema.safeParse({
        token: "a".repeat(32),
      }).success
    ).toBe(false);
  });
});

describe("registerBodySchema", () => {
  it("accepts valid registration", () => {
    const parsed = registerBodySchema.parse({
      full_name: "ישראל ישראלי",
      phone: "0501234567",
      email: "user@example.com",
      password: "password1",
      institution_code: "abc",
      institution_name: "מוסד",
      school_name: "בית ספר",
      terms_accepted: true,
    });
    expect(parsed.email).toBe("user@example.com");
  });

  it("requires terms_accepted true", () => {
    expect(
      registerBodySchema.safeParse({
        full_name: "ישראל ישראלי",
        phone: "0501234567",
        email: "user@example.com",
        password: "password1",
        institution_code: "abc",
        institution_name: "מוסד",
        school_name: "בית ספר",
        terms_accepted: false,
      }).success
    ).toBe(false);
  });
});

describe("tenantRequestSchema", () => {
  it("validates insertStudent", () => {
    const parsed = tenantRequestSchema.parse({
      op: "insertStudent",
      student: {
        category: "schools",
        full_name: "תלמיד לדוגמה",
      },
    });
    expect(parsed.op).toBe("insertStudent");
    if (parsed.op === "insertStudent") {
      expect(parsed.student.full_name).toBe("תלמיד לדוגמה");
      expect(parsed.student.phone).toBeNull();
    }
  });

  it("insertStudent omits parent email keys when not provided", () => {
    const parsed = tenantRequestSchema.parse({
      op: "insertStudent",
      student: {
        category: "schools",
        full_name: "תלמיד",
      },
    });
    expect(parsed.op).toBe("insertStudent");
    if (parsed.op === "insertStudent") {
      expect("father_email" in parsed.student).toBe(false);
      expect("mother_email" in parsed.student).toBe(false);
    }
  });

  it("insertStudent includes parent emails when provided", () => {
    const parsed = tenantRequestSchema.parse({
      op: "insertStudent",
      student: {
        category: "schools",
        full_name: "תלמיד",
        father_email: "dad@example.com",
        mother_email: "mom@example.com",
      },
    });
    expect(parsed.op).toBe("insertStudent");
    if (parsed.op === "insertStudent") {
      expect(parsed.student.father_email).toBe("dad@example.com");
      expect(parsed.student.mother_email).toBe("mom@example.com");
    }
  });

  it("rejects unknown op", () => {
    expect(
      tenantRequestSchema.safeParse({ op: "hackThePlanet" }).success
    ).toBe(false);
  });

  it("accepts insertStudentFormArchiveSnapshot as a distinct op", () => {
    const parsed = tenantRequestSchema.parse({
      op: "insertStudentFormArchiveSnapshot",
      doc: {
        student_id: "550e8400-e29b-41d4-a716-446655440000",
        name: "כרטיס תלמיד סל אישי.html",
        mime_type: "text/html",
        size: 128,
        data_url: "data:text/html;base64,PGh0bWw+",
        folder: "אינפורמציה כללית",
      },
    });
    expect(parsed.op).toBe("insertStudentFormArchiveSnapshot");
  });

  it("TZ-139: Zod document limits allow 25MB storage refs and keep data-URL body cap", () => {
    expect(MAX_SAFE_UPLOAD_BODY_CHARS).toBeLessThan(MAX_UPLOAD_DATA_URL_CHARS);
    const base = {
      student_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "scan.pdf",
      mime_type: "application/pdf",
      folder: "כללי",
    };
    const storageRef =
      "storage://student-documents/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf";
    expect(
      studentDocumentSchema.safeParse({
        ...base,
        size: 20 * 1024 * 1024,
        data_url: storageRef,
      }).success
    ).toBe(true);
    expect(
      studentDocumentSchema.safeParse({
        ...base,
        size: MAX_UPLOAD_BYTES,
        data_url: "data:application/pdf;base64,AAAA",
      }).success
    ).toBe(true);
    expect(
      studentDocumentSchema.safeParse({
        ...base,
        size: MAX_UPLOAD_BYTES + 1,
        data_url: "data:application/pdf;base64,AAAA",
      }).success
    ).toBe(false);
    expect(
      studentDocumentSchema.safeParse({
        ...base,
        size: 1024,
        data_url: "data:application/pdf;base64," + "A".repeat(MAX_SAFE_UPLOAD_BODY_CHARS),
      }).success
    ).toBe(false);
    expect(
      studentDocumentSchema.safeParse({
        ...base,
        size: 4 * 1024 * 1024,
        data_url: "d".repeat(MAX_UPLOAD_DATA_URL_CHARS),
      }).success
    ).toBe(false);
  });

  it("TZ-99: accepts paper waiver upsert/remove ops and keeps generic insert separate", () => {
    const studentId = "550e8400-e29b-41d4-a716-446655440000";
    const doc = {
      student_id: studentId,
      name: "signed-waiver.pdf",
      mime_type: "application/pdf",
      size: 128,
      data_url: "data:application/pdf;base64,AAAA",
      folder: "ויתור סודיות",
      is_paper_waiver: true,
    };
    const upsert = tenantRequestSchema.parse({
      op: "upsertPaperWaiverScan",
      doc,
    });
    expect(upsert.op).toBe("upsertPaperWaiverScan");
    const remove = tenantRequestSchema.parse({
      op: "removePaperWaiverScan",
      studentId,
    });
    expect(remove.op).toBe("removePaperWaiverScan");
    const archive = tenantRequestSchema.parse({
      op: "archivePaperWaiverScan",
      studentId,
    });
    expect(archive.op).toBe("archivePaperWaiverScan");
    const regular = tenantRequestSchema.parse({
      op: "insertStudentDocument",
      doc,
    });
    expect(regular.op).toBe("insertStudentDocument");
  });

  it("does not treat a client flag as the archive snapshot op", () => {
    const parsed = tenantRequestSchema.parse({
      op: "insertStudentDocument",
      archiveSnapshot: true,
      doc: {
        student_id: "550e8400-e29b-41d4-a716-446655440000",
        name: "xss.html",
        mime_type: "text/html",
        size: 128,
        data_url: "data:text/html;base64,PGh0bWw+",
        folder: "כללי",
      },
    });
    expect(parsed.op).toBe("insertStudentDocument");
    expect("archiveSnapshot" in parsed).toBe(false);
  });

  it("requires id for patchStudent", () => {
    expect(
      tenantRequestSchema.safeParse({
        op: "patchStudent",
        patch: { full_name: "א" },
      }).success
    ).toBe(false);
  });

  it("defaults missing patch to empty object", () => {
    const parsed = tenantRequestSchema.parse({
      op: "patchStudent",
      id: "abc",
    });
    expect(parsed.op).toBe("patchStudent");
    if (parsed.op === "patchStudent") {
      expect(parsed.patch).toEqual({});
    }
  });

  it("TZ-189: accepts removeStudentFormFill with fill id", () => {
    const fillId = "550e8400-e29b-41d4-a716-446655440099";
    const parsed = tenantRequestSchema.parse({
      op: "removeStudentFormFill",
      id: fillId,
    });
    expect(parsed.op).toBe("removeStudentFormFill");
    if (parsed.op === "removeStudentFormFill") {
      expect(parsed.id).toBe(fillId);
    }
  });
});

describe("form fill OTP body schemas", () => {
  const token = "A".repeat(40);

  it("accepts a fill token", () => {
    expect(formFillTokenBodySchema.parse({ token }).token).toBe(token);
  });

  it("rejects a short fill token", () => {
    expect(formFillTokenBodySchema.safeParse({ token: "short" }).success).toBe(
      false
    );
  });

  it("accepts token + 6-digit OTP", () => {
    const parsed = formFillOtpVerifyBodySchema.parse({
      token,
      code: " 123456 ",
    });
    expect(parsed.code).toBe("123456");
  });

  it("rejects a non-numeric OTP", () => {
    expect(
      formFillOtpVerifyBodySchema.safeParse({ token, code: "abcdef" }).success
    ).toBe(false);
  });
});

describe("hyphenated fill field keys", () => {
  const token = "A".repeat(40);
  const hyphenatedData = {
    "tbl_tachi-goals_r0_goal": "יעד",
    "tbl_tachi-goals_rows": "2",
  };

  it("accepts hyphenated table keys on the public fill body", () => {
    const parsed = formFillPublicBodySchema.safeParse({
      action: "submit",
      token,
      data: hyphenatedData,
      complete: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects public fill keys with spaces or other symbols", () => {
    expect(
      formFillPublicBodySchema.safeParse({
        action: "submit",
        token,
        data: { "tbl tachi-goals_r0_goal": "x" },
      }).success
    ).toBe(false);
    expect(
      formFillPublicBodySchema.safeParse({
        action: "submit",
        token,
        data: { "tbl_tachi-goals_r0_goal!": "x" },
      }).success
    ).toBe(false);
  });
});

describe("signatureCreateBodySchema", () => {
  const base = {
    formFillId: "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22",
    formTitle: "טופס ויתור סודיות",
    studentName: "הדס דמו",
    snapshotHtml: "<html><body>x</body></html>",
    assignments: [
      {
        email: "  Parent@Example.com ",
        fieldKey: "father_signature",
        fieldLabel: "חתימת האב",
      },
    ],
  };

  it("normalizes recipient emails", () => {
    const parsed = signatureCreateBodySchema.parse(base);
    expect(parsed.assignments[0]?.email).toBe("parent@example.com");
    expect(parsed.studentName).toBe("הדס דמו");
  });

  it("rejects unknown keys (no client-controlled appUrl)", () => {
    expect(
      signatureCreateBodySchema.safeParse({
        ...base,
        appUrl: "https://evil.example",
      }).success
    ).toBe(false);
  });

  it("rejects an empty assignment list and a non-uuid fill id", () => {
    expect(
      signatureCreateBodySchema.safeParse({ ...base, assignments: [] }).success
    ).toBe(false);
    expect(
      signatureCreateBodySchema.safeParse({ ...base, formFillId: "123" }).success
    ).toBe(false);
  });
});

describe("simpleSignCreateBodySchema", () => {
  const formFillId = "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22";

  it("normalizes invisible characters then accepts an ASCII email", () => {
    const parsed = simpleSignCreateBodySchema.parse({
      formFillId,
      assignments: [
        {
          email: "  Mom\u200B@Example.com ",
          fieldKey: "mother_signature",
        },
      ],
    });
    expect(parsed.assignments[0]?.email).toBe("mom@example.com");
  });

  it("rejects a non-ASCII email and names the mother signer", () => {
    const result = simpleSignCreateBodySchema.safeParse({
      formFillId,
      assignments: [
        {
          email: "אם@example.com",
          fieldKey: "mother_signature",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(
      "כתובת המייל של האם מכילה תווים לא תקינים"
    );
  });

  it("rejects a non-ASCII email and names the father signer", () => {
    const result = simpleSignCreateBodySchema.safeParse({
      formFillId,
      assignments: [
        {
          email: "אבא@example.com",
          fieldKey: "father_signature",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(
      "כתובת המייל של האב מכילה תווים לא תקינים"
    );
  });
});

describe("waiverSignatureBodySchema", () => {
  const base = {
    email: "parent@example.com",
    formTitle: "ויתור סודיות",
    snapshotHtml: "<html><body>x</body></html>",
  };

  it("does not take a client-controlled appUrl", () => {
    const parsed = waiverSignatureBodySchema.parse({
      ...base,
      appUrl: "https://evil.example",
    });
    expect(parsed).not.toHaveProperty("appUrl");
  });

  it("parses without appUrl", () => {
    expect(waiverSignatureBodySchema.parse(base).formTitle).toBe("ויתור סודיות");
  });
});

describe("formFillCreateBodySchema", () => {
  const base = {
    formFillId: "6f1b4b1e-3c1e-4c6a-9d0e-0b7f9e3a1c22",
    formId: "parent-questionnaire",
    formTitle: "שאלון הורים",
    studentName: "הדס דמו",
    recipientEmail: "  Parent@Example.com ",
    note: "נא למלא עד יום ראשון",
  };

  it("normalizes the recipient email", () => {
    const parsed = formFillCreateBodySchema.parse(base);
    expect(parsed.recipientEmail).toBe("parent@example.com");
    expect(parsed.studentName).toBe("הדס דמו");
    expect(parsed.note).toBe("נא למלא עד יום ראשון");
  });

  it("rejects unknown keys (no client-controlled appUrl)", () => {
    expect(
      formFillCreateBodySchema.safeParse({
        ...base,
        appUrl: "https://evil.example",
      }).success
    ).toBe(false);
  });

  it("rejects a non-uuid fill id and a bad email", () => {
    expect(
      formFillCreateBodySchema.safeParse({ ...base, formFillId: "123" }).success
    ).toBe(false);
    expect(
      formFillCreateBodySchema.safeParse({
        ...base,
        recipientEmail: "not-an-email",
      }).success
    ).toBe(false);
  });
});

describe("studentWriteSchema", () => {
  it("trims and nulls empty strings", () => {
    const parsed = studentWriteSchema.parse({
      category: "schools",
      full_name: "  שם  ",
      phone: "  ",
      email: "",
    });
    expect(parsed.full_name).toBe("שם");
    expect(parsed.phone).toBeNull();
    expect(parsed.email).toBeNull();
  });

  it("accepts and normalizes parent email fields", () => {
    const parsed = studentWriteSchema.parse({
      category: "schools",
      full_name: "תלמיד",
      father_email: "  DAD@Example.com  ",
      mother_email: "mom@EXAMPLE.COM",
    });
    expect(parsed.father_email).toBe("dad@example.com");
    expect(parsed.mother_email).toBe("mom@example.com");
  });

  it("strips invisible and bidi characters from parent emails", () => {
    const parsed = studentWriteSchema.parse({
      category: "schools",
      full_name: "תלמיד",
      father_email: "dad\u200B@example.com",
      mother_email: "\u202Emom@example.com\u202C",
    });
    expect(parsed.father_email).toBe("dad@example.com");
    expect(parsed.mother_email).toBe("mom@example.com");
  });

  it("nulls empty parent email strings", () => {
    const parsed = studentWriteSchema.parse({
      category: "schools",
      full_name: "תלמיד",
      father_email: "",
      mother_email: "  ",
    });
    expect(parsed.father_email).toBeNull();
    expect(parsed.mother_email).toBeNull();
  });

  it("rejects invalid parent email format", () => {
    expect(
      studentWriteSchema.safeParse({
        category: "schools",
        full_name: "תלמיד",
        father_email: "not-an-email",
      }).success
    ).toBe(false);
    expect(
      studentWriteSchema.safeParse({
        category: "schools",
        full_name: "תלמיד",
        mother_email: "invalid",
      }).success
    ).toBe(false);
  });

  it("omits parent email keys when not provided (no default)", () => {
    const parsed = studentWriteSchema.parse({
      category: "schools",
      full_name: "תלמיד",
    });
    expect("father_email" in parsed).toBe(false);
    expect("mother_email" in parsed).toBe(false);
  });
});

describe("studentPatchSchema", () => {
  it("accepts and normalizes parent email fields in patch", () => {
    const parsed = studentPatchSchema.parse({
      father_email: "  DAD@Example.com  ",
      mother_email: "mom@EXAMPLE.COM",
    });
    expect(parsed.father_email).toBe("dad@example.com");
    expect(parsed.mother_email).toBe("mom@example.com");
  });

  it("strips invisible and bidi characters from parent emails in patch", () => {
    const parsed = studentPatchSchema.parse({
      father_email: "dad\u200B@example.com",
      mother_email: "\u2066mom@example.com\u2069",
    });
    expect(parsed.father_email).toBe("dad@example.com");
    expect(parsed.mother_email).toBe("mom@example.com");
  });

  it("allows parent emails to be set to null in patch (for clearing)", () => {
    const parsed = studentPatchSchema.parse({
      father_email: null,
      mother_email: null,
    });
    // Key must be present with null value so user can clear the field
    expect("father_email" in parsed).toBe(true);
    expect("mother_email" in parsed).toBe(true);
    expect(parsed.father_email).toBeNull();
    expect(parsed.mother_email).toBeNull();
  });

  it("allows empty strings which get normalized to null (for clearing)", () => {
    const parsed = studentPatchSchema.parse({
      father_email: "",
      mother_email: "  ",
    });
    // Key must be present with null value so user can clear the field
    expect("father_email" in parsed).toBe(true);
    expect("mother_email" in parsed).toBe(true);
    expect(parsed.father_email).toBeNull();
    expect(parsed.mother_email).toBeNull();
  });

  it("omits parent email fields when not provided (undefined)", () => {
    const parsed = studentPatchSchema.parse({
      full_name: "New Name",
    });
    expect("father_email" in parsed).toBe(false);
    expect("mother_email" in parsed).toBe(false);
  });
});

describe("platformSubscriptionPatchSchema", () => {
  it("accepts extend_expiry with days", () => {
    expect(
      platformSubscriptionPatchSchema.parse({
        action: "extend_expiry",
        days: 14,
      })
    ).toEqual({ action: "extend_expiry", days: 14 });
  });

  it("rejects unknown actions and out-of-range days", () => {
    expect(
      platformSubscriptionPatchSchema.safeParse({ action: "hack" }).success
    ).toBe(false);
    expect(
      platformSubscriptionPatchSchema.safeParse({
        action: "extend_expiry",
        days: 0,
      }).success
    ).toBe(false);
  });
});
