"use client";

import dynamic from "next/dynamic";

const FreeAccessSessionGuard = dynamic(
  () =>
    import("@/components/auth/FreeAccessSessionGuard").then(
      (m) => m.FreeAccessSessionGuard
    ),
  { ssr: false }
);

export function FreeAccessSessionGuardShell() {
  return <FreeAccessSessionGuard />;
}
