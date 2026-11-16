import { Suspense } from "react";
import { TeacherInviteRegisterPageClient } from "@/components/auth/TeacherInviteRegisterPageClient";

export default function TeacherInviteRegisterPage() {
  return (
    <Suspense fallback={null}>
      <TeacherInviteRegisterPageClient />
    </Suspense>
  );
}
