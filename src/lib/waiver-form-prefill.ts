import type { FormSchema } from "@/lib/form-schemas";
import { listFormFields } from "@/lib/form-schemas";
import type { Student, StudentFormFill } from "@/lib/supabase/types";

const MOE_WAIVER_IDS = new Set([
  "waiver-eligibility-characterization",
  "waiver-multidisciplinary-team",
  "waiver-appeal-committee",
]);

const PRIOR_PARENT_FIELD_KEYS = [
  "parent_guardian_name",
  "parent_guardian_id",
  "father_id",
  "mother_id",
  "parent1_id",
  "parent2_id",
  "father_name",
  "mother_name",
  "parent1_name",
  "parent2_name",
  "guardian_name",
] as const;

type ParentSlotKey = "father" | "mother" | "guardian";

type ParentSlot = {
  name: string;
  id: string;
};

function isNonEmpty(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

/** טפסי ויתור משרד החינוך (לא waiver-confidentiality הישן) */
export function isMoeWaiverForm(formId: string): boolean {
  return MOE_WAIVER_IDS.has(formId.trim());
}

function latestParentValuesFromFills(
  fills: StudentFormFill[],
  excludeFormId: string
): Record<string, string> {
  const out: Record<string, string> = {};
  const ordered = [...fills]
    .filter((fill) => fill.form_id !== excludeFormId)
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  for (const fill of ordered) {
    const data = fill.data ?? {};
    for (const key of PRIOR_PARENT_FIELD_KEYS) {
      if (out[key]) continue;
      const value = isNonEmpty(data[key]);
      if (value) out[key] = value;
    }
  }
  return out;
}

function joinParentNames(names: string[]): string {
  return names.filter(Boolean).join(" / ");
}

function resolveParentSlots(
  student: Student,
  initial: Record<string, string>,
  prior: Record<string, string>
): Record<ParentSlotKey, ParentSlot> {
  const fatherName =
    isNonEmpty(initial.parent1_name) ||
    isNonEmpty(student.father_name) ||
    isNonEmpty(prior.parent1_name) ||
    isNonEmpty(prior.father_name);
  const motherName =
    isNonEmpty(initial.parent2_name) ||
    isNonEmpty(student.mother_name) ||
    isNonEmpty(prior.parent2_name) ||
    isNonEmpty(prior.mother_name);
  const guardianName = isNonEmpty(prior.guardian_name);

  return {
    father: {
      name: fatherName,
      id: fatherName
        ? isNonEmpty(initial.parent1_id) ||
          isNonEmpty(prior.parent1_id) ||
          isNonEmpty(prior.father_id)
        : "",
    },
    mother: {
      name: motherName,
      id: motherName
        ? isNonEmpty(initial.parent2_id) ||
          isNonEmpty(prior.parent2_id) ||
          isNonEmpty(prior.mother_id)
        : "",
    },
    guardian: {
      name: guardianName,
      id: "",
    },
  };
}

function pickSingleResponsibleSlot(
  slots: Record<ParentSlotKey, ParentSlot>
): ParentSlot | null {
  const present = [slots.father, slots.mother, slots.guardian].filter(
    (s) => s.name
  );
  return present.length === 1 ? present[0] : null;
}

function resolveParentGuardianPair(
  student: Student,
  initial: Record<string, string>,
  prior: Record<string, string>,
  singleResponsible: boolean
): { name: string; id: string } {
  const fromPriorName = isNonEmpty(prior.parent_guardian_name);
  const fromPriorId = isNonEmpty(prior.parent_guardian_id);
  if (fromPriorName && fromPriorId) {
    return { name: fromPriorName, id: fromPriorId };
  }
  if (fromPriorName) {
    return { name: fromPriorName, id: fromPriorId };
  }

  const slots = resolveParentSlots(student, initial, prior);

  if (singleResponsible) {
    const slot = pickSingleResponsibleSlot(slots);
    if (slot) return { name: slot.name, id: slot.id };
  }

  const names = [slots.father.name, slots.mother.name].filter(Boolean);
  if (names.length !== 1) {
    return { name: joinParentNames(names), id: "" };
  }
  const only = slots.father.name ? slots.father : slots.mother;
  return { name: only.name, id: only.id };
}

/**
 * ממלא שדות הורה/אפוטרופוס בטפסי ויתור משרד החינוך מכרטיס התלמיד
 * ומטפסים קודמים (למשל waiver-confidentiality) — רק שדות ריקים.
 */
export function prefillMoeWaiverParentFields(
  schema: FormSchema,
  student: Student,
  initial: Record<string, string>,
  allFills: StudentFormFill[]
): void {
  if (!isMoeWaiverForm(schema.id)) return;

  const fieldKeys = new Set(listFormFields(schema).map((field) => field.key));
  const prior = latestParentValuesFromFills(allFills, schema.id);
  const singleResponsible = student.single_responsible_party === true;
  const slots = resolveParentSlots(student, initial, prior);

  if (fieldKeys.has("parent1_name") && !isNonEmpty(initial.parent1_name)) {
    initial.parent1_name = slots.father.name;
  }
  if (fieldKeys.has("parent2_name") && !isNonEmpty(initial.parent2_name)) {
    initial.parent2_name = slots.mother.name;
  }

  if (fieldKeys.has("parent1_id") && !isNonEmpty(initial.parent1_id)) {
    initial.parent1_id = slots.father.id;
  }
  if (fieldKeys.has("parent2_id") && !isNonEmpty(initial.parent2_id)) {
    initial.parent2_id = slots.mother.id;
  }

  const guardianPair = resolveParentGuardianPair(
    student,
    initial,
    prior,
    singleResponsible
  );

  const existingName = isNonEmpty(initial.parent_guardian_name);
  const fillingName =
    fieldKeys.has("parent_guardian_name") && !existingName && guardianPair.name;

  if (fillingName) {
    initial.parent_guardian_name = guardianPair.name;
  }

  const nameMatches = existingName === guardianPair.name;
  if (
    fieldKeys.has("parent_guardian_id") &&
    !isNonEmpty(initial.parent_guardian_id) &&
    guardianPair.id &&
    (fillingName || nameMatches)
  ) {
    initial.parent_guardian_id = guardianPair.id;
  }
}
