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
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";
import { EditableText } from "@/components/editable/EditableText";

export function ResetPasswordPageClient() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          <EditableText path="auth.resetTitle" as="span" />
        </CardTitle>
        <CardDescription>
          <EditableText path="auth.resetSubtitle" as="span" />
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
        <ResetPasswordForm />
        <div className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/forgot-password"
            className="font-medium text-brand-600 hover:opacity-80"
          >
            <EditableText path="auth.forgotLink" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
