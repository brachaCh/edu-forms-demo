import { PublicFormFillPage } from "@/components/students/PublicFormFillPage";

export default async function FillFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicFormFillPage token={decodeURIComponent(token)} />;
}
