/** העברת תלמידים מרשימת קליטה באמצע השנה לרשימת שילוב / סל אישי */

import {
  clearMidYearIntake,
  isMidYearIntakePending,
  type MidYearIntakeTarget,
} from "@/lib/mid-year-intake";
import { updateStudent } from "@/lib/mock-store";
import { normalizeIntegrationFrequency } from "@/lib/integration-frequency";
import type { IntegrationFrequency, Student } from "@/lib/supabase/types";

export type TransferMidYearIntakeResult = {
  transferred: number;
  failed: number;
};

/**
 * מסיר את סימון הקליטה — התלמידים כבר בסטטוס היעד ויופיעו ברשימה הראשית.
 * לסל אישי: מוודא שיש שכיחות.
 */
export async function transferMidYearIntakeStudents(
  students: Student[],
  options: {
    target: MidYearIntakeTarget;
    frequency?: IntegrationFrequency | null;
  }
): Promise<TransferMidYearIntakeResult> {
  let transferred = 0;
  let failed = 0;

  for (const student of students) {
    if (!student?.id || !isMidYearIntakePending(student.id)) continue;
    try {
      if (options.target === "personal-basket") {
        const nextFrequency =
          normalizeIntegrationFrequency(options.frequency) ??
          normalizeIntegrationFrequency(student.integration_frequency) ??
          "high";
        if (
          student.status !== "personal-basket" ||
          student.integration_frequency !== nextFrequency
        ) {
          const updated = await updateStudent(student.id, {
            status: "personal-basket",
            integration_frequency: nextFrequency,
          });
          if (!updated) {
            failed += 1;
            continue;
          }
        }
      } else if (student.status !== "integration") {
        const updated = await updateStudent(student.id, {
          status: "integration",
          integration_frequency: null,
        });
        if (!updated) {
          failed += 1;
          continue;
        }
      }
      clearMidYearIntake(student.id);
      transferred += 1;
    } catch {
      failed += 1;
    }
  }

  return { transferred, failed };
}
