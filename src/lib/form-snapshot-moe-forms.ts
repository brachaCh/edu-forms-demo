/**
 * פריסות "כמו הטופס המקורי" לטפסי משרד החינוך הקצרים:
 *   - ויתור סודיות (ועדת זכאות ואפיון / ועדת השגה / צוות רב-מקצועי) — נספחים 2.1–2.3
 *   - אישור הורים לוועדת זכאות ואפיון ללא נוכחות הורים — נספח 6.5
 *   - הסכמת הורה לפעילות באתר בית הספר / פרסום תמונות
 *   - חידוש הזכאות לשירותי חינוך מיוחדים — נספח 6.11
 *   - המלצת פסיכולוג לשינוי אפיון המוגבלות — נספח 6.12
 *   - המלצת פסיכולוג המסגרת בדיון הצוות הרב-מקצועי — נספח 8
 *   - מיצוי אפשרויות התערבות בבית הספר (אגף בכיר, יישום חוק החינוך המיוחד)
 *
 * המקורות: public/portfolio-templates/*.docx (מסמכי משרד החינוך).
 */

import type { FormSchema } from "@/lib/form-schemas";
import { FORM_TABLE_DEFS, resolveTableRowCount, tableCellKey } from "@/lib/form-table-grids";
import {
  box,
  createCtx,
  escapeHtml,
  fieldLabel,
  formatOriginalDate,
  isChecked,
  lineField,
  ltrVal,
  moeTextHeader,
  multiline,
  raw,
  signatureLine,
  signatureValue,
  staticText,
  val,
  type OriginalCtx,
} from "@/lib/form-snapshot-original-shared";

/* ------------------------------------------------------------------ */
/* ויתור סודיות                                                        */
/* ------------------------------------------------------------------ */

const WAIVER_APPENDIX: Record<string, string> = {
  "waiver-eligibility-characterization": "נספח 2.1",
  "waiver-appeal-committee": "נספח 2.2",
  "waiver-multidisciplinary-team": "נספח 2.3",
};

export function isMoeWaiverOriginalLook(formId: string): boolean {
  return formId in WAIVER_APPENDIX;
}

function checklistItem(ctx: OriginalCtx, key: string, extraHtml = ""): string {
  return `<li>${box(isChecked(ctx, key))}<span>${escapeHtml(fieldLabel(ctx, key))}</span></li>${extraHtml}`;
}

function parentSignatureBlock(
  ctx: OriginalCtx,
  nameKey: string,
  idKey: string,
  signatureKey: string
): string {
  return `<div class="rq-parent-block">
    <div class="rq-sign-row">
      ${lineField("שם ההורה/האפוטרופוס:", val(ctx, nameKey), "rq-line-name")}
      ${lineField("ת\"ז:", ltrVal(ctx, idKey), "rq-line-date")}
    </div>
    <div class="rq-sign-row rq-sign-row-sig">${signatureLine(ctx, signatureKey, "חתימה")}</div>
  </div>`;
}

