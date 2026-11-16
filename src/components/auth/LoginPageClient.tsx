"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/forms/LoginForm";
import { EditableText } from "@/components/editable/EditableText";
import { existingSessionContinueHref } from "@/lib/auth-navigation";
import { getRegistrationStep1 } from "@/lib/mock-store";
import type { UserProfile } from "@/lib/supabase/types";

function ResetSuccessBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "1") return null;
  return (
    <p className="rounded-md bg-muted/60 px-4 py-3 text-sm text-foreground">
      <EditableText path="auth.resetSuccessBanner" as="span" />
    </p>
  );
}

function ExistingSessionOrLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let redirected = false;
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) return;
        const data = (await response.json()) as {
          profile?: UserProfile | null;
          isPlatformAdmin?: boolean;
        };
        if (cancelled || !data.profile) return;
        const dest = existingSessionContinueHref(
          data.profile,
          searchParams.get("next"),
          { isPlatformAdmin: data.isPlatformAdmin === true }
        );
        if (dest) {
          redirected = true;
          router.replace(dest);
          return;
        }
      } catch {
        // אין סשן חי — מציגים טופס כניסה
      } finally {
        if (!cancelled && !redirected) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (checking) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        <EditableText path="personalArea.loading" as="span" />
      </p>
    );
  }

  return <LoginForm />;
}

export function LoginPageClient() {
  const [hasPendingRegistration] = useState(() =>
    Boolean(getRegistrationStep1())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          <EditableText path="auth.loginTitle" as="span" />
        </CardTitle>
        <CardDescription>
          <EditableText path="auth.loginSubtitle" as="span" />
        </CardDescription>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1 text-sm text-pink hover:opacity-80"
        >
          <EditableText path="common.back" />
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <ResetSuccessBanner />
        </Suspense>
        <Suspense fallback={null}>
          <ExistingSessionOrLoginForm />
        </Suspense>
        <div
          className="mt-2 flex flex-col items-stretch gap-3 border-t border-border pt-5"
          data-testid="register-personal-area-cta"
        >
          <p
            id="register-personal-area-hint"
            className="text-center text-sm font-medium text-ink"
          >
            <EditableText path="auth.noAccountPrompt" as="span" />
          </p>
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="w-full whitespace-normal"
          >
            <Link
              href="/register"
              aria-describedby="register-personal-area-hint"
            >
              <UserPlus className="h-5 w-5 shrink-0" aria-hidden />
              <EditableText path="auth.registerLink" as="span" />
            </Link>
          </Button>
          {hasPendingRegistration && (
            <Button
              asChild
              variant="outline"
              className="w-full whitespace-normal"
            >
              <Link href="/register/institution">
                <EditableText
                  path="auth.continuePendingRegistration"
                  as="span"
                />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
