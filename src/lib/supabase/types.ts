export type Category =
  | "schools"
  | "high-schools"
  | "kindergartens"
  | "tutorials";

export type StudentStatus =
  | "integration"
  | "personal-basket"
  | "special-ed-class"
  | "integration-teacher";

/** שכיחות גבוהה / נמוכה (סל אישי) */
export type IntegrationFrequency = "high" | "low";

export type SubscriptionStatus =
  | "none"
  | "pending_payment"
  | "active"
  | "expired"
  | "cancelled";

export type PaymentMethod = "credit_card" | "bank_transfer";

/** תפקיד חברות במוסד */
export type InstitutionMembershipRole = "owner" | "admin" | "member";

/** חברות משתמש במוסד (TZ-17) */
export interface UserInstitution {
  id: string;
  user_id: string;
  institution_id: string;
  role: InstitutionMembershipRole;
  created_at: string;
}

/** פרטי מוסד עם מידע על החברות — לתצוגה בבורר מוסדות */
export interface UserInstitutionWithDetails {
  institution_id: string;
  institution_code: string;
  institution_name: string;
  school_name: string | null;
  logo_url: string | null;
  role: InstitutionMembershipRole;
  membership_created_at: string;
}

export interface Institution {
  id: string;
  code: string;
  name: string;
  school_name: string | null;
  logo_url: string | null;
  institution_type?: Exclude<Category, "tutorials"> | null;
  education_framework?: "regular" | "special" | null;
  plan_id?: string | null;
  plan_selected_at?: string | null;
  subscription_status?: SubscriptionStatus | null;
  sumit_customer_id?: string | null;
  sumit_transaction_id?: string | null;
  paid_at?: string | null;
  plan_expires_at?: string | null;
  payment_method?: PaymentMethod | null;
  plan_custom_classes?: number | null;
  plan_custom_students?: number | null;
  special_price_agorot?: number | null;
  renewal_reminder_for_expires_at?: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  institution_id: string | null;
  institution_code?: string | null;
  /** נשמר מקומית לשימוש חוזר באזור האישי */
  institution_name?: string | null;
  school_name?: string | null;
  institution_type?: Exclude<Category, "tutorials"> | null;
  education_framework?: "regular" | "special" | null;
  institution_logo_url?: string | null;
  setup_completed_at?: string | null;
  plan_id?: string | null;
  plan_selected_at?: string | null;
  subscription_status?: SubscriptionStatus | null;
  paid_at?: string | null;
  plan_expires_at?: string | null;
  payment_method?: PaymentMethod | null;
  plan_custom_classes?: number | null;
  plan_custom_students?: number | null;
  special_price_agorot?: number | null;
  terms_accepted_at: string | null;
  is_admin: boolean;
  /** בעלת המוסד — מי שנרשמה/רכשה; רק היא מזמינה מורות */
  is_institution_owner?: boolean;
  created_at: string;
}

/** ז/נ — מגדר לכרטיס התלמיד */
export type StudentGender = "ז" | "נ";

/** מצב משפחתי של ההורים */
export type FamilyStatus = "נשואים" | "פרודים" | "גרושים";

export const FAMILY_STATUS_VALUES: FamilyStatus[] = [
  "נשואים",
  "פרודים",
  "גרושים",
];

