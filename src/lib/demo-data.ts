import type { Student, UserProfile } from "./supabase/types";

const DEMO_INSTITUTION_ID = "demo-institution";
const now = "2026-01-01T08:00:00.000Z";

function student(
  id: string,
  data: Omit<Student, "id" | "institution_id" | "created_at" | "updated_at">
): Student {
  return {
    id,
    institution_id: DEMO_INSTITUTION_ID,
    created_at: now,
    updated_at: now,
    ...data,
  };
}

/** נתוני דמו בלבד — שמות ומספרים פיקטיביים */
export const DEMO_STUDENTS: Student[] = [
  student("demo-teacher-1", {
    category: "schools",
    full_name: "מורה דמו — שרה כהן",
    phone: "050-1000001",
    father_name: null,
    mother_name: null,
    status: "integration-teacher",
    class_name: null,
    teacher_name: null,
    notes: "נתון דמו",
  }),
  student("demo-teacher-2", {
    category: "schools",
    full_name: "מורה דמו — רחל לוי",
    phone: "050-1000002",
    father_name: null,
    mother_name: null,
    status: "integration-teacher",
    class_name: null,
    teacher_name: null,
    notes: "נתון דמו",
  }),
  student("demo-student-1", {
    category: "schools",
    full_name: "תלמיד דמו — יוסי אברהם",
    phone: "050-2000001",
    father_name: "אבי דמו",
    mother_name: "מירי דמו",
    status: "integration",
    class_name: "כיתה ג׳",
    teacher_name: "מורה דמו — שרה כהן",
    notes: "נתון דמו — שילוב בכיתה רגילה",
    integration_frequency: "high",
  }),
  student("demo-student-2", {
    category: "schools",
    full_name: "תלמידה דמו — נועה דוד",
    phone: "050-2000002",
    father_name: "דני דמו",
    mother_name: "ענת דמו",
    status: "personal-basket",
    class_name: "כיתה ד׳",
    teacher_name: "מורה דמו — רחל לוי",
    notes: "נתון דמו — סל אישי",
  }),
  student("demo-student-3", {
    category: "schools",
    full_name: "תלמיד דמו — איתי מזרחי",
    phone: "050-2000003",
    father_name: "רון דמו",
    mother_name: "טלי דמו",
    status: "special-ed-class",
    class_name: "כיתת חינוך מיוחד",
    teacher_name: "מורה דמו — שרה כהן",
    notes: "נתון דמו — כיתה לחנ״מ",
  }),
  student("demo-student-4", {
    category: "high-schools",
    full_name: "תלמידה דמו — מאיה פרץ",
    phone: "050-3000001",
    father_name: "אלי דמו",
    mother_name: "שירה דמו",
    status: "integration",
    class_name: "י׳2",
    teacher_name: "מורה דמו — שרה כהן",
    notes: "נתון דמו — תיכון",
  }),
  student("demo-student-5", {
    category: "high-schools",
    full_name: "תלמיד דמו — עומר ביטון",
    phone: "050-3000002",
    father_name: "גיא דמו",
    mother_name: "לינוי דמו",
    status: "personal-basket",
    class_name: "י״א1",
    teacher_name: "מורה דמו — רחל לוי",
    notes: "נתון דמו",
  }),
  student("demo-student-6", {
    category: "kindergartens",
    full_name: "ילד דמו — אורי שלום",
    phone: "050-4000001",
    father_name: "עמית דמו",
    mother_name: "הילה דמו",
    status: "integration",
    class_name: "גן שמש",
    teacher_name: "מורה דמו — רחל לוי",
    notes: "נתון דמו — גן ילדים",
  }),
  student("demo-student-7", {
    category: "kindergartens",
    full_name: "ילדה דמו — תמר רוזן",
    phone: "050-4000002",
    father_name: "אורן דמו",
    mother_name: "נועם דמו",
    status: "special-ed-class",
    class_name: "גן אור",
    teacher_name: "מורה דמו — שרה כהן",
    notes: "נתון דמו",
  }),
  student("demo-student-8", {
    category: "tutorials",
    full_name: "תלמיד דמו — דניאל חן",
    phone: "050-5000001",
    father_name: "משה דמו",
    mother_name: "רות דמו",
    status: "integration",
    class_name: "חונכות",
    teacher_name: "מורה דמו — שרה כהן",
    notes: "נתון דמו — חונכות",
  }),
];

export const DEMO_USER_ID = "demo-user";
/** כניסה חופשית — סשן קצר שתואם ל־20 דקות בממשק */
export const DEMO_SESSION_MAX_AGE_SECONDS = 20 * 60;

export function isDemoUserId(userId: string | null | undefined): boolean {
  return userId === DEMO_USER_ID;
}

export const DEMO_USER: UserProfile = {
  id: DEMO_USER_ID,
  full_name: "משתמשת דמו",
  phone: "050-9999999",
  email: "demo@example.local",
  institution_id: DEMO_INSTITUTION_ID,
  institution_code: "demo",
  institution_name: "מוסד דמו",
  school_name: "בית ספר דמו",
  institution_type: "schools",
  education_framework: "special",
  setup_completed_at: now,
  terms_accepted_at: now,
  is_admin: true,
  is_institution_owner: true,
  created_at: now,
};