export function buildMoeWaiverBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);
  const legalNote = staticText(ctx, "legal_note");
  const docsDetail = multiline(ctx, "committee_docs_detail");

  return `<div class="rq rq-waiver">
    ${moeTextHeader({ appendix: WAIVER_APPENDIX[schema.id] })}
    <h1 class="rq-title">${escapeHtml(staticText(ctx, "form_heading") || schema.title)}</h1>
    <div class="rq-sign-row rq-center-row">${lineField("תאריך:", ltrVal(ctx, "filled_at"), "rq-line-date")}</div>
    <div class="rq-sign-row">
      ${lineField("שם המסגרת החינוכית:", val(ctx, "institution_name"), "rq-line-name")}
      ${lineField("סמל המוסד:", ltrVal(ctx, "institution_code"), "rq-line-short")}
      ${lineField("המחוז:", val(ctx, "district"), "rq-line-short")}
    </div>

    <h2 class="rq-h2 rq-h2-center">${escapeHtml(staticText(ctx, "waiver_section_heading") || "ויתור סודיות")}</h2>
    <p class="rq-para">אנו, הורי התלמיד/ה/האפוטרופוס ${lineField("", val(ctx, "parent_guardian_name"), "rq-line-inline rq-line-plain")} תעודת זהות ${lineField("", ltrVal(ctx, "parent_guardian_id"), "rq-line-inline rq-line-plain")},</p>
    <p class="rq-para">${escapeHtml(staticText(ctx, "consent_intro"))}</p>
    <ul class="rq-checklist">
      ${checklistItem(ctx, "consent_disability_docs")}
      ${checklistItem(ctx, "consent_committee_docs", docsDetail ? `<li class="rq-checklist-detail">${docsDetail}</li>` : "")}
      ${checklistItem(ctx, "consent_edu_treatment_info")}
      ${checklistItem(ctx, "consent_final")}
    </ul>
    ${legalNote ? `<p class="rq-para rq-legal">${escapeHtml(legalNote)}</p>` : ""}

    <section class="rq-signatures">
      ${parentSignatureBlock(ctx, "parent1_name", "parent1_id", "parent1_signature")}
      ${parentSignatureBlock(ctx, "parent2_name", "parent2_id", "parent2_signature")}
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* אישור הורים לוועדה ללא נוכחות — נספח 6.5                            */
/* ------------------------------------------------------------------ */

export const PARENT_APPROVAL_FORM_ID = "moe-parent-approval-committee-no-presence";

function approvalStudentTable(ctx: OriginalCtx): string {
  const gender = raw(ctx, "gender");
  return `<table class="rq-grid rq-student">
    <thead><tr>
      <th>השם הפרטי</th><th>שם המשפחה</th><th>מס' תעודת הזהות</th><th>תאריך הלידה</th><th colspan="2">המין</th>
    </tr></thead>
    <tbody>
      <tr>
        <td rowspan="2">${val(ctx, "first_name")}</td>
        <td rowspan="2">${val(ctx, "last_name")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "id_number")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "birth_date")}</td>
        <td class="rq-opt">זכר</td><td class="rq-boxcell">${box(gender === "male")}</td>
      </tr>
      <tr>
        <td class="rq-opt">נקבה</td><td class="rq-boxcell">${box(gender === "female")}</td>
      </tr>
    </tbody>
  </table>`;
}

function approvalParentsTable(ctx: OriginalCtx): string {
  return `<table class="rq-grid rq-parents">
    <thead><tr>
      <th>פרטי ההורים</th><th>המצב המשפחתי</th><th>הכתובת הפרטית</th><th>מס' הטלפון</th>
    </tr></thead>
    <tbody>
      <tr>
        <td class="rq-right"><b>שם ההורה:</b> ${val(ctx, "parent1_name")}</td>
        <td rowspan="3">${val(ctx, "marital_status")}</td>
        <td rowspan="3">${val(ctx, "home_address")}</td>
        <td class="rq-ltr">${val(ctx, "parent1_phone")}</td>
      </tr>
      <tr>
        <td class="rq-right"><b>שם ההורה:</b> ${val(ctx, "parent2_name")}</td>
        <td class="rq-ltr">${val(ctx, "parent2_phone")}</td>
      </tr>
      <tr>
        <td class="rq-right"><b>שם האפוטרופוס:</b> ${val(ctx, "guardian_name")}</td>
        <td></td>
      </tr>
    </tbody>
  </table>`;
}

function approvalInstitutionTable(ctx: OriginalCtx): string {
  const schoolType = raw(ctx, "school_type");
  const classType = raw(ctx, "class_type");
  const characterization = val(ctx, "class_characterization");
  return `<table class="rq-grid rq-institution rq-approval-institution">
    <colgroup>
      <col style="width:34mm" /><col style="width:24mm" /><col style="width:24mm" /><col style="width:11mm" /><col style="width:52mm" /><col />
    </colgroup>
    <thead><tr>
      <th>שם המוסד שבו התלמיד לומד</th><th>סמל המוסד</th><th colspan="2">סוג המוסד</th><th>סוג הגן/הכיתה</th><th>דרגת הגן/הכיתה</th>
    </tr></thead>
    <tbody>
      <tr>
        <td rowspan="2">${val(ctx, "school_name")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "school_code")}</td>
        <td class="rq-opt">חינוך רגיל</td><td class="rq-boxcell">${box(schoolType === "regular")}</td>
        <td class="rq-right rq-class-types">
          <div>${box(classType === "regular")} גן/כיתה רגיל/ה</div>
          <div>${box(classType === "special_class")} כיתת חנ"מ</div>
          <div class="rq-class-char">אפיון הכיתה: ${characterization}</div>
        </td>
        <td rowspan="2">${val(ctx, "class_level")}</td>
      </tr>
      <tr>
        <td class="rq-opt">חינוך מיוחד</td><td class="rq-boxcell">${box(schoolType === "special")}</td>
        <td class="rq-right rq-class-types">
          <div>${box(classType === "special_kindergarten")} גן לחינוך מיוחד</div>
          <div>${box(classType === "special_school")} כיתה בבית ספר לחינוך מיוחד</div>
        </td>
      </tr>
    </tbody>
  </table>`;
}

function attendeesTable(ctx: OriginalCtx): string {
  const tableId = "committee-attendees";
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return "";
  const rowCount = resolveTableRowCount(tableId, ctx.data);
  const rows: Array<{ name: string; role: string }> = [];
  for (let r = 0; r < rowCount; r += 1) {
    rows.push({
      name: String(ctx.data[tableCellKey(tableId, r, "name")] ?? "").trim(),
      role: String(ctx.data[tableCellKey(tableId, r, "role")] ?? "").trim(),
    });
  }
  const filled = rows.filter((row) => row.name || row.role);
  const shown = filled.length >= 3 ? filled : [...filled, ...Array(3 - filled.length).fill({ name: "", role: "" })];
  // rowspan אינו חוצה thead/tbody — הכול ב-tbody אחד
  return `<table class="rq-grid rq-attendees">
    <tbody>
      <tr><th class="rq-attendees-title" rowspan="${shown.length + 1}">הנוכחים בדיון</th><th>התפקיד</th><th>השם</th></tr>
      ${shown
        .map(
          (row) => `<tr><td>${row.role ? `<span class="rq-val">${escapeHtml(row.role)}</span>` : ""}</td><td>${row.name ? `<span class="rq-val">${escapeHtml(row.name)}</span>` : ""}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

export function buildParentApprovalBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);
  const studentName = [raw(ctx, "first_name"), raw(ctx, "last_name")].filter(Boolean).join(" ");
  const framework = raw(ctx, "framework_choice");

  return `<div class="rq rq-approval">
    ${moeTextHeader({ appendix: "נספח 6.5" })}
    <h1 class="rq-title">סיכום דיון במסגרת החינוכית והסכמת ההורים לקיום ועדת זכאות ואפיון<br />בנוכחות חברי הוועדה בלבד</h1>
    <p class="rq-intro">דיון זה יתקיים במקרים שבהם התלמיד מופנה לוועדה לצורך חידוש זכאותו, כאשר ההורים מודעים לאפיון המוגבלות של בנם/בתם ומבקשים את המשך הלימודים באותו סוג מסגרת ועם אותו היקף של הסל האישי. במקרים אלה, בהסכמת ההורים ולאחר דיון במסגרת החינוכית בהשתתפותם שבו נמסרו להם אפשרויות הבחירה בסוג המסגרת, יתקיים דיון בוועדת זכאות ואפיון בהשתתפות חברי הוועדה בלבד.</p>
    <div class="rq-sign-row">
      ${lineField("תאריך:", ltrVal(ctx, "filled_at"), "rq-line-short")}
      ${lineField("שנה\"ל:", val(ctx, "school_year"), "rq-line-short")}
      ${lineField("מחוז:", val(ctx, "district"), "rq-line-short")}
    </div>

    <p class="rq-table-title"><b>פרטים</b> (יש למלא את הפרטים ולסמן x במשבצות המתאימות)</p>
    ${approvalStudentTable(ctx)}
    ${approvalParentsTable(ctx)}
    ${approvalInstitutionTable(ctx)}
    ${attendeesTable(ctx)}

    <div class="rq-discussion">
      <p class="rq-table-title"><b>מהלך הדיון וההחלטה</b></p>
      <div class="rq-discussion-box">${multiline(ctx, "discussion_summary")}</div>
    </div>
    <div class="rq-sign-row">${signatureLine(ctx, "principal_sign", "חתימת מנהל המוסד החינוכי:")}</div>

    <h2 class="rq-h2 rq-h2-center">הסכמת ההורים</h2>
    <p class="rq-para">אנו, הורי התלמיד/ה ${lineField("", studentName ? `<span class="rq-val">${escapeHtml(studentName)}</span>` : "", "rq-line-inline rq-line-plain")} מס' ת"ז ${lineField("", ltrVal(ctx, "id_number"), "rq-line-inline rq-line-plain")}, מאשרים קיום דיון בוועדת זכאות ואפיון ללא נוכחותנו, מעודכנים באפיון המוגבלות של בננו/בתנו ומבקשים את המשך לימודיו/ה באותו סוג מסגרת ועם אותו היקף של הסל האישי (לתלמידים שיש להם זכאות לסל אישי, העוברים לחטיבה העליונה, הסל יעודכן בהתאם לתקצוב של אותה מוגבלות ואותה רמת תפקוד בחטיבה העליונה).</p>
    <p class="rq-para">אנו מודעים שלעניין זה גן/בית ספר לחינוך מיוחד או כיתת חינוך מיוחד בבית ספר רגיל נחשבים אותו סוג מסגרת ואפשר לעבור מגן/בית ספר לחינוך מיוחד לכיתת חינוך מיוחד או מכיתת חינוך מיוחד לבית ספר לחינוך מיוחד. להלן סוג המסגרת לחינוך מיוחד שבחרנו:</p>
    <ul class="rq-checklist rq-checklist-indent">
      <li>${box(framework === "special_school")}<span>בית ספר לחינוך מיוחד</span></li>
      <li>${box(framework === "special_class")}<span>כיתת חינוך מיוחד בבית ספר לחינוך רגיל.</span></li>
    </ul>
    <p class="rq-para">אנו מודעים שהוועדה תקיים את הדיון בנוכחות חברי הוועדה בלבד, ללא נוכחות הצוות החינוכי וההורים, ונוכל להתחרט לפני כינוס הוועדה ולבקש שהדיון יתקיים בהשתתפותנו.</p>
    <p class="rq-para">אנו מאשרים את הצגת המסמך הקביל על אבחנת המוגבלות של בננו/בתנו ואת שאר המסמכים הנדרשים לקיום הדיון בוועדה.</p>

    <section class="rq-signatures">
      <div class="rq-sign-row rq-two-cols">
        ${lineField("שם ההורה/האפוטרופוס", val(ctx, "parent1_sign_name"), "rq-line-half")}
        ${lineField("שם ההורה/האפוטרופוס", val(ctx, "parent2_sign_name"), "rq-line-half")}
      </div>
      <div class="rq-sign-row rq-two-cols">
        ${signatureLine(ctx, "parent1_sign", "חתימה")}
        ${signatureLine(ctx, "parent2_sign", "חתימה")}
      </div>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* הסכמת הורה — פעילות באתר בית הספר / פרסום תמונות                      */
/* ------------------------------------------------------------------ */

export const SCHOOL_WEBSITE_PHOTO_CONSENT_FORM_ID =
  "moe-school-website-photo-consent";

export function buildSchoolWebsitePhotoConsentBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);

  return `<div class="rq rq-website-consent">
    <h1 class="rq-title">${escapeHtml(schema.title)}</h1>
    <p class="rq-para"><b>הורים יקרים</b></p>
    <p class="rq-para">הנדון: קבלת הסכמתכם להכללת בנך/בתך בפעילויות&nbsp;&nbsp;אתר האינטרנט בית ספרי </p>
    <p class="rq-para">וכן פרסום תמונות בהם מופיע בנכם/ בתכם .</p>
    <p class="rq-para">האתר נבנה לצורך המטרות הבאות:</p>
    <p class="rq-para">קבלת מידע ועדכון על הנעשה בבית הספר</p>
    <p class="rq-para">למידה בטכנולוגיה מתקדמת ונגישות למאגרי מידע </p>
    <p class="rq-para">באתר כלולים התכנים הבאים:</p>
    <p class="rq-para">אתרי מקצועות הלימוד ופעילויות מתוקשבות</p>
    <p class="rq-para">גלריית תמונות וסרטונים מפעילויות בית הספר</p>
    <p class="rq-para">ברצוננו לשלב את הנושאים הבאים בפעילויות האתר:א. רישום שמות תלמידים.ב. הצגת תמונות קבוצתיות של התלמידים ללא ציון שמותיהם.ג. שימוש בקולות תלמידים.ד. שיתוף תלמידים בפורומים.ה. פרסום חיבורים או הבעת דעות של תלמידים.</p>
    <p class="rq-para">כדי לכלול את בנכם/בתכם בפעילויות הנ"ל עלינו לקבל את הסכמתכם המפורשת לכך. </p>
    <p class="rq-para">נא מלאו את הטופס הרצ"ב.</p>
    <p class="rq-para">אם תשנו בעתיד את דעתכם ותרצו לחזור בכם לגבי הפעילויות המופיעות בטופס, תוכלו לפנות אלינו בכתב, ונמלא אחר בקשתכם. </p>
    <p class="rq-para">(חוזר מנכ"ל תשסג/7 (א), כ"ח אדר תשס"ג, 2 במרס 2003)</p>
    <div class="rq-dash-rule" aria-hidden="true"></div>
    <p class="rq-para">הריני להביע את הסכמתי לכלול את בני/בתי בפעילויות אתר האינטרנט של בית הספר</p>
    <p class="rq-para">הכוללות את הנושאים שפורטו במסמך.</p>
    <div class="rq-sign-row rq-website-consent-fields">
      ${lineField("שם התלמיד/ה:", val(ctx, "full_name"), "rq-line-name")}
      ${lineField("כתה:", val(ctx, "class_level"), "rq-line-short")}
    </div>
    <div class="rq-sign-row rq-sign-row-sig rq-website-consent-sig">${signatureLine(ctx, "parent_sign", "חתימה:")}</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* חידוש הזכאות לשירותי חינוך מיוחדים — נספח 6.11                       */
/* ------------------------------------------------------------------ */

export const ELIGIBILITY_RENEWAL_FORM_ID = "moe-eligibility-renewal";

function renewalStudentTable(ctx: OriginalCtx): string {
  const gender = raw(ctx, "gender");
  return `<table class="rq-grid rq-student">
    <thead><tr>
      <th>השם הפרטי</th><th>שם המשפחה</th><th>מס' תעודת הזהות</th><th>תאריך הלידה</th><th colspan="2">המין</th>
    </tr></thead>
    <tbody>
      <tr>
        <td rowspan="2">${val(ctx, "first_name")}</td>
        <td rowspan="2">${val(ctx, "last_name")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "id_number")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "birth_date")}</td>
        <td class="rq-opt">זכר</td><td class="rq-boxcell">${box(gender === "male")}</td>
      </tr>
      <tr>
        <td class="rq-opt">נקבה</td><td class="rq-boxcell">${box(gender === "female")}</td>
      </tr>
    </tbody>
  </table>`;
}

function renewalInstitutionTable(ctx: OriginalCtx): string {
  const schoolType = raw(ctx, "school_type");
  return `<table class="rq-grid rq-institution rq-renewal-institution">
    <thead><tr>
      <th>שם המוסד החינוכי</th><th>סמל המוסד</th><th colspan="2">סוג המוסד החינוכי</th><th>דרגת הכיתה</th>
    </tr></thead>
    <tbody>
      <tr>
        <td rowspan="2">${val(ctx, "school_name")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "school_code")}</td>
        <td class="rq-opt">חינוך רגיל</td><td class="rq-boxcell">${box(schoolType === "regular")}</td>
        <td rowspan="2">${val(ctx, "class_level")}</td>
      </tr>
      <tr>
        <td class="rq-opt">חינוך מיוחד</td><td class="rq-boxcell">${box(schoolType === "special")}</td>
      </tr>
    </tbody>
  </table>`;
}

export function buildEligibilityRenewalBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);
  const studentName = [raw(ctx, "first_name"), raw(ctx, "last_name")].filter(Boolean).join(" ");
  const renewalCase = raw(ctx, "renewal_case");

  return `<div class="rq rq-renewal">
    ${moeTextHeader({ appendix: "נספח 6.11" })}
    <h1 class="rq-title">פנייה לוועדת זכאות ואפיון לחידוש הזכאות לשירותי חינוך מיוחדים<br />לתלמיד שזו שנתו האחרונה במערכת החינוך<br />לתלמיד בבית הספר היסודי שתוקף זכאותו הסתיים</h1>
    <div class="rq-sign-row">
      ${lineField("תאריך:", ltrVal(ctx, "filled_at"), "rq-line-short")}
      ${lineField("שנת הלימודים:", val(ctx, "school_year"), "rq-line-short")}
    </div>
    <p class="rq-para rq-renewal-to"><b>אל:</b> ועדת הזכאות והאפיון</p>
    <div class="rq-sign-row">
      ${lineField("ברשות מקומית:", val(ctx, "local_authority"), "rq-line-half")}
      ${lineField("במחוז:", val(ctx, "district"), "rq-line-half")}
    </div>

    <p class="rq-para">הריני לאשר בזאת כי התלמיד/ה -</p>
    ${renewalStudentTable(ctx)}
    <p class="rq-para">הלומד במוסד החינוכי -</p>
    ${renewalInstitutionTable(ctx)}

    <p class="rq-para"><b>סמן/י בהתאם לנדרש</b></p>
    <ul class="rq-checklist">
      <li>${box(renewalCase === "final_year")}<span>נמצא בשנה האחרונה ללימודיו במערכת החינוך, ויסיים את לימודיו בשנת הלימודים ${lineField("", val(ctx, "finishing_year"), "rq-line-inline rq-line-plain")}</span></li>
      <li>${box(renewalCase === "primary_expired")}<span>לומד בבית הספר היסודי שתוקף זכאותו הסתיים וממשיך את לימודיו בבית ספר היסודי</span></li>
    </ul>

    <p class="rq-para">על החתום:</p>
    <div class="rq-sign-row">${signatureLine(ctx, "principal_sign", "מנהל בית הספר")}</div>

    <h2 class="rq-h2 rq-h2-center">הסכמת ההורים</h2>
    <p class="rq-para">אנו, הורי התלמיד/ה ${lineField("", studentName ? `<span class="rq-val">${escapeHtml(studentName)}</span>` : "", "rq-line-inline rq-line-plain")} מס' ת"ז ${lineField("", ltrVal(ctx, "id_number"), "rq-line-inline rq-line-plain")}</p>
    <p class="rq-para">מבקשים את המשך הזכאות לשירותי חינוך מיוחדים עבור בננו/בתנו בבית הספר. אנו מאשרים את קיום הדיון בוועדת זכאות ואפיון ללא נוכחותנו.</p>

    <section class="rq-signatures">
      <div class="rq-sign-row rq-two-cols">
        ${lineField("שם ההורה:", val(ctx, "parent1_name"), "rq-line-half")}
        ${lineField("שם ההורה:", val(ctx, "parent2_name"), "rq-line-half")}
      </div>
      <div class="rq-sign-row rq-two-cols">
        ${signatureLine(ctx, "parent1_sign", "חתימה")}
        ${signatureLine(ctx, "parent2_sign", "חתימה")}
      </div>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* המלצת פסיכולוג לשינוי אפיון — נספח 6.12                             */
