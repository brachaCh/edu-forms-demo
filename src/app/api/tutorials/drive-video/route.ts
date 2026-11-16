import { NextResponse } from "next/server";
import { fetchPublicDriveVideo } from "@/lib/drive-video-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const range = request.headers.get("range");

  try {
    const upstream = await fetchPublicDriveVideo(id, range);
    const type = upstream.headers.get("content-type") ?? "";
    const playable =
      upstream.status === 200 || upstream.status === 206;
    if (!playable || (!type.startsWith("video/") && type !== "application/octet-stream")) {
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", type.startsWith("video/") ? type : "video/mp4");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=300");
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error(
      "[tutorials/drive-video]",
      error instanceof Error ? error.message : "UNAVAILABLE"
    );
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 502 });
  }
}
