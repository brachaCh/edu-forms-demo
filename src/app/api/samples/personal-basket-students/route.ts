import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SAMPLE_FILE = "personal-basket-students-sample.xlsx";
const DOWNLOAD_NAME = "דוגמה-ייבוא-תלמידי-סל-אישי.xlsx";

/** הורדת קובץ אקסל לדוגמה (כותרות בלבד) לרשימת תלמידי סל אישי */
export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "samples",
      SAMPLE_FILE
    );
    const data = await readFile(filePath);

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="personal-basket-students-sample.xlsx"; filename*=UTF-8''${encodeURIComponent(DOWNLOAD_NAME)}`,
        "Cache-Control": "no-store",
        "Content-Length": String(data.byteLength),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "קובץ הדוגמה לא נמצא" },
      { status: 404 }
    );
  }
}
