/**
 * שאלון הפניה של תלמיד הלומד בכיתה רגילה לדיון בצוות רב-מקצועי (נספח 4.2) —
 * פריסת הדפסה כמו הטופס המקורי (public/portfolio-templates/sheelon-hafnaya-multidisciplinary.docx):
 * כותרת משרד החינוך, כותרת כחולה, סעיפים א–ז, טבלת 33 פריטי תפקוד בסולם 1–9,
 * שלוש שורות חתימה, ודף להורים.
 */

import type { FormSchema } from "@/lib/form-schemas";
import type { FormFieldDef } from "@/lib/form-fields";
import {
  box,
  createCtx,
  escapeHtml,
  isChecked,
  lineField,
  ltrVal,
  moeTextHeader,
  multiline,
  raw,
  signatureValue,
  val,
  type OriginalCtx,
} from "@/lib/form-snapshot-original-shared";

export const REFERRAL_MULTIDISCIPLINARY_FORM_ID = "referral-questionnaire-multidisciplinary";

type Ctx = OriginalCtx;

function sectionTitle(letter: string, text: string, extra = ""): string {
  return `<h2 class="rq-h2 rq-rm-h2">${escapeHtml(letter)}. <b>${escapeHtml(text)}</b>${extra}</h2>`;
}

/* ---------- א. פרטי בית הספר ---------- */
function schoolTable(ctx: Ctx): string {
  return `<table class="rq-grid rq-rm-school">
    <thead>
      <tr>
        <th>שם בית הספר</th>
        <th>סמל המוסד</th>
        <th>דרגת הכיתה</th>
        <th>שם המחנך/ת<br />(ממלא/ת השאלון)</th>
        <th>תאריך מילוי השאלון</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${val(ctx, "school_name")}</td>
        <td>${ltrVal(ctx, "institution_code")}</td>
        <td>${val(ctx, "class_name")}</td>
        <td>${val(ctx, "homeroom_teacher")}</td>
        <td>${ltrVal(ctx, "filled_at")}</td>
      </tr>
    </tbody>
  </table>`;
}

/* ---------- ב. פרטים אישיים ---------- */
function personalTable(ctx: Ctx): string {
  const gender = raw(ctx, "gender");
  return `<table class="rq-grid rq-rm-personal">
    <colgroup>
      <col class="rq-rm-col-name" />
      <col class="rq-rm-col-name" />
      <col class="rq-rm-col-id" />
      <col class="rq-rm-col-date" />
      <col class="rq-rm-col-opt" />
      <col class="rq-rm-col-box" />
    </colgroup>
    <tbody>
      <tr>
        <th>השם הפרטי</th>
        <th>שם המשפחה</th>
        <th>מס' תעודת הזהות</th>
        <th>תאריך הלידה</th>
        <th colspan="2">המין</th>
      </tr>
      <tr>
        <td rowspan="2">${val(ctx, "first_name")}</td>
        <td rowspan="2">${val(ctx, "last_name")}</td>
        <td rowspan="2">${ltrVal(ctx, "id_number")}</td>
        <td rowspan="2">${ltrVal(ctx, "birth_date")}</td>
        <td class="rq-opt">זכר</td>
        <td class="rq-boxcell">${box(gender === "male")}</td>
      </tr>
      <tr>
        <td class="rq-opt">נקבה</td>
        <td class="rq-boxcell">${box(gender === "female")}</td>
      </tr>
      <tr class="rq-rm-origin">
        <th>ארץ הלידה</th>
        <td colspan="2">${val(ctx, "birth_country")}</td>
        <th>תאריך העלייה</th>
        <td colspan="2">${ltrVal(ctx, "aliyah_date")}</td>
      </tr>
    </tbody>
  </table>`;
}

function parentsTable(ctx: Ctx): string {
  const nameCell = (label: string, key: string) =>
    `<td class="rq-parent-name"><b>${escapeHtml(label)}</b> ${val(ctx, key)}</td>`;
  return `<table class="rq-grid rq-rm-parents">
    <colgroup>
      <col class="rq-rm-col-parent" />
      <col class="rq-rm-col-status" />
      <col class="rq-rm-col-address" />
      <col class="rq-rm-col-phone" />
    </colgroup>
    <thead>
      <tr>
        <th>פרטי ההורים</th>
        <th>המצב המשפחתי</th>
        <th>הכתובת הפרטית</th>
        <th>מס' הטלפון</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        ${nameCell("שם ההורה:", "father_name")}
        <td rowspan="3">${val(ctx, "family_status")}</td>
        <td rowspan="3">${val(ctx, "home_address")}</td>
        <td rowspan="3">${ltrVal(ctx, "phone")}</td>
      </tr>
      <tr>${nameCell("שם ההורה:", "mother_name")}</tr>
      <tr>${nameCell("שם האפוטרופוס:", "guardian_name")}</tr>
    </tbody>
  </table>`;
}

