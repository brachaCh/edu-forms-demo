"use client";

import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  useForm,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { TeamRoleField } from "@/components/students/TeamRoleField";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Sparkles, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { DraftCustomField } from "@/components/students/StudentCustomFieldsDraft";
import {
  addStatusSharedCustomField,
  ensureStatusSharedCustomFields,
  getCanManageStudents,
  getCanAssignTeachers,
  getStudentCustomFields,
  getStudents,
  getUser,
  loadStudentCustomFieldsForUi,
  renameStatusSharedCustomField,
  saveStudent,
  updateStudent,
  updateStudentCustomField,
} from "@/lib/mock-store";
import { PlanLimitError } from "@/lib/plan-limits";
import { EditableText } from "@/components/editable/EditableText";
import { EditableFieldLabel } from "@/components/editable/EditableFieldLabel";
import { FAMILY_STATUS_VALUES } from "@/lib/supabase/types";
import type {
  Category,
  FamilyStatus,
  IntegrationFrequency,
  Student,
  StudentStatus,
} from "@/lib/supabase/types";
import {
  isMidYearIntakeTarget,
  markMidYearIntake,
  midYearIntakeYear,
} from "@/lib/mid-year-intake";
import {
  isPersonalSector,
  sectorFrequencyHref,
  sectorStatusHref,
  sectorTeacherHref,
  type PersonalSector,
} from "@/lib/personal-sector";
import { statusUsesTeacherStep } from "@/lib/labels";
import {
  CORE_FIELD_DEFS,
  coreFieldLabelPath,
  coreFieldsForStatus,
  DEDICATED_CORE_FIELDS,
  defaultHiddenCoreFields,
  getHiddenCoreFields,
  getStatusCustomFieldLabels,
  isPersonalBasketCityDuplicateLabel,
  isPersonalBasketPlaceholderExtraLabel,
  rememberStatusCustomFieldLabel,
  setHiddenCoreFields,
  type CoreFieldKey,
} from "@/lib/student-card";
import { normalizeEmail } from "@/lib/normalize-email";
import { joinPersonName, splitPersonName } from "@/lib/person-name";
import { normalizeIntegrationFrequency } from "@/lib/integration-frequency";
import { routeCoreFieldSavePatch } from "@/lib/form-fields";
import { cn } from "@/lib/utils";
import { sendTeacherInvite, teacherInviteErrorMessage } from "@/lib/teacher-invite";
import { canInviteInstitutionTeachers } from "@/lib/institution-owner";
import {
  teacherNameForWrite,
  teacherNamePrefill,
} from "@/lib/teacher-assignment";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  hrefWithSearch,
  parseSafeFromParam,
  previousInAppHistory,
  readNavBackHref,
  resolveDistinctHeaderBackHref,
} from "@/lib/navigation-back";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WizardCategory = "schools" | "high-schools" | "kindergartens";

const formSchema = z.object({
  teacher_name: z.string().max(120).optional(),
  first_name: z
    .string()
    .trim()
    .min(1, "נא למלא שם פרטי")
    .max(100, "שם פרטי ארוך מדי"),
  last_name: z.string().trim().max(100).optional(),
  phone: z.string().max(40).optional(),
  father_name: z.string().max(120).optional(),
  mother_name: z.string().max(120).optional(),
  class_name: z.string().max(80).optional(),
  notes: z.string().max(20_000).optional(),
  id_number: z.string().max(20).optional(),
  birth_date: z.string().max(40).optional(),
  gender: z.enum(["ז", "נ"]).optional().or(z.literal("")),
  home_address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  father_mobile: z.string().max(40).optional(),
  mother_mobile: z.string().max(40).optional(),
  email: z
    .string()
    .max(200)
    .optional()
    .refine((v) => !v?.trim() || EMAIL_RE.test(v.trim()), {
      message: "כתובת מייל לא תקינה",
    }),
  father_email: z
    .string()
    .max(200)
    .optional()
    .refine((v) => !v?.trim() || EMAIL_RE.test(v.trim()), {
      message: "כתובת מייל לא תקינה",
    }),
  mother_email: z
    .string()
    .max(200)
    .optional()
    .refine((v) => !v?.trim() || EMAIL_RE.test(v.trim()), {
      message: "כתובת מייל לא תקינה",
    }),
  role: z.string().max(120).optional(),
  characterization: z.string().max(20_000).optional(),
  family_status: z
    .enum(FAMILY_STATUS_VALUES as [FamilyStatus, ...FamilyStatus[]])
    .optional()
    .or(z.literal("")),
  integration_start_date: z.string().max(40).optional(),
  eligibility_committee_date: z.string().max(40).optional(),
  homeroom_teacher: z.string().max(120).optional(),
  education_support: z.string().max(120).optional(),
  additional_treatments: z.string().max(20_000).optional(),
  integration_frequency: z.enum(["high", "low"]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface StudentWizardProps {
  initial?: Student;
  defaultCategory?: WizardCategory | PersonalSector;
  defaultStatus?: StudentStatus;
  defaultTeacher?: string;
  defaultFrequency?: IntegrationFrequency;
  defaultClassName?: string;
  /** לאחר שמירה + המשך — לאן לעבור (ברירת מחדל: כרטיס הצפייה) */
  continueHref?: string;
  /** קליטת תלמידים חדשים באמצע השנה */
  markAsMidYearIntake?: boolean;
  intakeYear?: number;
}

const DRAFT_STUDENT_KEY = "matoah.wizard.draft-student-id";

function readDraftStudentId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DRAFT_STUDENT_KEY);
  } catch {
    return null;
  }
}

