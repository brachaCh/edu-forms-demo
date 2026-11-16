import { Suspense } from "react";
import { ForgotPasswordPageClient } from "@/components/auth/ForgotPasswordPageClient";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordPageClient />
    </Suspense>
  );
}
