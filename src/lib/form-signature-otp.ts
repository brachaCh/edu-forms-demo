/** OTP לקישורי חתימה ציבוריים (/sign) — hash בלבד במסד */

export const FORM_SIGNATURE_OTP_COOKIE = "form_signature_otp";

export {
  FORM_FILL_TOKEN_RE as FORM_SIGNATURE_TOKEN_RE,
  hashFormFillToken,
  maskRecipientEmail,
  newFormFillOtpSessionToken as newFormSignatureOtpSessionToken,
} from "@/lib/form-fill-otp";
