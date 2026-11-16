"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Mail, Phone, Save, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveRegistrationStep1,
} from "@/lib/mock-store";
import { EditableText } from "@/components/editable/EditableText";

const schema = z.object({
  full_name: z.string().min(2, "יש להזין שם מלא (לפחות 2 תווים)"),
  phone: z
    .string()
    .min(9, "מספר טלפון לא תקין")
    .regex(/^[\d\-+\s()]+$/u, "מספר טלפון לא תקין"),
  email: z.string().email("כתובת מייל לא תקינה"),
});

type FormValues = z.infer<typeof schema>;

export function Step1Form() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      phone: "",
      email: "",
    },
    mode: "onSubmit",
  });

  function onSubmit(values: FormValues) {
    try {
      saveRegistrationStep1({
        ...values,
        full_name: values.full_name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim().toLowerCase(),
      });
      router.push("/register/institution");
    } catch {
      setError("root", {
        message:
          "לא ניתן לשמור את הפרטים בדפדפן. בדקו שהדפדפן מאפשר אחסון מקומי ונסו שוב.",
      });
    }
  }

  function onInvalid() {
    setError("root", {
      message: "יש למלא את כל השדות בצורה תקינה לפני השמירה וההמשך.",
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="full_name" className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.nameLabel" />
        </Label>
        <Input
          id="full_name"
          autoComplete="name"
          {...register("full_name")}
        />
        {errors.full_name && (
          <p className="text-xs font-medium text-destructive">
            {errors.full_name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone" className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.phoneLabel" />
        </Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          dir="ltr"
          className="text-right"
          {...register("phone")}
        />
        {errors.phone && (
          <p className="text-xs font-medium text-destructive">
            {errors.phone.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-brand-500" />
          <EditableText path="auth.emailLabel" />
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          className="text-right"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs font-medium text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="mt-2 flex justify-center">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          <Save className="h-5 w-5" />
          <EditableText path="auth.saveAndContinue" />
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
    </form>
  );
}
