import type { Student } from "@/lib/supabase/types";

export function splitParentEmails(raw: string | null | undefined): string[] {
  return [
    ...new Set(
      String(raw ?? "")
        .split(/[,;\s]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function buildParentEmailMapping(student: Student): {
  parentEmailByFieldKey: Record<string, string>;
  parentEmailsFallback: string[];
} {
  const fatherEmail = (student.father_email ?? "").trim().toLowerCase();
  const motherEmail = (student.mother_email ?? "").trim().toLowerCase();
  const legacyEmails = splitParentEmails(student.email);

  const parentEmailByFieldKey: Record<string, string> = {};
  if (fatherEmail) {
    parentEmailByFieldKey.father_signature = fatherEmail;
    parentEmailByFieldKey.parent1_signature = fatherEmail;
    parentEmailByFieldKey.parent1_sign = fatherEmail;
  }
  if (motherEmail) {
    parentEmailByFieldKey.mother_signature = motherEmail;
    parentEmailByFieldKey.parent2_signature = motherEmail;
    parentEmailByFieldKey.parent2_sign = motherEmail;
  }

  const singleParentEmail = fatherEmail || motherEmail;
  if (singleParentEmail) {
    parentEmailByFieldKey.parent_sign = singleParentEmail;
    parentEmailByFieldKey.parent_signature = singleParentEmail;
  }

  return {
    parentEmailByFieldKey,
    parentEmailsFallback: legacyEmails,
  };
}

export function parentRecipientEmails(student: Student): string[] {
  const { parentEmailByFieldKey, parentEmailsFallback } =
    buildParentEmailMapping(student);
  const direct = [
    parentEmailByFieldKey.father_signature,
    parentEmailByFieldKey.mother_signature,
    parentEmailByFieldKey.parent1_signature,
    parentEmailByFieldKey.parent1_sign,
    parentEmailByFieldKey.parent2_signature,
    parentEmailByFieldKey.parent2_sign,
    parentEmailByFieldKey.parent_sign,
    parentEmailByFieldKey.parent_signature,
  ].filter(Boolean);
  if (direct.length > 0) {
    return [...new Set(direct)];
  }
  return parentEmailsFallback;
}
