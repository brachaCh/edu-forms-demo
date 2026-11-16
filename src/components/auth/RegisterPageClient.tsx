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
import { Step2Form } from "@/components/forms/Step2Form";
import { EditableText } from "@/components/editable/EditableText";

export function RegisterPageClient() {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 text-sm text-pink">
          <EditableText path="auth.step2Badge" />
        </div>
        <CardTitle className="text-2xl">
          <EditableText path="auth.step2Title" as="span" />
        </CardTitle>
        <CardDescription>
          <EditableText path="auth.step2Subtitle" as="span" />
        </CardDescription>
        <Link href="/register" className="mt-2 inline-flex items-center gap-1 text-sm text-pink hover:opacity-80">
          <EditableText path="common.back" />
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        <Step2Form />
      </CardContent>
    </Card>
  );
}
