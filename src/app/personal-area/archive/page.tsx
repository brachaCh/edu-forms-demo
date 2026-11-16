import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentsArchivePageClient } from "@/components/students/StudentsArchivePageClient";

export default function StudentsArchivePage() {
  return (
    <PageShell>
      <PageHeader
        titlePath="personalArea.studentsArchiveTitle"
        subtitlePath="personalArea.studentsArchiveSubtitle"
      />
      <StudentsArchivePageClient />
    </PageShell>
  );
}
