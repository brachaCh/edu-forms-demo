import { PageShell } from "@/components/layout/PageShell";
import { InstitutionSetupForm } from "@/components/personal/InstitutionSetupForm";

interface InstitutionSetupPageProps {
  searchParams: Promise<{ edit?: string; from?: string }>;
}

export default async function InstitutionSetupPage({
  searchParams,
}: InstitutionSetupPageProps) {
  const { edit, from } = await searchParams;
  return (
    <PageShell>
      <InstitutionSetupForm
        editMode={edit === "1"}
        fromPlan={from === "plan"}
      />
    </PageShell>
  );
}
