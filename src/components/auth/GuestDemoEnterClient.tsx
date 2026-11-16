"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Mail } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import { ensureDemoDataSeeded } from "@/lib/demo-seed";
import {
  enableFreeAccessMode,
  establishGuestDemoSession,
  FREE_ACCESS_USED_UP_MESSAGE,
  isFreeAccessUsedUp,
} from "@/lib/free-access";
import { getTextByPath } from "@/lib/get-text-by-path";
import { useSiteText } from "@/components/providers/SiteTextProvider";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function GuestDemoEnterClient() {
  const router = useRouter();
  const { texts } = useSiteText();
  const [step, setStep] = useState<"intro" | "email">("intro");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (isFreeAccessUsedUp()) {
      setBlocked(true);
      setError(
        getTextByPath(texts, "landing.guestUsedUp") || FREE_ACCESS_USED_UP_MESSAGE
      );
    }
  }, [texts]);

  async function enterFreeAccess(registeredEmail: string) {
    const opened = await establishGuestDemoSession(registeredEmail);
    if (!opened) throw new Error("GUEST_DEMO_FAILED");

    enableFreeAccessMode(registeredEmail);
    ensureDemoDataSeeded();
    router.replace("/personal-area");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isFreeAccessUsedUp()) {
      setBlocked(true);
      setError(
        getTextByPath(texts, "landing.guestUsedUp") || FREE_ACCESS_USED_UP_MESSAGE
      );
      return;
    }

    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed) || trimmed.length > 200) {
      setError(
        getTextByPath(texts, "landing.guestEmailInvalid") ||
          "נא להזין כתובת מייל תקינה"
      );
      return;
    }

    setSubmitting(true);
    try {
      await enterFreeAccess(trimmed);
    } catch {
      setError(
        getTextByPath(texts, "landing.guestEnterFailed") ||
          "לא ניתן לפתוח כרגע את הכניסה החופשית."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <div className="menu-box mx-auto max-w-xl p-6 sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-ink">
          <EditableText path="landing.guestSignupTitle" />
        </h1>

        {step === "intro" ? (
          <div className="flex flex-col gap-5">
            <p className="text-center text-base leading-relaxed text-ink sm:text-lg">
              <EditableText path="landing.guestIntroBody" />
            </p>

            {error ? (
              <p className="text-center text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={blocked}
              onClick={() => {
                setError(null);
                setStep("email");
              }}
            >
              <Eye className="h-5 w-5" />
              <EditableText path="landing.guestIntroContinue" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.replace("/")}
            >
              <EditableText path="common.back" />
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-pink">
              <EditableText path="landing.guestSignupSubtitle" />
            </p>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guest-free-email">
                  <EditableText path="landing.guestEmailLabel" />
                </Label>
                <Input
                  id="guest-free-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  dir="ltr"
                  className="text-left"
                  disabled={submitting || blocked}
                />
              </div>

              {error ? (
                <p className="text-center text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || blocked}
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Mail className="h-5 w-5" />
                )}
                {submitting
                  ? getTextByPath(texts, "landing.guestSignupSubmitting") ||
                    "נרשמים..."
                  : getTextByPath(texts, "landing.guestSignupSubmit") ||
                    "המשך לכניסה חופשית"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={submitting}
                onClick={() => {
                  setError(null);
                  setStep("intro");
                }}
              >
                <EditableText path="common.back" />
              </Button>
            </form>
          </>
        )}
      </div>
    </PageShell>
  );
}
