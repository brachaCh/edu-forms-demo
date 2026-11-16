import { DetachedPrintClient } from "@/components/print/DetachedPrintClient";

/**
 * חלון הדפסה מנותק — נפתח עם noopener מהדף הראשי (ראו src/lib/detached-print.ts).
 * מציג מסך "מכין מסמכים…" ומחליף את עצמו ב-HTML שמגיע דרך BroadcastChannel.
 */
export default async function DetachedPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ title?: string | string[] }>;
}) {
  const { key } = await params;
  const { title } = await searchParams;
  const titleText = Array.isArray(title) ? title[0] ?? "" : title ?? "";
  return <DetachedPrintClient printKey={decodeURIComponent(key)} title={titleText} />;
}