/* ---------- ג. דיונים קודמים ---------- */
function priorDiscussions(ctx: Ctx): string {
  const items: Array<[string, string, string]> = [
    ["prior_integration_committee", "ועדת שילוב", "prior_discussion_date_1"],
    ["prior_multidisciplinary", "צוות רב-מקצועי", "prior_discussion_date_2"],
    ["prior_placement_committee", "ועדת השמה", "prior_discussion_date_3"],
    ["prior_eligibility_committee", "ועדת זכאות ואפיון", "prior_discussion_date_4"],
  ];
  const answer = raw(ctx, "had_prior_discussion");
  const yesNo = answer
    ? ` <span class="rq-yesno">${box(answer === "yes")} כן &nbsp; ${box(answer === "no")} לא</span>`
    : "";
  return `${sectionTitle("ג", "האם התקיים בעבר דיון מתוקף חוק בעניין התלמיד/ה?", ` <span class="rq-rm-note">(סמן)</span>${yesNo}`)}
    <table class="rq-rm-prior">
      <tbody>
        <tr>
          ${items.map(([key, label]) => `<td><span class="rq-rm-check">${box(isChecked(ctx, key))} ${escapeHtml(label)}</span></td>`).join("")}
        </tr>
        <tr>
          ${items.map(([, , dateKey]) => `<td>${lineField("בתאריך:", ltrVal(ctx, dateKey), "rq-line-short rq-line-plain")}</td>`).join("")}
        </tr>
      </tbody>
    </table>`;
}

/* ---------- ד. הגורמים המפנים ---------- */
function referrers(ctx: Ctx): string {
  const detail = val(ctx, "referrer_education_worker_detail");
  return `${sectionTitle("ד", "הגורמים המפנים", ` לצוות רב-מקצועי לקביעת זכאות לשירותי חינוך מיוחדים`)}
    <ul class="rq-checklist rq-rm-referrers">
      <li>${box(isChecked(ctx, "referrer_education_worker"))}<span>עובד חינוך (פרט): <span class="rq-rm-detail">${detail}</span></span></li>
      <li>${box(isChecked(ctx, "referrer_eligibility_committee"))}<span>ועדת זכאות ואפיון או ועדת זכאות ואפיון ביושבה כהשגה</span></li>
      <li>${box(isChecked(ctx, "referrer_parent"))}<span>הורה</span></li>
    </ul>`;
}

/* ---------- ה–ו. שאלות פתוחות ---------- */
function openBox(ctx: Ctx, key: string): string {
  return `<div class="rq-rm-open">${multiline(ctx, key)}</div>`;
}