/* ------------------------------------------------------------------ */

export const PSYCHOLOGIST_CODE_CHANGE_FORM_ID = "moe-psychologist-code-change";

function sup(n: number): string {
  return `<sup class="rq-sup">${n}</sup>`;
}

export function buildPsychologistCodeChangeBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);
  return `<div class="rq rq-psych">
    ${moeTextHeader({
      appendix: "נספח 6.12",
      unitLines: [
        "<b>השרות הפסיכולוגי ייעוצי, אגף פסיכולוגיה</b>",
        `<span class="rq-address">רח' דבורה הנביאה 2, ירושלים 91911 טל: 02/5603239, 02/5603241 פקס: 02/5603256</span>`,
        `<span class="rq-url">www.education.gov.il/shefi</span>`,
      ],
    })}
    <div class="rq-sign-row">${lineField("תאריך:", ltrVal(ctx, "filled_at"), "rq-line-short")}</div>

    <h1 class="rq-title rq-title-underline">המלצת הפסיכולוג על שינוי של אפיון המוגבלות בוועדת זכאות ואפיון${sup(1)}</h1>
    <p class="rq-intro">מסמך זה יהיה בשימוש במקרים של תלמידים מחדשי זכאות שבהם אפשר, על פי שיקול דעת הפסיכולוג, לשנות את אפיון המוגבלות מעיכוב התפתחותי, תפקודי או שפתי, לאפיון מוגבלות של לקות למידה ללא עדכון של המסמך הקביל הקיים.</p>

    <div class="rq-sign-row rq-two-cols">
      ${lineField("שם התלמיד:", val(ctx, "full_name"), "rq-line-half")}
      ${lineField("מס' ת\"ז:", ltrVal(ctx, "id_number"), "rq-line-half")}
    </div>
    <div class="rq-sign-row rq-two-cols">
      ${lineField("שם בית הספר:", val(ctx, "school_name"), "rq-line-half")}
      ${lineField("דרגת הכיתה:", val(ctx, "class_level"), "rq-line-half")}
    </div>
    <div class="rq-sign-row">${lineField("תאריך הדיון בוועדה:", ltrVal(ctx, "committee_date"), "rq-line-short")}</div>

    <p class="rq-para rq-statement">אפיון המוגבלות של התלמיד ${lineField("", val(ctx, "current_characterization"), "rq-line-inline rq-line-plain")} הוא לקות למידה, ואין חשד לקיום אפיון מוגבלות נוסף שהוא סיבה מרכזית להפרעת למידה.${sup(2)}</p>

    <p class="rq-para"><b>קביעת אפיון המוגבלות תבסס על מקורות המידע האלה:${sup(3)}</b></p>
    <ul class="rq-checklist">
      <li>${box(isChecked(ctx, "source_multidisciplinary"))}<span>מידע שעלה בדיון בצוות הרב-מקצועי במסגרת החינוכית</span></li>
      <li>${box(isChecked(ctx, "source_referral_questionnaire"))}<span>שאלון ההפניה לוועדה הכולל מאפיינים של לקות למידה</span></li>
      <li>${box(isChecked(ctx, "source_official_document"))}<span>מידע מהמסמך הקביל</span></li>
      <li>${box(isChecked(ctx, "source_other"))}<span>מידע ממקורות נוספים (תצפית, ישיבות צוות, מפגש עם ההורים וכו') הנמצא בהלימה לאפיון מוגבלות של לקות למידה.</span></li>
    </ul>

    <p class="rq-para"><b>הנימוקים להחלטה</b></p>
    <div class="rq-reasoning">${multiline(ctx, "reasoning")}</div>

    <section class="rq-signatures">
      <div class="rq-sign-row rq-two-cols">
        ${lineField(`שם פסיכולוג בית הספר:`, val(ctx, "psychologist_name"), "rq-line-half")}
        ${lineField("סטטוס הפסיכולוג:", val(ctx, "psychologist_status"), "rq-line-half")}
      </div>
      <div class="rq-sign-row">${signatureLine(ctx, "psychologist_sign", "חתימה:")}</div>
      <div class="rq-sign-row rq-two-cols">
        ${lineField(`שם המדריך/מנהל השפ"ח:`, val(ctx, "supervisor_name"), "rq-line-half")}
        ${signatureLine(ctx, "supervisor_sign", "חתימה:")}
      </div>
    </section>

    <ol class="rq-footnotes">
      <li>מסמך זה מאפשר קביעת אפיון של לקות למידה אך אינו משמש אבחנה של לקות למידה. יש להתבסס על ההנחיות במכתב בנושא מסמכים קבילים לתלמידים מחדשי זכאות, מרץ 2021.</li>
      <li>הפרעת למידה מוגדרת כקושי נמדד ומתמשך בתחומי ההישג של קריאה, כתיבה וחשבון לאחר התערבות (RTI) שלא הביאה לשינוי משמעותי.</li>
      <li>שינוי של אפיון המוגבלות יתאפשר רק אם כל מקורות המידע התקבלו והם תומכים בקביעה זו.</li>
      <li>מסמך זה קביל אך ורק כאשר הוא חתום על ידי פסיכולוג המסגרת החינוכית מטעם השירות הפסיכולוגי-חינוכי (רמה א' - ראה סעיף 3.7-61 בחוזר הוראות הקבע תשע/8(א), "מתווה השירות הפסיכולוגי-החינוכי").</li>
      <li>יש צורך בחתימה זו רק במקרים שבהם פסיכולוג בית הספר איננו פסיכולוג חינוכי מומחה.</li>
    </ol>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* המלצת פסיכולוג המסגרת בדיון הצוות הרב-מקצועי — נספח 8              */
/* ------------------------------------------------------------------ */

export const PSYCHOLOGIST_RECOMMENDATION_FORM_ID = "moe-psychologist-recommendation";

/** תאריך המילוי — גם כשאין שדה `filled_at` בסכמה (הערך מגיע כ-ISO מהמערכת) */
function filledAtValue(ctx: OriginalCtx): string {
  const value = raw(ctx, "filled_at");
  if (!value) return "";
  return `<span class="rq-val rq-ltr">${escapeHtml(formatOriginalDate(value))}</span>`;
}

function meetingAttendeesTable(ctx: OriginalCtx): string {
  const tableId = "meeting-attendees";
  const def = FORM_TABLE_DEFS[tableId];
  if (!def) return "";
  const rowCount = resolveTableRowCount(tableId, ctx.data);
  const rows: Array<{ name: string; role: string }> = [];
  for (let r = 0; r < rowCount; r += 1) {
    rows.push({
      name: String(ctx.data[tableCellKey(tableId, r, "name")] ?? "").trim(),
      role: String(ctx.data[tableCellKey(tableId, r, "role")] ?? "").trim(),
    });
  }
  const filled = rows.filter((row) => row.name || row.role);
  const minRows = 4;
  const shown =
    filled.length >= minRows
      ? filled
      : [...filled, ...Array(minRows - filled.length).fill({ name: "", role: "" })];
  return `<table class="rq-grid rq-meeting-attendees">
    <thead><tr><th>השם</th><th>התפקיד</th></tr></thead>
    <tbody>
      ${shown
        .map(
          (row) => `<tr><td>${row.name ? `<span class="rq-val">${escapeHtml(row.name)}</span>` : ""}</td><td>${row.role ? `<span class="rq-val">${escapeHtml(row.role)}</span>` : ""}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

export function buildPsychologistRecommendationBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);
  const chosen = raw(ctx, "characterization_type");
  const options = ctx.fieldByKey.get("characterization_type")?.options ?? [];
  const legal = staticText(ctx, "legal_note");
  return `<div class="rq rq-psych rq-psych-rec">
    ${moeTextHeader({
      appendix: "נספח 8",
      unitLines: [
        "<b>השרות הפסיכולוגי ייעוצי, אגף פסיכולוגיה</b>",
        `<span class="rq-address">רח' דבורה הנביאה 2, ירושלים 91911 טל: 02/5603239, 02/5603241 פקס: 02/5603256</span>`,
        `<span class="rq-url">www.education.gov.il/shefi</span>`,
      ],
    })}
    <div class="rq-sign-row">${lineField("תאריך:", filledAtValue(ctx), "rq-line-short")}</div>

    <h1 class="rq-title">המלצת פסיכולוג המסגרת החינוכית מטעם השפ"ח בדיון הצוות הרב-מקצועי*</h1>

    <div class="rq-sign-row rq-two-cols">
      ${lineField("שם התלמיד/ה:", val(ctx, "full_name"), "rq-line-half")}
      ${lineField("מס' ת\"ז:", ltrVal(ctx, "id_number"), "rq-line-half")}
    </div>
    <div class="rq-sign-row rq-two-cols">
      ${lineField("ביה\"ס/הגן:", val(ctx, "school_or_kindergarten"), "rq-line-half")}
      ${lineField("כיתה/ דרגת גן:", val(ctx, "class_or_gan_level"), "rq-line-half")}
    </div>
    <div class="rq-sign-row">${lineField("תאריך קיום הדיון:", ltrVal(ctx, "meeting_date"), "rq-line-short")}</div>

    <p class="rq-para"><b>הנוכחים</b></p>
    ${meetingAttendeesTable(ctx)}

    <p class="rq-para rq-statement">בעקבות הדיון בצוות הרב-מקצועי ובעקבות דיווחי צוות בית הספר/הגן וההורים, מסתמן ש${lineField("", val(ctx, "full_name"), "rq-line-inline rq-line-plain")} זקוק/ה למענים המותאמים לתלמיד עם -</p>
    <ul class="rq-checklist rq-checklist-indent">
      ${options
        .map(
          (option) =>
            `<li>${box(chosen === option.value)}<span>${escapeHtml(option.label)}</span></li>`
        )
        .join("")}
    </ul>
    ${raw(ctx, "student_needs") ? `<div class="rq-needs">${multiline(ctx, "student_needs")}</div>` : ""}

    <section class="rq-signatures">
      <div class="rq-sign-row rq-two-cols">
        ${lineField("שם הפסיכולוג/ית:", val(ctx, "psychologist_name"), "rq-line-half")}
        ${lineField("סטטוס הפסיכולוג/ית:", val(ctx, "psychologist_status"), "rq-line-half")}
      </div>
      <div class="rq-sign-row">${signatureLine(ctx, "psychologist_sign", "חתימה:")}</div>
      <div class="rq-sign-row rq-two-cols">
        ${lineField("שם המדריך/ה או מנהל/ת השפ\"ח:", val(ctx, "supervisor_name"), "rq-line-half")}
        ${signatureLine(ctx, "supervisor_sign", "חתימה:")}
      </div>
    </section>

    <p class="rq-footnote rq-legal-star">*${escapeHtml(legal)}</p>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* מיצוי אפשרויות התערבות בבית הספר                                     */
