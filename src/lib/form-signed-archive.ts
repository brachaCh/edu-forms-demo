import { hasFilledSignatureValue } from "@/lib/simplesign/constants";

export function allSignatureFieldsFilled(
  signatureKeys: string[],
  data: Record<string, string>
): boolean {
  if (signatureKeys.length === 0) return false;
  return signatureKeys.every((key) => hasFilledSignatureValue(data[key]));
}

function safeFilePart(value: string, fallback: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "-").trim();
  return cleaned || fallback;
}

export function signedArchiveFileName(
  formTitle: string,
  studentName: string
): string {
  return `${safeFilePart(formTitle, "טופס")} — ${safeFilePart(studentName, "תלמיד")} — חתום.pdf`;
}
