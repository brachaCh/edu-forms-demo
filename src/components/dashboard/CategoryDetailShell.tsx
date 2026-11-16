import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/editable/EditableText";

interface CategoryDetailShellProps {
  titlePath: string;
  subtitlePath: string;
  backHref?: string;
  backTextPath?: string;
  children?: React.ReactNode;
}

export function CategoryDetailShell({
  titlePath,
  subtitlePath,
  backHref = "/personal-area",
  backTextPath = "categoryDetail.backToDashboard",
  children,
}: CategoryDetailShellProps) {
  return (
    <PageShell>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowRight className="h-4 w-4" />
            <EditableText path={backTextPath} />
          </Link>
        </Button>
      </div>
      <PageHeader titlePath={titlePath} subtitlePath={subtitlePath} />

      {children ?? (
        <div className="menu-box p-8 text-center">
          <EditableText
            path="categoryDetail.promptPersonalArea"
            as="p"
            block
            className="mb-4 text-pink"
          />
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link href="/personal-area">
                <EditableText path="dashboard.personalArea" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/personal-area/summary">
                <EditableText path="categoryDetail.summaryTable" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
