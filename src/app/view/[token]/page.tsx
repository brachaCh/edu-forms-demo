import { PublicFormViewPage } from "@/components/students/PublicFormViewPage";

export default async function ViewFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicFormViewPage token={decodeURIComponent(token)} />;
}
