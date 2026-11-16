import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ isPlatformAdmin: false });
  }
  return NextResponse.json({ isPlatformAdmin: true });
}
