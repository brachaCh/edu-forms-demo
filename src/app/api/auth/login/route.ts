import { NextResponse } from "next/server";

/**
 * כניסה בסיסמה בוטלה — חובה כניסה עם קוד חד־פעמי למייל.
 * @see /api/auth/otp/request , /api/auth/otp/verify
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "OTP_REQUIRED",
      message: "הכניסה מתבצעת רק עם קוד חד־פעמי שנשלח למייל.",
    },
    { status: 403 }
  );
}
