"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeaderLogosUpload } from "@/components/personal/DocumentHeaderLogosUpload";
import { EditableText } from "@/components/editable/EditableText";
import { cacheAuthenticatedUser, clearRegistrationStep2Draft, getRegistrationStep2Draft, getUser } from "@/lib/mock-store";
import { useDataStore } from "@/components/providers/DataStoreProvider";
import {
  persistSchoolLogoDataUrl,
  resolveAssociationLogoDataUrl,
  resolveSchoolLogoDataUrl,
  persistInstitutionFooterLogoDataUrl,
  syncAssociationLogoFromProfile,
} from "@/lib/document-branding";
import { MANAGE_PLAN_PATH, REGISTER_PLAN_PATH } from "@/lib/billing-access";
import {
  isPilotBlockedInstitutionType,
  isSetupBlockedForInstitutionType,
  PILOT_BLOCKED_SETUP_MESSAGE,
  PILOT_BLOCKED_ERROR_CODE,
} from "@/lib/billing/pilot-blocked-types";
import { institutionProfileHref } from "@/lib/personal-sector";
import type { UserProfile } from "@/lib/supabase/types";

type InstitutionType = "schools" | "high-schools" | "kindergartens" | "";
type Framework = "regular" | "special" | "";

const INSTITUTION_TYPES = new Set<InstitutionType>([
  "schools",
  "high-schools",
  "kindergartens",
]);
const FRAMEWORKS = new Set<Framework>(["regular", "special"]);

function toInstitutionType(
  value: string | null | undefined
): InstitutionType {
  if (value && INSTITUTION_TYPES.has(value as InstitutionType)) {
    return value as InstitutionType;
  }
  return "";
}

function toFramework(value: string | null | undefined): Framework {
  if (value && FRAMEWORKS.has(value as Framework)) {
    return value as Framework;
  }
  return "";
}

function onboardingInstitutionFields(profile: UserProfile) {
  const draft = getRegistrationStep2Draft();
  return {
    institution_code:
      draft?.institution_code ?? profile.institution_code ?? "",
    institution_name:
      draft?.institution_name ?? profile.institution_name ?? "",
    school_name: draft?.school_name ?? profile.school_name ?? "",
  };
}

interface InstitutionSetupFormProps {
  editMode?: boolean;
  /** חזרה מבחירת חבילה — לשינוי מסגרת חינוך */
  fromPlan?: boolean;
}