/* ------------------------------------------------------------------ */

export const EXHAUST_OPTIONS_FORM_ID = "moe-exhaust-options";

interface SupportRowDef {
  key: string;
  label: string;
  /** האם יש שדה "סוג" נפרד בשורה (במקור: לא בכל השורות) */
  hasKind: boolean;
}

const SUPPORT_ROWS: SupportRowDef[] = [
  { key: "support_integration_hours", label: "שעות מסל שילוב והכלה: טיפול/ הוראה", hasKind: true },
  { key: "support_individual_hours", label: "שעות פרטניות בתחום רגשי הוראה/ חברתי", hasKind: true },
  { key: "support_ale_hours", label: 'שעות אל"ה (על יסודי)', hasKind: false },
  { key: "support_counselor", label: "שיחות יועץ/ת", hasKind: false },
  { key: "support_psychological", label: "התערבות פסיכולוגית", hasKind: false },
  { key: "support_shekel_budget", label: "מענה מהתקציב השקלי בתחום רגשי/ לימודי/ חברתי", hasKind: true },
  { key: "support_other", label: "אחר (תומכי הוראה, מרחבי הכלה, תכניות וכדומה)", hasKind: true },
];

function supportRow(ctx: OriginalCtx, def: SupportRowDef): string {
  const kind = def.hasKind ? val(ctx, `${def.key}_kind`) : "";
  const duration = val(ctx, `${def.key}_duration`);
  const setting = val(ctx, `${def.key}_setting`);
  return `<tr>
    <td class="rq-right rq-support-type"><b>${escapeHtml(def.label)}</b>${multiline(ctx, def.key)}</td>
    <td class="rq-right rq-support-traits">
      ${def.hasKind ? `<div class="rq-support-kv"><span class="rq-support-k">סוג</span>${kind}</div>` : ""}
      <div class="rq-support-kv"><span class="rq-support-k">משך ההתערבות</span>${duration}</div>
    </td>
    <td class="rq-support-setting">${setting}</td>
  </tr>`;
}

