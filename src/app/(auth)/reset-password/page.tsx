import { Suspense } from "react";
import { ResetPasswordPageClient } from "@/components/auth/ResetPasswordPageClient";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageClient />
    </Suspense>
  );
}
