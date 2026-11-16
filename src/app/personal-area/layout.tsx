"use client";

import { PersonalAreaBillingGate } from "@/components/billing/PersonalAreaBillingGate";

export default function PersonalAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PersonalAreaBillingGate>{children}</PersonalAreaBillingGate>;
}
