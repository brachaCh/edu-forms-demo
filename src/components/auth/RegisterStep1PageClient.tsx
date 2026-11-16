"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Step1Form } from "@/components/forms/Step1Form";
import { EditableText } from "@/components/editable/EditableText";
import { beginFreshRegistration } from "@/lib/mock-store";

export function RegisterStep1PageClient() {
  const [formKey] = useState(() => {
    beginFreshRegistration();
    return "fresh-registration";
  });

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 text-sm text-pink">
          <EditableText path="auth.step1Badge" />
        </div>
        <CardTitle className="text-2xl">
          <EditableText path="auth.step1Title" as="span" />
        </CardTitle>
        <CardDescription>
          <EditableText path="auth.step1Subtitle" as="span" />
        </CardDescription>
        <Link
          href="/login"
          className="mt-2 inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
        >
          <EditableText path="common.back" />
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        <Step1Form key={formKey} />
      </CardContent>
    </Card>
  );
}
