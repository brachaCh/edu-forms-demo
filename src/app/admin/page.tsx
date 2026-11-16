"use client";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminLogsNavCard } from "@/components/admin/AuditLogsClient";
import { InstitutionProfileBackLink } from "@/components/layout/InstitutionProfileBackLink";

export default function AdminPage() {
  return (
    <PageShell>
      <PageHeader titlePath="admin.title" subtitlePath="admin.subtitle" />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <AdminLogsNavCard />
      </div>

      <div className="mt-4">
        <InstitutionProfileBackLink variant="outline" size="default" />
      </div>
    </PageShell>
  );
}