export function InstitutionSetupForm({
  editMode = false,
  fromPlan = false,
}: InstitutionSetupFormProps) {
  const router = useRouter();
  const { guestDemo } = useDataStore();
  const initialUser = getUser();
  const initialOnboarding =
    !editMode && initialUser && !initialUser.setup_completed_at;
  const initialFields = initialOnboarding
    ? onboardingInstitutionFields(initialUser)
    : {
        institution_code: initialUser?.institution_code ?? "",
        institution_name: initialUser?.institution_name ?? "",
        school_name: initialUser?.school_name ?? "",
      };
  const [profile, setProfile] = useState<UserProfile | null>(() => initialUser);
  const [institutionCode, setInstitutionCode] = useState(
    () => initialFields.institution_code
  );
  const [institutionName, setInstitutionName] = useState(
    () => initialFields.institution_name
  );
  const [schoolName, setSchoolName] = useState(() => initialFields.school_name);
  const [institutionType, setInstitutionType] = useState<InstitutionType>(() =>
    initialOnboarding
      ? ""
      : toInstitutionType(initialUser?.institution_type)
  );
  const [framework, setFramework] = useState<Framework>(() =>
    initialOnboarding ? "" : toFramework(initialUser?.education_framework)
  );
  const [initialFramework, setInitialFramework] = useState<Framework>(() =>
    initialOnboarding ? "" : toFramework(initialUser?.education_framework)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frameworkDirty =
    Boolean(initialFramework) &&
    Boolean(framework) &&
    initialFramework !== framework;

  const setupBlocked = isSetupBlockedForInstitutionType(
    institutionType || null,
    profile?.institution_type ?? null,
    profile?.subscription_status ?? null
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/institution")
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("LOAD_FAILED");
        const data = (await response.json()) as { profile: UserProfile };
        if (cancelled) return;
        const next = data.profile;
        setProfile(next);
        if (!editMode && !next.setup_completed_at) {
          const fields = onboardingInstitutionFields(next);
          setInstitutionCode(fields.institution_code);
          setInstitutionName(fields.institution_name);
          setSchoolName(fields.school_name);
          setInstitutionType("");
          setFramework("");
          cacheAuthenticatedUser({
            ...next,
            institution_code: fields.institution_code,
            institution_name: fields.institution_name,
            school_name: fields.school_name,
            institution_type: null,
            education_framework: null,
          });
          syncAssociationLogoFromProfile({
            institutionId: next.institution_id,
            institutionCode: fields.institution_code,
            institutionLogoUrl: next.institution_logo_url,
          });
        } else {
          setInstitutionCode(next.institution_code ?? "");
          setInstitutionName(next.institution_name ?? "");
          setSchoolName(next.school_name ?? "");
          setInstitutionType(toInstitutionType(next.institution_type));
          setFramework(toFramework(next.education_framework));
          setInitialFramework(toFramework(next.education_framework));
          cacheAuthenticatedUser(next);
          syncAssociationLogoFromProfile({
            institutionId: next.institution_id,
            institutionCode: next.institution_code,
            institutionLogoUrl: next.institution_logo_url,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setError("לא ניתן לטעון את הגדרות המוסד.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editMode, router]);

  async function save() {
    if (
      institutionCode.trim().length < 3 ||
      institutionName.trim().length < 2 ||
      schoolName.trim().length < 2 ||
      !institutionType ||
      !framework
    ) {
      setError("יש למלא את כל פרטי המוסד.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const logoScope = {
        userId: profile?.id ?? null,
        institutionId: profile?.institution_id ?? null,
        teacherName: profile?.full_name ?? null,
      };
      const schoolLogoUrl = resolveSchoolLogoDataUrl(logoScope);
      const associationLogoUrl = resolveAssociationLogoDataUrl({
        institutionId: profile?.institution_id ?? null,
        institutionCode: institutionCode.trim() || profile?.institution_code || null,
      });

      const response = await fetch("/api/settings/institution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution_code: institutionCode.trim(),
          institution_name: institutionName.trim(),
          school_name: schoolName.trim(),
          institution_type: institutionType,
          education_framework: framework,
          logo_url: associationLogoUrl,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        profile?: UserProfile;
        error?: string;
      };
      if (!response.ok || !data.profile) {
        const code = data.error ?? "SAVE_FAILED";
        if (code === PILOT_BLOCKED_ERROR_CODE) {
          setError(PILOT_BLOCKED_SETUP_MESSAGE);
          return;
        }
        if (code === "INSTITUTION_CODE_EXISTS" || code === "INSTITUTION_CODE_TAKEN") {
          setError("סמל המוסד כבר משויך למוסד אחר.");
          return;
        }
        if (code === "INVALID_INPUT") {
          setError("יש למלא את כל השדות ולוודא שהלוגו אינו גדול מדי.");
          return;
        }
        if (code === "UNAUTHORIZED") {
          router.replace("/login");
          return;
        }
        if (code === "FORBIDDEN") {
          setError("רק בעלת המוסד יכולה לעדכן את פרטי המוסד.");
          return;
        }
        throw new Error(code);
      }
      cacheAuthenticatedUser(data.profile);
      clearRegistrationStep2Draft();
      persistSchoolLogoDataUrl(
        {
          userId: data.profile.id,
          institutionId: data.profile.institution_id,
          teacherName: data.profile.full_name,
        },
        schoolLogoUrl
      );
      persistInstitutionFooterLogoDataUrl(
        {
          institutionId: data.profile.institution_id,
          institutionCode: data.profile.institution_code,
        },
        associationLogoUrl
      );
      const frameworkChanged =
        Boolean(initialFramework) &&
        Boolean(framework) &&
        initialFramework !== framework;
      if (fromPlan || frameworkChanged || !data.profile.plan_id) {
        const planPath = data.profile.setup_completed_at
          ? MANAGE_PLAN_PATH
          : REGISTER_PLAN_PATH;
        router.push(
          frameworkChanged || fromPlan
            ? `${planPath}?frameworkUpdated=1`
            : planPath
        );
      } else {
        router.push(institutionProfileHref(data.profile));
      }
      router.refresh();
    } catch {
      setError("שמירת ההגדרות נכשלה. נסו שוב.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="menu-box p-8 text-center text-pink">טוען...</div>;
  }

  const profileHref = profile ? institutionProfileHref(profile) : "/personal-area";

  return (
    <div className="menu-box mx-auto w-full max-w-2xl space-y-5 p-5">
      <div className="text-center">
        <Building2 className="mx-auto h-8 w-8 text-brand-600" />
        <h1 className="mt-2 text-2xl font-bold text-ink">
          {editMode ? (
            <EditableText path="personalArea.managePersonalArea" />
          ) : (
            "הגדרות המוסד"
          )}
        </h1>
        <p className="mt-1 text-sm text-pink">
          {fromPlan
            ? "בחרו מסגרת (רגיל / מיוחד) ולחצו «שמירה והמשך» — אחרת השינוי לא יישמר."
            : profile?.setup_completed_at
              ? "אפשר לעדכן את הפרטים, הלוגואים ודוגמאות ה-AI בכל עת."
              : "השלימו הגדרה קצרה לפני תחילת העבודה."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="institution_type">סוג המוסד</Label>
          <select
            id="institution_type"
            value={institutionType}
            onChange={(event) =>
              setInstitutionType(toInstitutionType(event.target.value))
            }
            disabled={guestDemo}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">בחרו סוג מוסד</option>
            <option value="schools">בית ספר</option>
            <option
              value="high-schools"
              disabled={isPilotBlockedInstitutionType("high-schools") && profile?.institution_type !== "high-schools"}
            >
              תיכון {isPilotBlockedInstitutionType("high-schools") && profile?.institution_type !== "high-schools" ? "(לא זמין כרגע)" : ""}
            </option>
            <option
              value="kindergartens"
              disabled={isPilotBlockedInstitutionType("kindergartens") && profile?.institution_type !== "kindergartens"}
            >
              גן ילדים {isPilotBlockedInstitutionType("kindergartens") && profile?.institution_type !== "kindergartens" ? "(לא זמין כרגע)" : ""}
            </option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="education_framework">מסגרת חינוך</Label>
          <select
            id="education_framework"
            value={framework}
            onChange={(event) =>
              setFramework(toFramework(event.target.value))
            }
            disabled={guestDemo}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">בחרו מסגרת חינוך</option>
            <option value="regular">חינוך רגיל</option>
            <option value="special">חינוך מיוחד</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="institution_code">סמל מוסד</Label>
          <Input
            id="institution_code"
            value={institutionCode}
            onChange={(event) => setInstitutionCode(event.target.value)}
            disabled={guestDemo}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="institution_name">שם המוסד</Label>
          <Input
            id="institution_name"
            value={institutionName}
            onChange={(event) => setInstitutionName(event.target.value)}
            disabled={guestDemo}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="school_name">שם בית הספר / הגן</Label>
          <Input
            id="school_name"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            disabled={guestDemo}
          />
        </div>
      </div>

      <DocumentHeaderLogosUpload />

      {setupBlocked ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800">
          {PILOT_BLOCKED_SETUP_MESSAGE}
        </p>
      ) : null}

      {error ? (
        <p className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {guestDemo ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm text-brand-800">
          כניסה חופשית: ההגדרות זמינות לצפייה בלבד. לשמירת מוסד אמיתי יש להירשם
          ולהתחבר לאזור האישי.
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            size="lg"
            disabled={saving || setupBlocked}
            onClick={() => void save()}
          >
            <Save className="h-5 w-5" />
            {saving ? "שומר..." : "שמירה והמשך"}
          </Button>
        {editMode ? (
          <Button asChild variant="ghost" size="sm">
            <Link
              href={fromPlan ? MANAGE_PLAN_PATH : profileHref}
              onClick={(event) => {
                if (!fromPlan || !frameworkDirty) return;
                const ok = window.confirm(
                  "שיניתם מסגרת חינוך אך לא שמרתם. לצאת בלי לשמור?"
                );
                if (!ok) event.preventDefault();
              }}
            >
              <ArrowRight className="h-4 w-4" />
              {fromPlan ? (
                <span>חזרה לבחירת חבילה</span>
              ) : (
                <EditableText path="personalArea.backToProfile" />
              )}
            </Link>
          </Button>
        ) : null}
        </div>
      )}
    </div>
  );
}
