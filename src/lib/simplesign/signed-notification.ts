import { appOrigin } from "@/lib/app-origin";
import { getFormSchema, studentPortfolioFillHref } from "@/lib/form-schemas";
import { emailSchema } from "@/lib/validation/primitives";
import { sendSimpleSignSignedNotificationEmail } from "@/lib/simplesign/signing-email";
import {
  claimRequesterNotification,
  claimTeacherNotification,
  clearRequesterNotificationClaim,
  clearTeacherNotificationClaim,
  findStaffCardForTeacherName,
  findSubmissionsByToken,
  loadInstitutionDisplayName,
  loadStudentForInstitution,
  loadUserProfileContact,
  type SimpleSignSubmissionRow,
} from "@/lib/simplesign/server-store";

type StudentForSigning = NonNullable<
  Awaited<ReturnType<typeof loadStudentForInstitution>>
>;

type SignedNotificationContext = {
  formTitle: string;
  studentName: string;
  institutionName: string;
  signerNames: string[];
  formUrl: string;
  submissionToken: string;
};

function parseStoredEmail(value: string | null | undefined): string | null {
  const parsed = emailSchema.safeParse(value ?? "");
  return parsed.success ? parsed.data : null;
}

function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function resolveRequester(row: SimpleSignSubmissionRow): Promise<{
  email: string;
  fullName: string;
  userId: string | null;
} | null> {
  if (row.requested_by_user_id) {
    const profile = await loadUserProfileContact(row.requested_by_user_id);
    const liveEmail = parseStoredEmail(profile?.email);
    if (liveEmail) {
      return {
        email: liveEmail,
        fullName: profile?.fullName ?? "",
        userId: row.requested_by_user_id,
      };
    }
  }
  const snapshot = parseStoredEmail(row.requester_email);
  if (!snapshot) return null;
  return { email: snapshot, fullName: "", userId: row.requested_by_user_id };
}

async function resolveResponsibleTeacher(
  row: SimpleSignSubmissionRow,
  student: StudentForSigning | null
): Promise<{ email: string; fullName: string; userId: string } | null> {
  const teacherName = (student?.teacher_name ?? "").trim();
  const institutionId =
    row.institution_id ?? student?.institution_id ?? null;
  if (!teacherName || !institutionId) return null;

  const staffCard = await findStaffCardForTeacherName(
    institutionId,
    teacherName
  );
  const userId = staffCard?.user_profile_id?.trim();
  if (!userId) return null;

  const profile = await loadUserProfileContact(userId);
  const email = parseStoredEmail(profile?.email);
  if (!email) return null;

  const fullName =
    (profile?.fullName ?? "").trim() ||
    (staffCard?.full_name ?? "").trim() ||
    teacherName;

  return { email, fullName, userId };
}

async function buildSignedNotificationContext(
  submissionToken: string,
  row: SimpleSignSubmissionRow,
  rows: SimpleSignSubmissionRow[],
  student: StudentForSigning | null
): Promise<SignedNotificationContext> {
  const schema = getFormSchema(row.form_id);
  const institutionName = row.institution_id
    ? ((await loadInstitutionDisplayName(row.institution_id)) ?? "")
    : "";
  const formPath = studentPortfolioFillHref(
    row.student_id,
    row.form_id,
    undefined,
    { fillId: row.form_fill_id }
  );

  return {
    formTitle: schema?.title ?? row.form_id,
    studentName: (student?.full_name ?? "").trim(),
    institutionName,
    signerNames: rows.map((item) => item.signer_name),
    formUrl: `${appOrigin()}${formPath}`,
    submissionToken,
  };
}

async function notifyRequester(
  submissionToken: string,
  row: SimpleSignSubmissionRow,
  requester: { email: string; fullName: string },
  context: SignedNotificationContext
): Promise<void> {
  if (row.requester_notified_at) return;

  const claimed = await claimRequesterNotification(submissionToken);
  if (!claimed) return;

  try {
    const mail = await sendSimpleSignSignedNotificationEmail({
      to: requester.email,
      recipientName: requester.fullName,
      ...context,
      recipientRole: "requester",
    });

    if (!mail.sent) {
      await clearRequesterNotificationClaim(submissionToken);
      if (mail.detail) {
        console.warn("[simplesign/signed-notify] requester email not sent");
      }
    }
  } catch (err) {
    await clearRequesterNotificationClaim(submissionToken);
    console.error("[simplesign/signed-notify] requester", err);
  }
}

async function notifyResponsibleTeacher(
  submissionToken: string,
  row: SimpleSignSubmissionRow,
  teacher: { email: string; fullName: string; userId: string },
  requester: { email: string; userId: string | null } | null,
  context: SignedNotificationContext
): Promise<void> {
  if (row.teacher_notified_at) return;

  if (requester?.userId && requester.userId === teacher.userId) return;
  if (requester && emailsMatch(requester.email, teacher.email)) return;

  const claimed = await claimTeacherNotification(submissionToken);
  if (!claimed) return;

  try {
    const mail = await sendSimpleSignSignedNotificationEmail({
      to: teacher.email,
      recipientName: teacher.fullName,
      ...context,
      recipientRole: "teacher",
    });

    if (!mail.sent) {
      await clearTeacherNotificationClaim(submissionToken);
      if (mail.detail) {
        console.warn("[simplesign/signed-notify] teacher email not sent");
      }
    }
  } catch (err) {
    await clearTeacherNotificationClaim(submissionToken);
    console.error("[simplesign/signed-notify] teacher", err);
  }
}

/** שולח התרעה למי ששלח לחתימה ולמורה האחראית, פעם אחת לכל submission */
export async function notifyRequesterDocumentSigned(
  submissionToken: string
): Promise<void> {
  const rows = await findSubmissionsByToken(submissionToken);
  const row = rows[0];
  if (!row) return;

  const student = await loadStudentForInstitution(row.student_id);
  const requester = await resolveRequester(row);
  const context = await buildSignedNotificationContext(
    submissionToken,
    row,
    rows,
    student
  );

  if (requester) {
    await notifyRequester(submissionToken, row, requester, context);
  }

  const teacher = await resolveResponsibleTeacher(row, student);
  if (teacher) {
    await notifyResponsibleTeacher(
      submissionToken,
      row,
      teacher,
      requester,
      context
    );
  }
}
