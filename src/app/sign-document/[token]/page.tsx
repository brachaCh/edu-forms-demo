import { PublicExternalSignaturePage } from "@/components/students/PublicExternalSignaturePage";

export default async function SignDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicExternalSignaturePage token={decodeURIComponent(token)} />;
}