export interface Student {
  id: string;
  institution_id: string | null;
  category: Category;
  full_name: string;
  phone: string | null;
  father_name: string | null;
  mother_name: string | null;
  status: StudentStatus | null;
  class_name: string | null;
  teacher_name: string | null;
  notes: string | null;
  /** ת.ז */
  id_number?: string | null;
  /** תאריך לידה (ISO YYYY-MM-DD) */
  birth_date?: string | null;
  /** ז/נ */
  gender?: StudentGender | null;
  /** כתובת מגורים (רחוב + מס') */
  home_address?: string | null;
  /** עיר / ישוב */
  city?: string | null;
  /** נייד אב */
  father_mobile?: string | null;
  /** נייד אם */
  mother_mobile?: string | null;
  /** כתובת מייל (הורים — כללי, לשימוש חוזר) */
  email?: string | null;
  /** מייל אבא */
  father_email?: string | null;
  /** מייל אמא */
  mother_email?: string | null;
  /** תפקיד (לכרטיס איש צוות) */
  role?: string | null;
  /** חשבון משתמש מקושר (לאחר קבלת הזמנה) */
  user_profile_id?: string | null;
  /** אפיון התלמיד (כרטיס תלמיד כיתה) */
  characterization?: string | null;
  /** מצב משפחתי של ההורים */
  family_status?: FamilyStatus | null;
  /** תאריך כניסה לשילוב (ISO YYYY-MM-DD) */
  integration_start_date?: string | null;
  /** תאריך וועדת אפיון וזכאות (ISO YYYY-MM-DD) */
  eligibility_committee_date?: string | null;
  /** מחנכת */
  homeroom_teacher?: string | null;
  /** תומכת חינוך */
  education_support?: string | null;
  /** טיפולים נוספים */
  additional_treatments?: string | null;
  /** שכיחות — גבוהה / נמוכה (רק לסטטוס personal-basket / סל אישי) */
  integration_frequency?: IntegrationFrequency | null;
  /** שנה קלנדרית (עברית, למשל 5787 = תשפ״ז) — לשיוך מסמכים וארכיון */
  calendar_year?: number | null;
  /** אם מוגדר — תיק התלמיד בארכיון (הוסר מרשימות פעילות) */
  archived_at?: string | null;
  /**
   * TZ-30: אחראי יחיד (חד הורי / יתום / אפוטרופוס יחיד).
   * כשמסומן TRUE, ויתור הסודיות דורש חתימה אחת בלבד (במקום שתיים).
   * רק מנהלת המוסד יכולה לשנות שדה זה.
   */
  single_responsible_party?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface StudentDocument {
  id: string;
  student_id: string;
  name: string;
  mime_type: string;
  size: number;
  data_url: string;
  /** תיקיית מסמכים לבחירה בכרטיס */
  folder: string;
  uploaded_at: string;
  /** אם מוגדר — המסמך בארכיון */
  archived_at?: string | null;
  /** שנה קלנדרית עברית לשיוך בארכיון */
  calendar_year?: number | null;
  /**
   * TZ-99: סריקה חתומה של ויתור סודיות — מקיימת את שער התיק
   * כמו חתימה דיגיטלית. רק מסמך פעיל אחד לתלמיד.
   */
  is_paper_waiver?: boolean | null;
}

export interface StudentCustomField {
  id: string;
  student_id: string;
  label: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export type FormFillStatus = "draft" | "saved" | "completed";

export interface StudentFormFill {
  id: string;
  student_id: string;
  form_id: string;
  data: Record<string, string>;
  status: FormFillStatus;
  document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectHoursRow {
  id: string;
  management_total: number;
  management_used: number;
  programming_total: number;
  programming_used: number;
  extra_total: number;
  extra_used: number;
  updated_at: string;
}

export interface SiteTextOverridesRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
}

/** TZ-23: ישיבת צוות מוסדית (הזמנות + ישיבות עתידיות) */
export interface StaffMeeting {
  id: string;
  institution_id: string;
  student_id: string | null;
  title: string;
  meeting_at: string;
  location: string | null;
  notes: string | null;
  invitation_subject: string;
  invitation_text: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** TZ-23: מוזמן לישיבת צוות (איש צוות של המוסד) */
export interface StaffMeetingInvitee {
  id: string;
  meeting_id: string;
  staff_student_id: string | null;
  user_id: string | null;
  full_name: string;
  email: string;
  sent_at: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      institutions: {
        Row: Institution;
        Insert: Omit<Institution, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<Institution, "id" | "created_at">>;
        Relationships: [];
      };
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<UserProfile, "created_at">>;
        Relationships: [];
      };
      user_institutions: {
        Row: UserInstitution;
        Insert: Omit<UserInstitution, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<UserInstitution, "id" | "created_at">>;
        Relationships: [];
      };
      students: {
        Row: Student;
        Insert: Omit<Student, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Student, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      student_documents: {
        Row: StudentDocument;
        Insert: Omit<StudentDocument, "id" | "uploaded_at">;
        Update: Partial<Omit<StudentDocument, "id" | "uploaded_at">>;
        Relationships: [];
      };
      student_custom_fields: {
        Row: StudentCustomField;
        Insert: Omit<StudentCustomField, "id" | "created_at" | "updated_at">;
        Update: Partial<
          Omit<StudentCustomField, "id" | "created_at" | "updated_at">
        >;
        Relationships: [];
      };
      student_form_fills: {
        Row: StudentFormFill;
        Insert: Omit<StudentFormFill, "id" | "created_at" | "updated_at"> & {
          id?: string;
          document_id?: string | null;
          status?: FormFillStatus;
          data?: Record<string, string>;
        };
        Update: Partial<
          Omit<StudentFormFill, "id" | "student_id" | "form_id" | "created_at">
        >;
        Relationships: [];
      };
      project_hours: {
        Row: ProjectHoursRow;
        Insert: Omit<ProjectHoursRow, "id" | "updated_at">;
        Update: Partial<Omit<ProjectHoursRow, "id" | "updated_at">>;
        Relationships: [];
      };
      project_hours_log: {
        Row: {
          id: string;
          pool: string;
          amount: number;
          created_at: string;
        };
        Insert: { pool: string; amount: number };
        Update: Partial<{ pool: string; amount: number }>;
        Relationships: [];
      };
      site_text_overrides: {
        Row: SiteTextOverridesRow;
        Insert: {
          id?: string;
          data?: Record<string, unknown>;
          updated_at?: string;
        };
        Update: Partial<{
          data: Record<string, unknown>;
          updated_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      matoah_deduct_hours: {
        Args: { p_pool: string; p_amount: number };
        Returns: ProjectHoursRow;
      };
      matoah_add_hours: {
        Args: { p_pool: string; p_amount: number };
        Returns: ProjectHoursRow;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