function writeDraftStudentId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(DRAFT_STUDENT_KEY, id);
    else window.localStorage.removeItem(DRAFT_STUDENT_KEY);
  } catch {
    // ignore
  }
}

function resolveCategory(
  student: Student | undefined,
  defaultCategory?: WizardCategory | PersonalSector
): WizardCategory {
  if (student?.category && student.category !== "tutorials") {
    return student.category;
  }
  if (defaultCategory) {
    return defaultCategory;
  }
  return "schools";
}

function studentToForm(student: Student): FormValues {
  const { first_name, last_name } = splitPersonName(student.full_name ?? "");
  return {
    teacher_name: student.teacher_name ?? "",
    first_name,
    last_name,
    phone: student.phone ?? "",
    father_name: student.father_name ?? "",
    mother_name: student.mother_name ?? "",
    class_name: student.class_name ?? "",
    notes: student.notes ?? "",
    id_number: student.id_number ?? "",
    birth_date: (student.birth_date ?? "").slice(0, 10),
    gender: (student.gender ?? "") as "ז" | "נ" | "",
    home_address: student.home_address ?? "",
    city: student.city ?? "",
    father_mobile: student.father_mobile ?? "",
    mother_mobile: student.mother_mobile ?? "",
    email: student.email ?? "",
    father_email: student.father_email ?? "",
    mother_email: student.mother_email ?? "",
    role: student.role ?? "",
    characterization: student.characterization ?? "",
    family_status: (student.family_status ?? "") as FamilyStatus | "",
    integration_start_date: (student.integration_start_date ?? "").slice(0, 10),
    eligibility_committee_date: (
      student.eligibility_committee_date ?? ""
    ).slice(0, 10),
    homeroom_teacher: student.homeroom_teacher ?? "",
    education_support: student.education_support ?? "",
    additional_treatments: student.additional_treatments ?? "",
    integration_frequency:
      normalizeIntegrationFrequency(student.integration_frequency) ?? undefined,
  };
}

function humanizeSaveError(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (code === "DEMO_READ_ONLY") {
    return "כניסה חופשית — אי אפשר לשמור. היכנסי עם חשבון רשום.";
  }
  if (code === "NO_INSTITUTION") {
    return "לא משויך מוסד לחשבון. השלימי הגדרת מוסד ואז נסי שוב.";
  }
  if (code === "UNAUTHORIZED" || code.startsWith("TENANT_OP_FAILED")) {
    return "ההתחברות פגה או לא תקינה. התנתקי והיכנסי מחדש, ואז נסי לשמור.";
  }
  if (code === "SERVER_UNAVAILABLE" || code === "SERVICE_ROLE_NOT_CONFIGURED") {
    return "השרת לא מוכן לשמירה כרגע. נסי שוב בעוד רגע או פני לתמיכה.";
  }
  if (raw.trim()) {
    return `השמירה נכשלה: ${raw.trim()}`;
  }
  return "השמירה נכשלה. נסי שוב.";
}