/* ---------- ז. שאלון לתיאור התפקוד ---------- */
function funcScaleTable(ctx: Ctx, schema: FormSchema): string {
  const fields: FormFieldDef[] = schema.sections
    .filter((section) => (section.title ?? "").startsWith("שאלון לתיאור התפקוד"))
    .flatMap((section) => section.fields)
    .filter((field) => field.key.startsWith("func_") && field.type === "select");

  const rows = fields
    .map((field, index) => {
      const value = raw(ctx, field.key);
      const cells = Array.from({ length: 9 }, (_, i) => {
        const n = String(i + 1);
        return `<td class="rq-rm-scale${value === n ? " rq-rm-scale-on" : ""}">${n} ${box(value === n)}</td>`;
      }).join("");
      return `<tr>
        <td class="rq-rm-num">${index + 1}.</td>
        <td class="rq-rm-item">${escapeHtml(String(field.label ?? ""))}</td>
        ${cells}
      </tr>`;
    })
    .join("");

  return `<table class="rq-grid rq-rm-func">
    <colgroup>
      <col class="rq-rm-col-num" />
      <col class="rq-rm-col-item" />
      ${Array.from({ length: 9 }, () => `<col class="rq-rm-col-scale" />`).join("")}
    </colgroup>
    <thead>
      <tr>
        <th colspan="2" rowspan="2" class="rq-rm-func-title">הפריטים לתיאור התפקוד של התלמיד<br /><span class="rq-rm-func-sub">בהשוואה לתלמידים רגילים בני אותו גיל</span></th>
        <th colspan="3">חלש</th>
        <th colspan="3">ממוצע</th>
        <th colspan="3">טוב</th>
      </tr>
      <tr>
        ${Array.from({ length: 9 }, (_, i) => `<th class="rq-rm-scale-head">${i + 1}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* ---------- חתימות ---------- */
function signRow(
  ctx: Ctx,
  dateKey: string,
  nameLabel: string,
  nameHtml: string,
  signatureKey: string
): string {
  return `<div class="rq-sign-row rq-rm-sign-row">
    ${lineField("תאריך:", ltrVal(ctx, dateKey), "rq-line-date")}
    ${lineField(nameLabel, nameHtml, "rq-line-name")}
    ${lineField("חתימה:", signatureValue(ctx, signatureKey), "rq-line-sig")}
  </div>`;
}

function signaturesHtml(ctx: Ctx): string {
  return `<section class="rq-signatures rq-rm-signatures">
    ${signRow(ctx, "homeroom_sign_date", "שם מחנך/ת הכיתה:", val(ctx, "homeroom_teacher"), "homeroom_signature")}
    ${signRow(ctx, "principal_date", 'שם מנהל/ת ביה"ס:', val(ctx, "principal_name"), "principal_signature")}
    ${signRow(ctx, "supervisor_date", 'שם מפקח/ת ביה"ס:', val(ctx, "supervisor_name"), "supervisor_signature")}
    <div class="rq-sign-row rq-rm-copy-row">
      ${lineField("העתק להורים נמסר בתאריך:", ltrVal(ctx, "parents_copy_date"), "rq-line-date")}
      ${lineField("על ידי:", val(ctx, "parents_copy_by"), "rq-line-name")}
    </div>
  </section>`;
}

/* ---------- דף להורים ---------- */
function parentsPage(ctx: Ctx): string {
  const studentName = [raw(ctx, "first_name"), raw(ctx, "last_name")].filter(Boolean).join(" ");
  const nameHtml = studentName ? `<span class="rq-val">${escapeHtml(studentName)}</span>` : "";
  return `<section class="rq-rm-parents-page">
    <h2 class="rq-h2 rq-h2-center rq-rm-parents-title">דף להורים</h2>
    <p class="rq-rm-parents-greeting">להורים שלום,</p>
    <p class="rq-intro">כידוע לכם ידון הצוות הרב-מקצועי בזכאות בנכם/בתכם לקבל תמיכה משירותי חינוך מיוחדים, על פי התיאור שנמסר על ידי המורה בשאלון ההפניה. כהשלמה למידע זה אנו רואים חשיבות רבה במידע שתמסרו אתם לצוות על תפקוד בנכם/בתכם.</p>
    <p class="rq-intro">אתם מתבקשים לתאר את ילדכם תוך התייחסות לנקודות האלה: התנהגותו, יכולתו, קשייו, דרכי ההתמודדות שלכם עם קשייו וכל מידע נוסף שיסייע לצוות בהחלטותיו.</p>

    <p class="rq-rm-parents-q"><b>נא הוסיפו את הערותיכם ביחס לדיווח המורה בשאלון:</b></p>
    <div class="rq-rm-open rq-rm-open-tall">${multiline(ctx, "parent_notes_on_teacher_report")}</div>

    <p class="rq-rm-parents-q"><b>ציינו מה ילדכם מספר על רצונותיו וכן על יכולותיו ועל קשייו במסגרת הנוכחית, וציינו גם דרכי הוראה או תמיכות שהועילו לו לדעתכם:</b></p>
    <div class="rq-rm-open rq-rm-open-tall">${multiline(ctx, "parent_child_wishes")}</div>

    <p class="rq-rm-parents-return">נא החזירו דף זה למורה כדי שהוא יצרף אותו לשאלון שהוא מילא.</p>

    <div class="rq-sign-row rq-rm-parents-line">
      ${lineField("שם התלמיד/ה:", nameHtml, "rq-line-name")}
      ${lineField('מס\' ת"ז של התלמיד/ה:', ltrVal(ctx, "id_number"), "rq-line-name")}
    </div>
    <div class="rq-sign-row rq-rm-parents-line">
      ${lineField("שם האם:", val(ctx, "mother_name"), "rq-line-name")}
      ${lineField("שם האב:", val(ctx, "father_name"), "rq-line-name")}
    </div>
    <div class="rq-sign-row rq-rm-parents-line">
      ${lineField("שם בית הספר שבו התלמיד/ה לומד/ת:", val(ctx, "school_name"), "rq-line-name")}
      ${lineField("המורה:", val(ctx, "homeroom_teacher"), "rq-line-name")}
    </div>
    <div class="rq-sign-row rq-rm-parents-line rq-signatures">
      ${lineField("חתימת ההורים:", signatureValue(ctx, "parent_signature"), "rq-line-sig")}
      ${lineField("תאריך:", ltrVal(ctx, "parent_sign_date"), "rq-line-date")}
    </div>
  </section>`;
}

/**
 * גוף המסמך (בלי <html>/<style> — אלה מגיעים מ-buildFormSnapshotHtml).
 * במקור אין סמל — רק שורות הטקסט של משרד החינוך.
 */
export function buildReferralMultidisciplinaryBodyHtml(
  schema: FormSchema,
  data: Record<string, string>
): string {
  const ctx = createCtx(schema, data);

  return `<div class="rq rq-referral rq-rm">
    ${moeTextHeader({ appendix: "נספח 4.2" })}
    <h1 class="rq-title rq-rm-title">שאלון הפניה של תלמיד הלומד בכיתה רגילה לדיון בצוות רב-מקצועי<br />לקביעת זכאות לשירותי חינוך מיוחדים</h1>
    <p class="rq-intro">הדיון בצוות הרב-מקצועי הוא צומת משמעותי בקבלת החלטות הנוגעות לתלמיד. יש להקפיד למלא את כל הפרטים בשאלון ההפניה כדי שבידי הוועדה יהיו כל הנתונים והמידע הדרושים לקבלת החלטה מיטבית, הוגנת ומקצועית בעניינו.</p>

    ${sectionTitle("א", "פרטי בית הספר")}
    ${schoolTable(ctx)}

    ${sectionTitle("ב", "פרטים אישיים")}
    ${personalTable(ctx)}
    ${parentsTable(ctx)}

    ${priorDiscussions(ctx)}
    ${referrers(ctx)}

    ${sectionTitle("ה", "הסיבה להפניית התלמיד/ה לדיון")}
    ${openBox(ctx, "referral_reason")}

    ${sectionTitle("ו", "תהליכים חינוכיים וטיפוליים לקידום התלמיד ותמיכות שקיבל:", ` <span class="rq-rm-note">(פירוט התחום והתדירות/המשך ותיאור התהליך)</span>`)}
    ${openBox(ctx, "support_processes")}

    ${sectionTitle("ז", "שאלון לתיאור התפקוד של התלמיד")}
    <p class="rq-intro rq-rm-func-intro">השאלון כולל את הערכת תפקודו של התלמיד על-פי 33 פריטים בסולם 9-1. יש להקיף במעגל את המספר המתאים לפי הערכתכם. בססו אותה על הערכתכם ועל ניסיונכם עם תלמידים בני אותו גיל:</p>
    ${funcScaleTable(ctx, schema)}

    ${signaturesHtml(ctx)}
    ${parentsPage(ctx)}
  </div>`;
}

/** CSS ייעודי (מעל ORIGINAL_LOOK_BASE_CSS + REFERRAL_QUESTIONNAIRE_PRINT_CSS) */
export const REFERRAL_MULTIDISCIPLINARY_PRINT_CSS = `
    /* ---- שאלון הפניה לצוות רב-מקצועי (נספח 4.2) ---- */
    .rq-rm .rq-title.rq-rm-title { margin: 2mm 0 3mm; color: #0000ff; font-size: 13pt; line-height: 1.35; }
    .rq-rm .rq-intro { font-size: 11pt; }
    .rq-rm-h2 { margin: 4mm 0 1.5mm; font-size: 11.5pt; font-weight: 400; }
    .rq-rm-h2 b { font-weight: 700; }
    .rq-rm-note { font-weight: 400; font-size: 10.5pt; }

    /* טבלאות הפרטים — צרות מהעמוד, כמו במקור */
    .rq table.rq-rm-school { width: 100%; }
    .rq table.rq-rm-school th { height: 12mm; }
    .rq table.rq-rm-school tbody td { height: 10mm; }
    .rq table.rq-rm-personal th { height: 10mm; }
    .rq table.rq-rm-personal .rq-rm-origin th { height: 7mm; text-align: right; }
    .rq table.rq-rm-personal .rq-rm-origin td { text-align: right; }
    .rq-rm-col-name { width: 16%; }
    .rq-rm-col-id { width: 20%; }
    .rq-rm-col-date { width: 18%; }
    .rq-rm-col-opt { width: 12%; }
    .rq-rm-col-box { width: 9%; }
    .rq-rm-col-parent { width: 34%; }
    .rq-rm-col-status { width: 16%; }
    .rq-rm-col-address { width: 28%; }
    .rq-rm-col-phone { width: 22%; }
    .rq table.rq-rm-parents th { height: 10mm; }
    .rq table.rq-rm-parents tbody td { height: 8mm; }
    .rq .rq-rm-parents .rq-parent-name { text-align: right; }

    /* ג. דיונים קודמים — 4 עמודות בלי קווים */
    .rq table.rq-rm-prior { width: 100%; border-collapse: collapse; margin: 0 0 2mm; }
    .rq table.rq-rm-prior td {
      border: none;
      padding: 0.5mm 1mm;
      text-align: right;
      vertical-align: top;
      font-size: 11pt;
      width: 25% !important;
      color: #000 !important;
    }
    .rq-rm-check { white-space: nowrap; }
    .rq-rm-check .rq-box { margin-left: 1mm; }
    .rq table.rq-rm-prior .rq-line-short .rq-line-val { min-width: 22mm; }

    .rq-rm-referrers li { font-size: 11pt; }
    .rq-rm-detail { display: inline-block; min-width: 45mm; border-bottom: 1px solid #000; padding: 0 1.5mm; }

    /* ה–ו. תיבות טקסט */
    .rq-rm-open {
      border: 1px solid #000;
      min-height: 22mm;
      padding: 1.5mm 2mm;
      margin: 0 0 2mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .rq-rm-open-tall { min-height: 34mm; }

    /* ז. טבלת התפקוד — 33 שורות, 1–9 */
    .rq-rm-func-intro { margin: 0 0 2mm; }
    .rq table.rq-rm-func {
      page-break-inside: auto;
      break-inside: auto;
      margin: 0 0 3mm;
    }
    .rq table.rq-rm-func thead { display: table-header-group; }
    .rq table.rq-rm-func tbody tr { page-break-inside: avoid; break-inside: avoid; }
    .rq table.rq-rm-func th,
    .rq table.rq-rm-func td { padding: 0.8mm 1mm; font-size: 10pt; }
    .rq table.rq-rm-func th.rq-rm-func-title { text-align: right; font-size: 10.5pt; }
    .rq-rm-func-sub { font-weight: 400; font-size: 9.5pt; }
    .rq table.rq-rm-func th.rq-rm-scale-head { font-weight: 400; font-size: 9pt; }
    .rq table.rq-rm-func tbody td { height: 6.5mm; min-height: 6.5mm; }
    .rq table.rq-rm-func td.rq-rm-num { text-align: center; font-weight: 700; }
    .rq table.rq-rm-func td.rq-rm-item { text-align: right; line-height: 1.25; }
    .rq table.rq-rm-func td.rq-rm-scale { white-space: nowrap; font-size: 9pt; direction: ltr; }
    .rq table.rq-rm-func td.rq-rm-scale .rq-box { width: 3.6mm; height: 3.6mm; line-height: 3.3mm; font-size: 8pt; vertical-align: -0.4mm; }
    .rq table.rq-rm-func td.rq-rm-scale-on { font-weight: 700; }
    .rq-rm-col-num { width: 6%; }
    .rq-rm-col-item { width: 40%; }
    .rq-rm-col-scale { width: 6%; }

    /* חתימות */
    .rq-rm-signatures { margin-top: 5mm; }
    .rq-rm-sign-row { margin: 0 0 4mm; }
    .rq-rm-sign-row .rq-line-date { flex: 0 1 38mm; }
    .rq-rm-sign-row .rq-line-name { flex: 1 1 60mm; }
    .rq-rm-copy-row { margin-top: 2mm; }

    /* דף להורים */
    .rq-rm-parents-page { page-break-before: always; break-before: page; }
    .rq-rm-parents-title { margin: 0 0 4mm; font-size: 14pt; text-decoration: underline; }
    .rq-rm-parents-greeting { margin: 0 0 2mm; font-weight: 700; }
    .rq-rm-parents-q { margin: 4mm 0 1.5mm; font-size: 11pt; }
    .rq-rm-parents-return { margin: 4mm 0 6mm; font-weight: 700; font-size: 11pt; }
    .rq-rm-parents-line { margin: 0 0 4.5mm; }
    .rq-rm-parents-line .rq-line-label { font-weight: 700; }
`;
