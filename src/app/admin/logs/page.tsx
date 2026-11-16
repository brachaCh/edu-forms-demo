"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { AuditLogsClient } from "@/components/admin/AuditLogsClient";
import { EditableText } from "@/components/editable/EditableText";

export default function AdminLogsPage() {
  return (
    <PageShell>
      <PageHeader titlePath="admin.logsTitle" subtitlePath="admin.logsSubtitle" />

      <div className="mt-4">
        <Button asChild variant="outline">
          <Link href="/admin">
            <ArrowRight className="h-4 w-4" />
            <EditableText path="common.back" />
          </Link>
        </Button>
      </div>

      <AuditLogsClient />
    </PageShell>
  );
}