function listHrefAfterSave(options: {
  category: WizardCategory;
  status: StudentStatus | null;
  teacherName?: string | null;
  frequency?: IntegrationFrequency | null;
  continueHref?: string;
}): string {
  if (options.continueHref) return options.continueHref;

  const sector = isPersonalSector(options.category)
    ? options.category
    : null;
  const status = options.status;
  const teacher = options.teacherName?.trim();
  const frequency = options.frequency;

  if (sector && status === "personal-basket" && frequency) {
    return sectorFrequencyHref(sector, "personal-basket", frequency);
  }

  if (sector && status) {
    if (
      statusUsesTeacherStep(status) &&
      status !== "integration-teacher" &&
      teacher
    ) {
      return sectorTeacherHref(sector, status, teacher);
    }
    return sectorStatusHref(sector, status);
  }

  if (status) return `/personal-area/category/${status}`;
  return "/personal-area";
}

export function StudentWizard({
  initial,
  defaultCategory,
  defaultStatus,
  defaultTeacher,
  defaultFrequency,
  defaultClassName,
  continueHref,
  markAsMidYearIntake = false,
  intakeYear,
}: StudentWizardProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/personal-area";
  const { guestDemo } = useDataStore();

  function handleCancel() {
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    const href = hrefWithSearch(pathname, search);
    const target = resolveDistinctHeaderBackHref({
      pathname,
      from: parseSafeFromParam(
        typeof window !== "undefined"
          ? new URLSearchParams(search).get("from")
          : null
      ),
      storedFrom: readNavBackHref(),
      historyPrevious: previousInAppHistory(href),
      fallback: "/personal-area",
      search,
      treatAsLoggedIn: true,
      currentHref: href,
    });
    router.push(target);
  }
  const [studentId, setStudentId] = useState<string | null>(initial?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(Boolean(initial));
  const [category, setCategory] = useState<WizardCategory>(() =>
    resolveCategory(initial, defaultCategory)
  );
  const [status, setStatus] = useState<StudentStatus | null>(
    () => initial?.status ?? defaultStatus ?? null
  );
  const [formDefaults, setFormDefaults] = useState<FormValues>(() =>
    initial
      ? studentToForm(initial)
      : {
          teacher_name: teacherNamePrefill(
            defaultTeacher,
            getCanAssignTeachers()
          ),
          first_name: "",
          last_name: "",
          phone: "",
          father_name: "",
          mother_name: "",
          class_name: defaultClassName?.trim() || "",
          notes: "",
          id_number: "",
          birth_date: "",
          gender: "",
          home_address: "",
          city: "",
          father_mobile: "",
          mother_mobile: "",
          email: "",
          father_email: "",
          mother_email: "",
          role: "",
          characterization: "",
          family_status: "",
          integration_start_date: "",
          eligibility_committee_date: "",
          homeroom_teacher: "",
          education_support: "",
          additional_treatments: "",
          integration_frequency:
            defaultStatus === "personal-basket"
              ? defaultFrequency ?? "high"
              : undefined,
        }
  );
  const [customFields, setCustomFields] = useState<DraftCustomField[]>([]);
  const [fieldsVersion, setFieldsVersion] = useState(0);

  useEffect(() => {
    if (initial) {
      setCategory(resolveCategory(initial, defaultCategory));
      setStatus(initial.status ?? defaultStatus ?? null);
      setFormDefaults(studentToForm(initial));
      setHydrated(true);
      return;
    }

    const emptyDefaults: FormValues = {
      teacher_name: teacherNamePrefill(defaultTeacher, getCanAssignTeachers()),
      first_name: "",
      last_name: "",
      phone: "",
      father_name: "",
      mother_name: "",
      class_name: defaultClassName?.trim() || "",
      notes: "",
      id_number: "",
      birth_date: "",
      gender: "",
      home_address: "",
      city: "",
      father_mobile: "",
      mother_mobile: "",
      email: "",
      father_email: "",
      mother_email: "",
      role: "",
      characterization: "",
      family_status: "",
      integration_start_date: "",
      eligibility_committee_date: "",
      homeroom_teacher: "",
      education_support: "",
      additional_treatments: "",
      integration_frequency:
        defaultStatus === "personal-basket"
          ? defaultFrequency ?? "high"
          : undefined,
    };

    const draftId = readDraftStudentId();
    if (!draftId) {
      setCategory(resolveCategory(undefined, defaultCategory));
      setStatus(defaultStatus ?? null);
      setFormDefaults(emptyDefaults);
      setHydrated(true);
      return;
    }

    const existing = getStudents().find((s) => s.id === draftId);
    if (!existing) {
      writeDraftStudentId(null);
      setCategory(resolveCategory(undefined, defaultCategory));
      setStatus(defaultStatus ?? null);
      setFormDefaults(emptyDefaults);
      setHydrated(true);
      return;
    }

    setStudentId(existing.id);
    setCategory(resolveCategory(existing, defaultCategory));
    setStatus(existing.status ?? defaultStatus ?? null);
    const fromExisting = studentToForm(existing);
    setFormDefaults({
      ...fromExisting,
      teacher_name:
        fromExisting.teacher_name?.trim() ||
        teacherNamePrefill(defaultTeacher, getCanAssignTeachers()),
      integration_frequency:
        fromExisting.integration_frequency ||
        (defaultStatus === "personal-basket" ||
        existing.status === "personal-basket"
          ? defaultFrequency ?? "high"
          : undefined),
    });
    setHydrated(true);
  }, [initial, defaultCategory, defaultStatus, defaultTeacher, defaultFrequency]);

  async function persist(
    values: FormValues,
    hiddenCoreFields: CoreFieldKey[]
  ): Promise<string | null> {
    const frequency =
      status === "personal-basket"
        ? normalizeIntegrationFrequency(values.integration_frequency) ??
          defaultFrequency ??
          "high"
        : null;
    const birthOrPhone = routeCoreFieldSavePatch(
      "birth_date",
      values.birth_date?.trim() || ""
    );
    const phoneOrBirth = routeCoreFieldSavePatch(
      "phone",
      values.phone?.trim() || ""
    );
    const payload = {
      full_name: joinPersonName(
        values.first_name || "",
        values.last_name || ""
      ),
      father_name: values.father_name || null,
      mother_name: values.mother_name || null,
      category: category as Category,
      class_name: values.class_name || null,
      status,
      teacher_name: teacherNameForWrite(
        values.teacher_name,
        getCanAssignTeachers()
      ),
      notes: values.notes || null,
      id_number: values.id_number?.trim() || null,
      gender: values.gender ? (values.gender as "ז" | "נ") : null,
      home_address: values.home_address?.trim() || null,
      city: values.city?.trim() || null,
      father_mobile: values.father_mobile?.trim() || null,
      mother_mobile: values.mother_mobile?.trim() || null,
      email: values.email?.trim() || null,
      father_email: values.father_email
        ? normalizeEmail(values.father_email) || null
        : null,
      mother_email: values.mother_email
        ? normalizeEmail(values.mother_email) || null
        : null,
      role: values.role?.trim() || null,
      characterization: values.characterization?.trim() || null,
      family_status: values.family_status || null,
      integration_start_date: values.integration_start_date?.trim() || null,
      eligibility_committee_date:
        values.eligibility_committee_date?.trim() || null,
      homeroom_teacher: values.homeroom_teacher?.trim() || null,
      education_support: values.education_support?.trim() || null,
      additional_treatments: values.additional_treatments?.trim() || null,
      integration_frequency: frequency,
      ...(markAsMidYearIntake
        ? { calendar_year: intakeYear ?? midYearIntakeYear() }
        : {}),
      // ניתוב לפי סוג ערך: טלפון/תאריך לא מתערבבים בין העמודות
      phone:
        (phoneOrBirth.phone as string | null | undefined) ??
        (birthOrPhone.phone as string | null | undefined) ??
        null,
      birth_date:
        (birthOrPhone.birth_date as string | null | undefined) ??
        (phoneOrBirth.birth_date as string | null | undefined) ??
        null,
    };

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      let id = studentId;
      if (id) {
        // TZ-28: Members don't send status (server would block changes anyway)
        // TZ-32: Non-owners (including admins) don't send teacher_name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let updatePayload: Record<string, any> = { ...payload };
        if (!getCanAssignTeachers()) {
          delete updatePayload.teacher_name;
        }
        if (!getCanManageStudents()) {
          delete updatePayload.status;
        }
        await updateStudent(id, updatePayload);
      } else {
        const created = await saveStudent(payload);
        id = created.id;
        setStudentId(created.id);
        writeDraftStudentId(created.id);
        if (
          markAsMidYearIntake &&
          isMidYearIntakeTarget(created.status) &&
          isPersonalSector(category)
        ) {
          markMidYearIntake(created.id, {
            targetStatus: created.status,
            year: intakeYear ?? midYearIntakeYear(),
            sector: category,
            frequency:
              created.status === "personal-basket"
                ? normalizeIntegrationFrequency(
                    created.integration_frequency
                  ) ??
                  defaultFrequency ??
                  "high"
                : null,
          });
        }
        for (const field of customFields) {
          if (field.label.trim()) {
            await addStatusSharedCustomField(
              created.id,
              field.label.trim(),
              field.value.trim()
            );
          }
        }
        // שדות מתבנית הקטגוריה שלא הוזנו בטופס — נוצרים ריקים בסדר המשותף
        if (status) {
          await ensureStatusSharedCustomFields(created.id);
        }
        setCustomFields([]);
        setFieldsVersion((v) => v + 1);
      }
      setHiddenCoreFields(id, hiddenCoreFields, status, category);
      setFormDefaults(values);
      setSaveMessage("saved");
      return id;
    } catch (error) {
      if (error instanceof PlanLimitError) {
        setSaveError(error.message);
        return null;
      }
      const raw = error instanceof Error ? error.message : "";
      setSaveError(humanizeSaveError(raw));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function continueToNext(
    values: FormValues,
    hiddenCoreFields: CoreFieldKey[],
    sendInvite = false
  ) {
    const id = await persist(values, hiddenCoreFields);
    if (!id) return;

    if (
      sendInvite &&
      status === "integration-teacher" &&
      canInviteInstitutionTeachers(getUser())
    ) {
      const inviteResult = await sendTeacherInvite(id);
      if (!inviteResult.ok) {
        setSaveMessage("saved");
        setSaveError(
          `הכרטיס נשמר, אך שליחת ההזמנה נכשלה: ${teacherInviteErrorMessage(inviteResult.error)}`
        );
        return;
      }
      setSaveError(null);
      setSaveMessage("saved-with-invite");
    }

    writeDraftStudentId(null);
    router.push(
      listHrefAfterSave({
        category,
        status,
        teacherName: values.teacher_name,
        frequency:
          status === "personal-basket"
            ? normalizeIntegrationFrequency(values.integration_frequency) ??
              defaultFrequency ??
              "high"
            : null,
        continueHref,
      })
    );
    router.refresh();
  }

  if (!hydrated) {
    return (
      <div className="menu-box p-8 text-center text-pink">
        <EditableText path="common.loading" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {saveMessage === "saved-with-invite" ? (
        <div className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-700">
          <EditableText path="wizard.staffInviteSentSuccess" />
        </div>
      ) : saveMessage ? (
        <div className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-700">
          <EditableText path="wizard.savedSuccess" />
        </div>
      ) : null}
      {saveError ? (
        <div className="shrink-0 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-sm font-medium text-destructive">
          {saveError}
        </div>
      ) : null}
      {guestDemo ? (
        <div className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-800">
          כניסה חופשית: אפשר למלא ולבדוק את הטופס, אבל אי אפשר לשמור שינויים.
        </div>
      ) : null}
      <Card className="scroll-visible min-h-0 flex-1">
        <CardContent className="p-6 pb-8">
          <WizardForm
            key={`wizard-${studentId ?? "new"}-${fieldsVersion}`}
            defaults={formDefaults}
            studentId={studentId ?? undefined}
            category={category}
            status={status}
            customFields={customFields}
            onCustomFieldsChange={setCustomFields}
            saving={saving}
            onContinue={(vals, hidden, sendInvite) => {
              void continueToNext(vals, hidden, sendInvite);
            }}
            onCancel={handleCancel}
            guestDemo={guestDemo}
            canManageStudents={getCanManageStudents()}
            canAssignTeachers={getCanAssignTeachers()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** שדות השם — נבנים ידנית בראש האשף ולא דרך WizardCoreField */
const NAME_WIZARD_FIELDS: CoreFieldKey[] = [
  "full_name",
  "first_name",
  "last_name",
];

/** שדות טקסט ארוכים — תופסים שורה מלאה */
const WIDE_WIZARD_FIELDS: CoreFieldKey[] = [
  "email",
  "role",
  "additional_treatments",
  "notes",
];

function WizardCoreField({
  field,
  status,
  register,
  control,
  setValue,
  onHide,
  allowHide = true,
  disabled = false,
}: {
  field: (typeof CORE_FIELD_DEFS)[number];
  status: StudentStatus | null;
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  onHide: (key: CoreFieldKey) => void;
  allowHide?: boolean;
  /** TZ-28: Disable the field (e.g., teacher_name for members) */
  disabled?: boolean;
}) {
  const inputType = field.inputType ?? "text";
  const isLtr = inputType === "tel" || inputType === "email";
  const watchedValue = useWatch({
    control,
    name: field.key as keyof FormValues,
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        WIDE_WIZARD_FIELDS.includes(field.key) && "sm:col-span-2"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={field.key}>
          <EditableText path={coreFieldLabelPath(field.key, status)} />
          {disabled && (
            <span className="mr-2 text-xs text-muted-foreground">(נעול)</span>
          )}
        </Label>
        {allowHide && !disabled ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-8 shrink-0"
            onClick={() => onHide(field.key)}
          >
            <Trash2 className="h-4 w-4" />
            <EditableText path="common.delete" />
          </Button>
        ) : null}
      </div>
      {inputType === "team-role" ? (
        <TeamRoleField
          value={String(watchedValue ?? "")}
          disabled={disabled}
          onChange={(next) =>
            setValue("role", next, { shouldDirty: true, shouldValidate: true })
          }
          selectClassName="h-11 rounded-2xl px-4"
          inputClassName="rounded-2xl px-4"
        />
      ) : inputType === "select" && field.options ? (
        <select
          id={field.key}
          className={cn(
            "flex h-11 w-full rounded-2xl border border-input bg-white px-4 py-2 text-sm",
            disabled && "cursor-not-allowed bg-muted opacity-60"
          )}
          disabled={disabled}
          {...register(field.key as Exclude<CoreFieldKey, "full_name" | "single_responsible_party">)}
        >
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={field.key}
          type={inputType === "date" ? "date" : isLtr ? inputType : "text"}
          dir={isLtr ? "ltr" : undefined}
          disabled={disabled}
          className={cn(
            isLtr && "text-right",
            disabled && "cursor-not-allowed bg-muted opacity-60"
          )}
          {...register(field.key as Exclude<CoreFieldKey, "full_name" | "single_responsible_party">)}
        />
      )}
    </div>
  );
}

function WizardForm({
  defaults,
  studentId,
  category,
  status,
  customFields,
  onCustomFieldsChange,
  onContinue,
  onCancel,
  saving,
  guestDemo,
  canManageStudents,
  canAssignTeachers,
}: {
  defaults: FormValues;
  studentId?: string;
  category: WizardCategory;
  status: StudentStatus | null;
  customFields: DraftCustomField[];
  onCustomFieldsChange: Dispatch<SetStateAction<DraftCustomField[]>>;
  onContinue: (v: FormValues, hidden: CoreFieldKey[], sendInvite?: boolean) => void;
  onCancel: () => void;
  saving: boolean;
  guestDemo: boolean;
  /** TZ-28: Whether user can manage students (owner/admin/system-admin) */
  canManageStudents: boolean;
  /** TZ-32: Whether user can assign students to teachers (owner/system-admin only) */
  canAssignTeachers: boolean;
}) {
  const [hiddenCoreFields, setHiddenCoreFieldsState] = useState<CoreFieldKey[]>(
    () =>
      studentId
        ? getHiddenCoreFields(studentId, status, category)
        : status
          ? getHiddenCoreFields("", status, category)
          : defaultHiddenCoreFields(status)
  );
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });

  const [savedCustomFields, setSavedCustomFields] = useState<
    ReturnType<typeof getStudentCustomFields>
  >([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [adding, setAdding] = useState(false);
  const [sendTeacherInviteChecked, setSendTeacherInviteChecked] = useState(false);

  const emailValue = useWatch({ control, name: "email" });
  const hasInviteEmail = EMAIL_RE.test((emailValue ?? "").trim());

  function runSubmit(
    values: FormValues,
    next: (
      v: FormValues,
      hidden: CoreFieldKey[],
      sendInvite?: boolean
    ) => void | Promise<void>
  ) {
    void (async () => {
      if (guestDemo) return;
      if (studentId) {
        for (const field of savedCustomFields) {
          await updateStudentCustomField(field.id, {
            label: field.label.trim() || "שדה נוסף",
            value: field.value.trim(),
          });
        }
      }
      await next(
        values,
        hiddenCoreFields,
        sendTeacherInviteChecked && hasInviteEmail
      );
    })();
  }

  useEffect(() => {
    if (!hasInviteEmail) {
      setSendTeacherInviteChecked(false);
    }
  }, [hasInviteEmail]);

  useEffect(() => {
    if (!studentId) {
      setSavedCustomFields([]);
      setHiddenCoreFieldsState(
        status
          ? getHiddenCoreFields("", status, category)
          : defaultHiddenCoreFields(status)
      );
      return;
    }
    setHiddenCoreFieldsState(
      getHiddenCoreFields(studentId, status, category)
    );
    let cancelled = false;
    void ensureStatusSharedCustomFields(studentId).then((fields) => {
      if (!cancelled) setSavedCustomFields(fields);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, status, category]);

  // תלמיד חדש: מציגים את שדות התבנית של הקטגוריה (לפי מה שנשמר/נגרר)
  useEffect(() => {
    if (studentId || !status) return;
    const template = getStatusCustomFieldLabels(status, category);
    onCustomFieldsChange((prev) => {
      const fromTemplate =
        prev.length > 0
          ? prev
          : template.map((label) => ({
              id: crypto.randomUUID(),
              label,
              value: "",
            }));
      if (status !== "personal-basket") return fromTemplate;
      return fromTemplate.filter(
        (field) =>
          !isPersonalBasketPlaceholderExtraLabel(field.label) &&
          !isPersonalBasketCityDuplicateLabel(field.label)
      );
    });
  }, [studentId, status, category, onCustomFieldsChange]);

  const listedCustomFields = studentId ? savedCustomFields : customFields;

  function hideCoreField(key: CoreFieldKey) {
    setHiddenCoreFieldsState((prev) => {
      const next = prev.includes(key) ? prev : [...prev, key];
      // שמירה מיידית לתבנית המשותפת — גם לפני "שמירה והמשך"
      if (status) {
        setHiddenCoreFields(studentId ?? "", next, status, category);
      }
      return next;
    });
  }

  const isFieldVisible = (key: CoreFieldKey) =>
    !hiddenCoreFields.includes(key);

  function updateCustomFieldValue(id: string, value: string) {
    if (studentId) {
      setSavedCustomFields((current) =>
        current.map((field) =>
          field.id === id ? { ...field, value } : field
        )
      );
      return;
    }

    onCustomFieldsChange((prev) =>
      prev.map((field) => (field.id === id ? { ...field, value } : field))
    );
  }

  async function handleCustomValueBlur(id: string, value: string) {
    if (!studentId) return;
    await updateStudentCustomField(id, { value: value.trim() });
    setSavedCustomFields(await loadStudentCustomFieldsForUi(studentId));
  }

  async function handleCustomLabelBlur(id: string, label: string) {
    const nextLabel = label.trim() || "שדה נוסף";
    if (studentId) {
      const current = savedCustomFields.find((field) => field.id === id);
      setSavedCustomFields((prev) =>
        prev.map((field) =>
          field.id === id
            ? {
                ...field,
                label: nextLabel,
                value:
                  current && current.label.trim() === nextLabel
                    ? field.value
                    : "",
              }
            : field
        )
      );
      if (current) {
        await renameStatusSharedCustomField(
          id,
          current.label,
          nextLabel,
          status,
          category
        );
        setSavedCustomFields(await ensureStatusSharedCustomFields(studentId));
      }
      return;
    }
    onCustomFieldsChange((prev) =>
      prev.map((field) =>
        field.id === id
          ? {
              ...field,
              label: nextLabel,
              value: field.label.trim() === nextLabel ? field.value : "",
            }
          : field
      )
    );
  }

  async function handleAddCustomField() {
    if (adding) return;
    const nextIndex = listedCustomFields.length + 1;
    const label = newFieldName.trim() || `שדה נוסף ${nextIndex}`;

    setAdding(true);
    try {
      if (studentId) {
        await addStatusSharedCustomField(studentId, label, "");
        setSavedCustomFields(await ensureStatusSharedCustomFields(studentId));
      } else {
        if (status) {
          rememberStatusCustomFieldLabel(status, label, category);
        }
        onCustomFieldsChange((prev) => [
          ...prev,
          { id: crypto.randomUUID(), label, value: "" },
        ]);
      }
      setNewFieldName("");
    } finally {
      setAdding(false);
    }
  }

  const isStaffCard = status === "integration-teacher";

  // שם מלא ושכיחות מוצגים בנפרד, שאר שדות הליבה לפי סוג הכרטיס
  const wizardCoreFields = coreFieldsForStatus(status)
    .filter(
      (key) =>
        !NAME_WIZARD_FIELDS.includes(key) &&
        !DEDICATED_CORE_FIELDS.includes(key) &&
        isFieldVisible(key)
    )
    .map((key) => CORE_FIELD_DEFS.find((field) => field.key === key))
    .filter((field): field is (typeof CORE_FIELD_DEFS)[number] =>
      Boolean(field)
    );

  return (
    <form
      onSubmit={handleSubmit((values) =>
        runSubmit(values, onContinue)
      )}
      className="flex flex-col gap-5"
    >
      <div className="mb-2 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <EditableText
            path={
              isStaffCard ? "wizard.staffCardTitle" : "wizard.step1Title"
            }
            as="h2"
            block
            className="text-xl font-extrabold text-brand-900"
          />
          <EditableText
            path={
              isStaffCard
                ? "wizard.staffCardSubtitle"
                : "wizard.step1LongSubtitle"
            }
            as="p"
            block
            className="text-sm text-brand-600"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {isStaffCard ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="first_name">
              <EditableText path="wizard.staffNameLabel" />
            </Label>
            <Input id="first_name" {...register("first_name")} />
            {errors.first_name && (
              <p className="text-xs text-destructive">
                {errors.first_name.message}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="first_name">
                <EditableText path="wizard.studentFirstNameLabel" />
              </Label>
              <Input id="first_name" {...register("first_name")} />
              {errors.first_name && (
                <p className="text-xs text-destructive">
                  {errors.first_name.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="last_name">
                <EditableText path="wizard.studentLastNameLabel" />
              </Label>
              <Input id="last_name" {...register("last_name")} />
              {errors.last_name && (
                <p className="text-xs text-destructive">
                  {errors.last_name.message}
                </p>
              )}
            </div>
          </>
        )}

        {status === "personal-basket" && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="integration_frequency">
              <EditableText path="studentFields.integrationFrequency" />
            </Label>
            <select
              id="integration_frequency"
              className="flex h-11 w-full rounded-2xl border border-input bg-white px-4 py-2 text-sm"
              {...register("integration_frequency")}
              defaultValue={defaults.integration_frequency ?? "high"}
            >
              <option value="high">שכיחות גבוהה</option>
              <option value="low">שכיחות נמוכה</option>
            </select>
          </div>
        )}

        {wizardCoreFields.map((field) => (
          <WizardCoreField
            key={field.key}
            field={field}
            status={status}
            register={register}
            control={control}
            setValue={setValue}
            onHide={hideCoreField}
            allowHide={false}
            disabled={!canAssignTeachers && field.key === "teacher_name"}
          />
        ))}

        {listedCustomFields.map((field) => (
          <div key={field.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`custom-${field.id}`}>
                {isStaffCard ? (
                  <span>{field.label}</span>
                ) : (
                  <EditableFieldLabel
                    value={field.label}
                    onSave={(next) =>
                      guestDemo
                        ? undefined
                        : handleCustomLabelBlur(field.id, next)
                    }
                  />
                )}
              </Label>
            </div>
            <Input
              id={`custom-${field.id}`}
              value={field.value}
              onChange={(e) =>
                updateCustomFieldValue(field.id, e.target.value)
              }
              onBlur={(e) =>
                guestDemo
                  ? undefined
                  : void handleCustomValueBlur(field.id, e.target.value)
              }
              aria-label={field.label || "ערך השדה"}
            />
          </div>
        ))}

        {!isStaffCard ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="new-custom-field">
              <EditableText path="studentCustomFields.labelPlaceholder" />
            </Label>
            <div className="flex gap-2">
              <Input
                id="new-custom-field"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddCustomField();
                  }
                }}
                className="flex-1"
                placeholder=""
              />
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={guestDemo || adding}
                onClick={() => void handleAddCustomField()}
              >
                <Plus className="h-4 w-4" />
                <EditableText path="studentCustomFields.addButton" />
              </Button>
            </div>
          </div>
        ) : null}

        {isStaffCard && canInviteInstitutionTeachers(getUser()) ? (
          <div className="sm:col-span-2 rounded-2xl border-2 border-brand-200 bg-brand-50/60 p-4">
            <label
              htmlFor="staff-send-invite"
              className={cn(
                "flex cursor-pointer items-start gap-3",
                (!hasInviteEmail || guestDemo || saving) &&
                  "cursor-not-allowed opacity-70"
              )}
            >
              <Checkbox
                id="staff-send-invite"
                checked={sendTeacherInviteChecked}
                onCheckedChange={(checked) =>
                  setSendTeacherInviteChecked(checked === true)
                }
                disabled={!hasInviteEmail || guestDemo || saving}
                className="mt-0.5"
              />
              <span className="text-sm font-medium leading-relaxed text-ink">
                <EditableText path="wizard.staffSendInviteCheckbox" />
              </span>
            </label>
            {!hasInviteEmail ? (
              <p className="mt-2 pr-8 text-xs text-pink">
                <EditableText path="wizard.staffSendInviteNoEmailHint" />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-brand-100 pt-4 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          <EditableText path="wizard.cancelButton" />
        </Button>
        <Button type="submit" size="lg" disabled={guestDemo || saving}>
          <Save className="h-5 w-5" />
          <EditableText path="wizard.saveAndContinue" />
        </Button>
      </div>
    </form>
  );
}
