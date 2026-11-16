import { PublicFormSignaturePage } from "@/components/students/PublicFormSignaturePage";

export default async function SignFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicFormSignaturePage token={decodeURIComponent(token)} />;
}
