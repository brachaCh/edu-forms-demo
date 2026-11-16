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
import { TeacherInviteRegisterForm } from "@/components/forms/TeacherInviteRegisterForm";
import { EditableText } from "@/components/editable/EditableText";

export function TeacherInviteRegisterPageClient() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          <EditableText path="auth.inviteTitle" as="span" />
        </CardTitle>
        <CardDescription>
          <EditableText path="auth.inviteSubtitle" as="span" />
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
        <TeacherInviteRegisterForm />
      </CardContent>
    </Card>
  );
}
