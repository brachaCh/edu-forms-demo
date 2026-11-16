"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, KeyRound, School, CheckCircle2, Lock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  cacheAuthenticatedUser,
  clearRegistrationStep1,
  getRegistrationStep1,
  saveRegistrationStep2Draft,
  type RegistrationStep1,
} from "@/lib/mock-store";
import { clearLocalBrandingCache } from "@/lib/document-branding";
import { EditableText } from "@/components/editable/EditableText";

const schema = z
  .object({
    institution_code: z
      .string()
      .min(3, "סמל המוסד חייב להכיל לפחות 3 תווים"),
    institution_name: z.string().min(2, "יש להזין את שם המוסד"),
    school_name: z.string().min(2, "יש להזין את שם בית הספר"),
    password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
    confirm_password: z.string().min(1, "יש לאמת את הסיסמה"),
    terms_accepted: z
      .boolean()
      .refine((v) => v === true, {
        message: "יש לאשר את תקנון האתר כדי להמשיך",
      }),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export function Step2Form() {
  const router = useRouter();
  const [step1] = useState<RegistrationStep1 | null>(() =>
    getRegistrationStep1()
  );

  useEffect(() => {
    if (!step1) {
      router.replace("/register");
    }
  }, [step1, router]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      institution_code: "",
      institution_name: "",
      school_name: "",
      password: "",
      confirm_password: "",
      terms_accepted: false,
    },
  });

  async function onSubmit(values: FormValues) {
    if (!step1) return;
    try {
      saveRegistrationStep2Draft({
        institution_code: values.institution_code.trim(),
        institution_name: values.institution_name.trim(),
        school_name: values.school_name.trim(),
      });
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: step1.full_name,
          phone: step1.phone,
          email: step1.email,
          institution_code: values.institution_code.trim(),
          institution_name: values.institution_name.trim(),
          school_name: values.school_name.trim(),
          password: values.password,
          terms_accepted: values.terms_accepted,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        profile?: import("@/lib/supabase/types").UserProfile;
        error?: string;
      };
      if (!response.ok || !result.profile) {
        if (result.error === "EMAIL_EXISTS") {
          throw new Error("כתובת המייל כבר רשומה. אפשר להיכנס דרך מסך הכניסה.");
        }
        if (result.error === "INSTITUTION_CODE_TAKEN") {
          throw new Error(
            "המוסד כבר רשום במערכת. פנו לאחראי המוסד כדי לקבל הזמנה."
          );
        }
        throw new Error("לא ניתן להשלים את הרישום. נסו שוב.");
      }
      cacheAuthenticatedUser(result.profile);
      clearLocalBrandingCache();
      clearRegistrationStep1();
      router.push("/personal-area/setup");
    } catch (error) {
      setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "לא ניתן להשלים את הרישום. נסו שוב.",
      });
    }
  }

  if (!step1) return null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 p-4">
        <div className="mb-2 text-xs font-bold uppercase text-brand-600">
          <EditableText path="auth.step1SummaryTitle" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <EditableText path="auth.nameShort" as="div" className="text-xs text-brand-600" />
            <div className="font-semibold text-brand-900">{step1.full_name}</div>
          </div>
          <div>
            <EditableText path="auth.phoneShort" as="div" className="text-xs text-brand-600" />
            <div className="font-semibold text-brand-900" dir="ltr">
              {step1.phone}
            </div>
          </div>
          <div>
            <EditableText path="auth.emailShort" as="div" className="text-xs text-brand-600" />
            <div className="truncate font-semibold text-brand-900" dir="ltr">
              {step1.email}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="institution_code" className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.institutionCodeLabel" />
        </Label>
        <Input id="institution_code" {...register("institution_code")} />
        {errors.institution_code && (
          <p className="text-xs font-medium text-destructive">
            {errors.institution_code.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="institution_name" className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.institutionNameLabel" />
        </Label>
        <Input id="institution_name" {...register("institution_name")} />
        {errors.institution_name && (
          <p className="text-xs font-medium text-destructive">
            {errors.institution_name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="school_name" className="flex items-center gap-2">
          <School className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.schoolNameLabel" />
        </Label>
        <Input id="school_name" {...register("school_name")} />
        {errors.school_name && (
          <p className="text-xs font-medium text-destructive">
            {errors.school_name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.passwordLabel" />
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          className="text-right"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs font-medium text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm_password" className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.confirmPasswordLabel" />
        </Label>
        <Input
          id="confirm_password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          className="text-right"
          {...register("confirm_password")}
        />
        {errors.confirm_password && (
          <p className="text-xs font-medium text-destructive">
            {errors.confirm_password.message}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-brand-50 p-4">
        <Controller
          name="terms_accepted"
          control={control}
          render={({ field }) => (
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                id="terms_accepted"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(Boolean(v))}
              />
              <span className="text-sm leading-snug text-brand-800">
                <EditableText path="auth.termsCheckbox" as="span" />{" "}
                <span className="inline-flex flex-wrap gap-x-2 gap-y-1 text-teal">
                  <Link href="/terms" className="underline underline-offset-2">
                    תקנון שימוש
                  </Link>
                  <span aria-hidden>·</span>
                  <Link href="/privacy" className="underline underline-offset-2">
                    מדיניות פרטיות
                  </Link>
                  <span aria-hidden>·</span>
                  <Link
                    href="/accessibility"
                    className="underline underline-offset-2"
                  >
                    הצהרת נגישות
                  </Link>
                </span>
              </span>
            </label>
          )}
        />
        {errors.terms_accepted && (
          <p className="mt-2 text-xs font-medium text-destructive">
            {errors.terms_accepted.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="flex justify-center">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          <Save className="h-5 w-5" />
          <EditableText path="auth.saveAndContinue" />
          <CheckCircle2 className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}