export function buildExhaustOptionsBodyHtml(
  schema: FormSchema,
  data: Record<string, string>,
  moeLogoSrc: string
): string {
  const ctx = createCtx(schema, data);
  const hasPlan = raw(ctx, "has_personal_plan");
  const emblem = moeLogoSrc
    ? `<img class="rq-emblem logo-moe" src="${escapeHtml(moeLogoSrc)}" alt="סמל משרד החינוך" decoding="sync" />`
    : "";
  return `<div class="rq rq-exhaust">
    <header class="rq-header rq-moe-text-header rq-exhaust-header">
      ${emblem}
      <p class="rq-ministry-name"><b>משרד החינוך</b></p>
      <p class="rq-ministry-sub"><b>אגף בכיר</b></p>
      <p class="rq-ministry-sub"><b>יישום חוק החינוך המיוחד, הכלה והשתלבות</b></p>
    </header>

    <h1 class="rq-title rq-title-italic">ממרחב אפשרויות למיצוי אפשרויות בבית הספר</h1>

    <div class="rq-sign-row rq-two-cols">
      ${lineField('שם בי"ס:', val(ctx, "school_name"), "rq-line-half")}
      ${lineField("סמל מוסד:", ltrVal(ctx, "school_code"), "rq-line-half")}
    </div>

    <p class="rq-para"><b>מפקחים/ות, מנהלי/ות מוסדות חינוך</b></p>
    <p class="rq-para rq-bold">להלן מסמך הכולל הנחיות לקיום דיון לבחינת תהליך מיצוי אפשרויות ההתערבות, טרם הפניית תלמיד לוועדת זכאות ואפיון. מטרתו של המסמך שימולא היא לשקף את תהליך ההתערבות שבוצע, איכותו ומידת השפעתו על התקדמות התלמיד.<br />המסמך ימולא על ידי צוות המוסד החינוכי ויוצג בעת הדיון.<br />במקרים בהם יוחלט על הפניית התלמיד לוועדת זכאות ואפיון, יש לצרף את המסמך הכולל את המלצת המפקח, חתימתו וחתימת מנהל המוסד החינוכי.</p>
    <ol class="rq-num-list">
      <li>בתחילת שנת הלימודים יש לקיים מיפוי של התלמידים לבחינת מצבם הלימודי, הרגשי, ההתנהגותי והחברתי. המיפוי ייערך באחריות מחנך/ת הכתה, בשיתוף גורמים מקצועיים.</li>
      <li>בעקבות המיפוי יאותרו תלמידים הזקוקים לפדגוגיה מותאמת בהתאם לצרכיהם הלימודיים, הרגשיים והחברתיים, בהוראה בכיתה ובהוראה פרטנית.</li>
      <li>עבור כל תלמיד מאותר תבנה תכנית התערבות המותאמת לצרכיו מנקודת מבט כיתתית ופרטנית.</li>
      <li>תכנית ההתערבות תופעל בבית הספר לפחות 5-12 חודשים.</li>
      <li>במידה ולא חלה התקדמות או שעולה צורך בתמיכות נוספות, ניתן יהיה להפנות את התלמיד לדיון בוועדת זכאות ואפיון.</li>
    </ol>

    <p class="rq-para"><b>טרם הפניית התלמיד יש לבצע את הצעדים הבאים:</b></p>
    <ul class="rq-bullets">
      <li>מילוי המסמך שלהלן לבחינת המהלכים למיצוי אפשרויות התמיכה על-ידי הצוות המקצועי.</li>
      <li>דיון של הצוות המקצועי בהשתתפות המפקח/ת הכולל/ת.</li>
      <li>בסיום הדיון, תתקבל החלטה על הפנייה/ דחיית הפנייה של התלמיד לוועדת זכאות ואפיון.</li>
      <li>המפקח/ת תחתום/יחתום על המלצתו/ה להפניית התלמיד על גבי מסמך זה. אין בחתימת המפקח/ת התחייבות למתן זכאות בוועדת זכאות ואפיון.</li>
    </ul>

    <div class="rq-note-box">חשוב לציין: מילוי מסמך מיצוי האפשרויות יתקיים רק עבור תלמידים עם <b>מוגבלות בשכיחות גבוהה</b> (לקות למידה, הפרעת קשב וריכוז, הפרעות התנהגותיות רגשיות, עיכוב התפתחותי/שפתי) <b>המופנים לראשונה</b> לוועדות זכאות ואפיון.</div>

    <section class="rq-exhaust-form">
      <h2 class="rq-h2 rq-h2-center">בחינת מיצוי אפשרויות טרם הפניית תלמיד לדיון בוועדת זכאות ואפיון</h2>
      <div class="rq-sign-row rq-two-cols">
        ${lineField("שם המחנכ/ת:", val(ctx, "homeroom_teacher"), "rq-line-half")}
        ${lineField('שם בי"ס:', val(ctx, "school_name"), "rq-line-half")}
      </div>
      <div class="rq-sign-row">${lineField("סמל מוסד:", ltrVal(ctx, "school_code"), "rq-line-short")}</div>

      <table class="rq-grid rq-exhaust-student">
        <thead>
          <tr><th colspan="4" class="rq-grid-title">פרטים אישיים של התלמיד</th></tr>
          <tr><th>שם פרטי</th><th>שם משפחה</th><th>ת.ז</th><th>דרגת כתה בשנה הנוכחית</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${val(ctx, "first_name") || val(ctx, "full_name")}</td>
            <td>${val(ctx, "last_name")}</td>
            <td class="rq-ltr">${ltrVal(ctx, "id_number")}</td>
            <td>${val(ctx, "current_class_level")}</td>
          </tr>
        </tbody>
      </table>

      <ul class="rq-bullets rq-exhaust-bullets">
        <li>נכתבה תכנית אישית מותאמת לצרכי התלמיד&nbsp; ${box(hasPlan === "yes")} כן &nbsp; ${box(hasPlan === "no")} לא</li>
        <li>ניתנו התאמות לתלמיד במהלך הלמידה עם הכתה (כגון: התאמות בתוכן, בסביבות הלמידה, בחומרי הלמידה, תיווך, הטרמה, הערכה והיבחנות) פרט:
          <div class="rq-exhaust-detail">${multiline(ctx, "accommodations")}</div>
        </li>
        <li>תכנית ההתערבות הופעלה במשך ${lineField("", val(ctx, "intervention_current_year_months"), "rq-line-inline rq-line-plain rq-line-tiny")} חודשים בשנת הלימודים הנוכחית ובמשך ${lineField("", val(ctx, "intervention_previous_year_months"), "rq-line-inline rq-line-plain rq-line-tiny")} חודשים בשנה הלימודים הקודמת</li>
        <li>ניתנה תמיכה מהמשאבים הקיימים בבית הספר (יש למלא את סוג התמיכה הרלוונטי):</li>
      </ul>

      <table class="rq-grid rq-exhaust-support">
        <colgroup><col style="width:44%" /><col style="width:36%" /><col style="width:20%" /></colgroup>
        <thead><tr><th>סוג התמיכה - בלמידה מקרוב ובלמידה מרחוק</th><th>מאפייני ההתערבות</th><th>פרטני/קבוצתי</th></tr></thead>
        <tbody>
          ${SUPPORT_ROWS.map((def) => supportRow(ctx, def)).join("")}
        </tbody>
      </table>

      <div class="rq-exhaust-closing">
        <div class="rq-positions">
          <div class="rq-position"><b>עמדת ההורים:</b> ${multiline(ctx, "parents_position")}</div>
          <div class="rq-position"><b>עמדת המנהל/ת:</b> ${multiline(ctx, "principal_position")}</div>
          <div class="rq-position"><b>המלצת/ החלטת המפקח/ת:</b> ${multiline(ctx, "inspector_recommendation")}</div>
        </div>

        <section class="rq-signatures">
          <div class="rq-sign-row rq-two-cols">
            ${lineField("שם וחתימת המנהל/ת:", `${val(ctx, "principal_name")} ${signatureValue(ctx, "principal_sign")}`, "rq-line-half")}
            ${lineField("שם וחתימת המפקח/ת הכולל/ת:", `${val(ctx, "inspector_name")} ${signatureValue(ctx, "inspector_sign")}`, "rq-line-half")}
          </div>
          <div class="rq-sign-row">${lineField("תאריך:", ltrVal(ctx, "filled_at"), "rq-line-short")}</div>
        </section>
      </div>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                 */
/* ------------------------------------------------------------------ */

export const MOE_FORMS_PRINT_CSS = `
    /* ---- טפסי משרד החינוך הקצרים ---- */
    .rq-para { margin: 0 0 2.5mm; text-align: justify; font-size: 11pt; line-height: 1.45; }
    .rq-legal { margin-top: 4mm; }
    .rq-center-row { justify-content: center; }
    .rq-line-inline { margin: 0 1mm; }
    .rq-line-inline .rq-line-val { min-width: 38mm; }
    .rq-two-cols > .rq-line { flex: 1 1 45%; }
    .rq-line-half { flex: 1 1 45%; }
    .rq-parent-block { margin: 0 0 5mm; }
    .rq-parent-block .rq-sign-row { margin-bottom: 2.5mm; }
    .rq-sign-row-sig { justify-content: flex-start; }
    .rq-sign-row-sig .rq-line-sig { flex: 0 1 75mm; }
    .rq-checklist-indent { margin-right: 8mm; }
    .rq-checklist-detail { margin-right: 7.5mm; }
    .rq-waiver .rq-signatures { margin-top: 8mm; }
    .rq-waiver .rq-h2-center { margin: 6mm 0 4mm; }

    /* אישור הורים */
    .rq-approval .rq-title { font-size: 13.5pt; }

    /* הסכמת הורה — אתר בית הספר / פרסום תמונות */
    .rq-website-consent .rq-title { font-size: 13pt; text-align: center; margin-bottom: 5mm; }
    .rq-website-consent .rq-dash-rule {
      border: none;
      border-top: 1px solid #000;
      margin: 5mm 0;
    }
    .rq-website-consent-fields { margin-top: 4mm; }
    .rq-website-consent-sig { justify-content: flex-end; }
    .rq-website-consent-sig .rq-line-sig { flex: 0 1 55mm; }

    /* חידוש זכאות — נספח 6.11 */
    .rq-renewal .rq-title { font-size: 13pt; }
    .rq-renewal table.rq-grid { margin-bottom: 4mm; }
    .rq-renewal-to { margin: 2mm 0; }
    .rq-renewal .rq-h2-center { margin: 6mm 0 3mm; }
    .rq-renewal .rq-signatures { margin-top: 6mm; }
    .rq-approval table.rq-grid { margin-bottom: 4mm; }
    .rq .rq-class-types { text-align: right !important; vertical-align: top !important; line-height: 1.6; }
    .rq .rq-class-types { text-align: right !important; }
    .rq .rq-class-types div { display: flex; gap: 2mm; align-items: flex-start; margin-bottom: 1mm; }
    .rq .rq-class-types div .rq-box { flex: 0 0 auto; margin-top: 0.7mm; }
    .rq .rq-class-char { display: block; padding-right: 7mm; text-align: right; }
    .rq .rq-attendees-title { width: 26mm !important; vertical-align: middle !important; }
    .rq .rq-attendees th:not(.rq-attendees-title) { width: auto !important; }
    .rq-discussion { page-break-inside: avoid; break-inside: avoid; }
    .rq-discussion-box {
      border: 1px solid #000;
      min-height: 30mm;
      padding: 2mm;
      margin: 0 0 4mm;
    }
    .rq-approval .rq-h2-center { margin: 6mm 0 3mm; }

    /* המלצת פסיכולוג */
    .rq-psych .rq-address { font-size: 8.5pt; }
    .rq-psych .rq-url { font-size: 8.5pt; direction: ltr; unicode-bidi: isolate; text-decoration: underline; color: #1a3d8f; }
    .rq-title-underline { text-decoration: underline; font-size: 12.5pt; }
    .rq-sup { font-size: 7pt; vertical-align: super; line-height: 0; }
    .rq-statement { margin-top: 4mm; }
    .rq-reasoning { min-height: 35mm; padding: 1mm 0; margin: 0 0 6mm; }
    .rq-footnotes {
      margin: 8mm 0 0;
      padding: 2mm 5mm 0 0;
      border-top: 1px solid #000;
      font-size: 8pt;
      line-height: 1.35;
      color: #000;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .rq-footnotes li { margin: 0 0 1mm; }

    /* נספח 8 — המלצת פסיכולוג המסגרת */
    .rq-psych-rec .rq-title { font-size: 14pt; margin-bottom: 5mm; }
    .rq .rq-meeting-attendees { width: 70%; margin: 1mm auto 5mm 0; }
    .rq .rq-meeting-attendees th { width: 50% !important; }
    .rq-needs { margin: 0 8mm 4mm 0; }
    .rq-legal-star { margin-top: 10mm; font-size: 9pt; line-height: 1.4; text-align: justify; }

    /* מיצוי אפשרויות */
    .rq-exhaust-header .rq-ministry-name { font-size: 12pt; }
    .rq-exhaust-header .rq-ministry-sub { font-size: 10.5pt; }
    .rq-title-italic { font-style: italic; font-size: 13pt; }
    .rq-bold { font-weight: 700; }
    .rq-num-list { margin: 0 0 3mm; padding: 0 6mm 0 0; font-size: 11pt; line-height: 1.45; }
    .rq-num-list li { margin: 0 0 1.5mm; }
    .rq-bullets { margin: 0 0 3mm; padding: 0 6mm 0 0; font-size: 11pt; line-height: 1.45; list-style: disc; }
    .rq-bullets li { margin: 0 0 1.5mm; }
    .rq-note-box {
      border: 1px solid #000;
      padding: 3mm 4mm;
      margin: 4mm 0 6mm;
      font-size: 11pt;
      line-height: 1.5;
      text-align: justify;
    }
    .rq-exhaust-form { page-break-before: always; break-before: page; }
    .rq-exhaust-form .rq-h2-center { font-size: 12.5pt; margin: 0 0 3mm; }
    .rq-exhaust-form .rq-sign-row { margin-bottom: 2mm; }
    .rq .rq-grid-title { text-align: center !important; font-size: 11.5pt; }
    .rq .rq-exhaust-student th { width: 25% !important; }
    .rq-exhaust-bullets li { margin-bottom: 1.5mm; }
    .rq-exhaust-detail { min-height: 6mm; border-bottom: 1px solid #000; margin: 1mm 0 0; padding: 0.5mm 1mm; }
    .rq-line-tiny .rq-line-val { min-width: 14mm; text-align: center; }
    .rq .rq-exhaust-support { font-size: 10pt; }
    .rq .rq-exhaust-support th { text-align: center !important; }
    .rq .rq-exhaust-support td { vertical-align: top !important; height: auto; }
    .rq .rq-support-type { text-align: right !important; }
    .rq .rq-support-type b { display: block; margin-bottom: 1mm; }
    .rq .rq-support-traits { text-align: right !important; }
    .rq-support-kv { display: flex; gap: 2mm; align-items: baseline; min-height: 5mm; border-bottom: 1px dotted #999; margin-bottom: 0.5mm; }
    .rq-support-kv:last-child { border-bottom: 0; margin-bottom: 0; }
    .rq-support-k { font-weight: 700; flex: 0 0 auto; }
    .rq .rq-support-setting { vertical-align: middle !important; }
    .rq .rq-exhaust-support td { padding-top: 1mm; padding-bottom: 1mm; }
    .rq-exhaust-closing { page-break-inside: avoid; break-inside: avoid; }
    .rq-positions { margin: 2mm 0 4mm; }
    .rq-position { min-height: 8mm; border-bottom: 1px solid #000; margin: 0 0 2mm; padding: 0 0 1mm; font-size: 11pt; line-height: 1.45; }
    .rq-position .rq-text { display: inline; }
    .rq-exhaust .rq-signatures { margin-top: 3mm; }
    .rq-exhaust .rq-signatures .rq-sign-row:last-child { margin-bottom: 0; }
`;
