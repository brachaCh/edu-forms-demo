"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";
import { EditableText } from "@/components/editable/EditableText";

export function ForgotPasswordPageClient() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          <EditableText path="auth.forgotTitle" as="span" />
        </CardTitle>
        <CardDescription>
          <EditableText path="auth.forgotSubtitle" as="span" />
        </CardDescription>
        <Link
          href="/login"
          className="mt-2 inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
        >
          <EditableText path="common.back" />
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ForgotPasswordForm />
        <div className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-brand-600 hover:opacity-80"
          >
            <EditableText path="auth.backToLogin" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
