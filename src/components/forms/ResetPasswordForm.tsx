"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";

const schema = z
  .object({
    password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
    confirm_password: z.string().min(1, "יש לאמת את הסיסמה"),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(
    () => (searchParams.get("token") ?? "").trim(),
    [searchParams]
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm_password: "" },
  });

  async function onSubmit(values: FormValues) {
    if (!token) {
      setError("root", {
        message: "קישור האיפוס חסר או לא תקין. בקשו קישור חדש מדף שכחתי סיסמה.",
      });
      return;
    }

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: values.password,
        }),
      });

      if (response.ok) {
        router.push("/login?reset=1");
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (data?.error === "TOKEN_EXPIRED") {
        setError("root", {
          message: "פג תוקף הקישור. בקשו קישור חדש מדף שכחתי סיסמה.",
        });
        return;
      }
      if (data?.error === "INVALID_TOKEN") {
        setError("root", {
          message: "הקישור אינו תקין או שכבר נוצל. בקשו קישור חדש.",
        });
        return;
      }
      if (data?.error === "WEAK_PASSWORD") {
        setError("password", {
          message: "הסיסמה חייבת להכיל לפחות 8 תווים",
        });
        return;
      }

      setError("root", {
        message: "לא ניתן לאפס את הסיסמה כרגע. נסו שוב מאוחר יותר.",
      });
    } catch {
      setError("root", {
        message: "שגיאת רשת — בדקו חיבור לאינטרנט ונסו שוב.",
      });
    }
  }

  if (!token) {
    return (
      <p className="text-sm font-medium text-destructive">
        <EditableText path="auth.resetMissingToken" as="span" />
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset_password" className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.passwordLabel" />
        </Label>
        <Input
          id="reset_password"
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
        <Label
          htmlFor="reset_confirm_password"
          className="flex items-center gap-2"
        >
          <Lock className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.confirmPasswordLabel" />
        </Label>
        <Input
          id="reset_confirm_password"
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

      {errors.root && (
        <p className="text-xs font-medium text-destructive">
          {errors.root.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2">
        <EditableText path="auth.resetSubmitButton" />
        <ArrowLeft className="h-5 w-5" />
      </Button>
    </form>
  );
}
