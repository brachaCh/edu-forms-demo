/**
 * פריסת הדפסה/PDF לשאלון ההפניה לוועדת זכאות ואפיון (בית ספר) — נאמנה לטופס
 * המקורי של משרד החינוך (public/portfolio-templates/sheelon-hafnaya.docx):
 * סמל המדינה, כותרת אדומה, טבלאות פרטים עם משבצות זכר/נקבה ו-רגיל/מיוחד,
 * שאלות פתוחות בתיבות, ושורות חתימה עם קו.
 */

import type { FormSchema } from "@/lib/form-schemas";
import {
  box,
  createCtx,
  display,
  escapeHtml,
  lineField,
  ltrVal,
  multiline,
  raw,
  signatureValue,
  val,
  type OriginalCtx,
} from "@/lib/form-snapshot-original-shared";

export const REFERRAL_QUESTIONNAIRE_FORM_ID = "referral-questionnaire";

/** @deprecated השתמשו ב-formatOriginalDate */
export { formatOriginalDate as formatReferralDate } from "@/lib/form-snapshot-original-shared";

type Ctx = OriginalCtx;

function studentTable(ctx: Ctx): string {
  const gender = raw(ctx, "gender");
  return `<table class="rq-grid rq-student">
    <thead>
      <tr>
        <th>השם הפרטי</th>
        <th>שם המשפחה</th>
        <th>מספר תעודת הזהות</th>
        <th>תאריך הלידה</th>
        <th colspan="2">המין</th>
        <th>מספר הילדים במשפחה</th>
        <th>מקומו של הילד במשפחה</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td rowspan="2">${val(ctx, "first_name")}</td>
        <td rowspan="2">${val(ctx, "last_name")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "id_number")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "birth_date")}</td>
        <td class="rq-opt">זכר</td>
        <td class="rq-boxcell">${box(gender === "male")}</td>
        <td rowspan="2">${val(ctx, "siblings_count")}</td>
        <td rowspan="2">${val(ctx, "birth_order")}</td>
      </tr>
      <tr>
        <td class="rq-opt">נקבה</td>
        <td class="rq-boxcell">${box(gender === "female")}</td>
      </tr>
    </tbody>
  </table>`;
}

function parentsTable(ctx: Ctx): string {
  // במקור עמודת טלפון אחת לשתי שורות ההורים; טלפון הבית ממלא את השורה הראשונה אם אין טלפון להורה 1
  const phone1 = raw(ctx, "parent1_phone") || raw(ctx, "phone");
  const phone2 = raw(ctx, "parent2_phone");
  const phoneCell = (value: string) =>
    value ? `<span class="rq-val rq-ltr">${escapeHtml(value)}</span>` : "";
  return `<table class="rq-grid rq-parents">
    <thead>
      <tr>
        <th>פרטי ההורים</th>
        <th>המצב המשפחתי</th>
        <th>הכתובת הפרטית</th>
        <th>מס' הטלפון</th>
        <th>דוא"ל</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="rq-parent-name"><b>שם הורה:</b> ${val(ctx, "father_name")}</td>
        <td rowspan="2">${val(ctx, "family_status")}</td>
        <td rowspan="2">${val(ctx, "home_address")}</td>
        <td>${phoneCell(phone1)}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "email")}</td>
      </tr>
      <tr>
        <td class="rq-parent-name"><b>שם הורה:</b> ${val(ctx, "mother_name")}</td>
        <td>${phoneCell(phone2)}</td>
      </tr>
    </tbody>
  </table>`;
}

function institutionTable(ctx: Ctx): string {
  const type = raw(ctx, "institution_type");
  return `<table class="rq-grid rq-institution">
    <thead>
      <tr>
        <th>שם המוסד שבו התלמיד לומד</th>
        <th>סמל המוסד</th>
        <th colspan="2">סוג המוסד</th>
        <th>סוג המוגבלות של הכיתה</th>
        <th>דרגת הכיתה</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td rowspan="2">${val(ctx, "school_name")}</td>
        <td rowspan="2" class="rq-ltr">${val(ctx, "institution_code")}</td>
        <td class="rq-opt">רגיל</td>
        <td class="rq-boxcell">${box(type === "regular")}</td>
        <td rowspan="2">${val(ctx, "disability_class_type")}</td>
        <td rowspan="2">${val(ctx, "class_name")}</td>
      </tr>
      <tr>
        <td class="rq-opt">מיוחד</td>
        <td class="rq-boxcell">${box(type === "special")}</td>
      </tr>
    </tbody>
  </table>`;
}

function teacherTable(ctx: Ctx): string {
  return `<table class="rq-grid rq-teacher">
    <tbody>
      <tr>
        <th>ארץ לידה</th>
        <td>${val(ctx, "birth_country")}</td>
        <th>שם המחנך (ממלא השאלון)</th>
        <td>${val(ctx, "homeroom_teacher")}</td>
      </tr>
      <tr>
        <th>תאריך עלייה</th>
        <td class="rq-ltr">${val(ctx, "aliyah_date")}</td>
        <th>תאריך מילוי השאלון</th>
        <td class="rq-ltr">${val(ctx, "filled_at")}</td>
      </tr>
    </tbody>
  </table>`;
}

/** שורה בתיבה: שאלה מודגשת + ערך (בשורה או מתחת) */
function qRow(question: string, valueHtml: string, opts?: { tall?: boolean; note?: string }): string {
  const cls = opts?.tall ? " rq-q-tall" : "";
  const note = opts?.note ? ` <span class="rq-q-note">${escapeHtml(opts.note)}</span>` : "";
  return `<tr class="rq-q${cls}"><td>
    <div class="rq-q-label"><b>${escapeHtml(question)}</b>${note}</div>
    ${valueHtml}
  </td></tr>`;
}

function yesNo(ctx: Ctx, key: string): string {
  const value = raw(ctx, key);
  return `<span class="rq-yesno">${box(value === "yes")} כן &nbsp; ${box(value === "no")} לא</span>`;
}

function backgroundBox(ctx: Ctx): string {
  const priorDiscussion = raw(ctx, "had_prior_discussion");
  const priorDatesHtml = ["prior_discussion_date_1", "prior_discussion_date_2"]
    .map((key) => lineField("תאריך הדיון:", ltrVal(ctx, key), "rq-line-short"))
    .join(" ");

  return `<table class="rq-box-table">
    <tbody>
      ${qRow("סיבת ההפניה", val(ctx, "referral_reason_type"), { note: "(חידוש זכאות, שינוי סוג המסגרת החינוכית, אחר):" })}
      ${qRow("הגורם המפנה", val(ctx, "referral_source_detail") || val(ctx, "referral_source"), { note: "(הורים, צוות חינוכי וכיו\"ב):" })}
      <tr class="rq-q"><td>
        <table class="rq-split"><tr>
          <td class="rq-split-main">
            <div class="rq-q-label"><b>דיונים קודמים</b> <span class="rq-q-note">(האם התקיים בעבר דיון בעניינו של התלמיד במסגרת ועדת שילוב/ צוות רב מקצועי/השמה/זכאות ואפיון/ערר/השגה)?</span> ${priorDiscussion ? yesNo(ctx, "had_prior_discussion") : ""}</div>
            <div class="rq-inline">${priorDatesHtml}</div>
          </td>
          <td class="rq-split-side">
            <div class="rq-q-label"><b>אם כן, פרט:</b></div>
            ${multiline(ctx, "prior_discussion_details")}
          </td>
        </tr></table>
      </td></tr>
      ${qRow("משך הזמן שהתלמיד לומד במסגרת הנוכחית:", val(ctx, "time_in_framework"))}
      ${qRow("משך זמן ההיכרות של המחנך/ת את התלמיד:", val(ctx, "acquaintance_duration"))}
      ${qRow("מספר השעות השבועיות שהמחנך/ת מלמד/ת בכיתה:", val(ctx, "weekly_hours_homeroom"))}
      <tr class="rq-q"><td>
        <div class="rq-q-label"><b>האם התלמיד מטופל על-ידי גורמים מקצועיים אחרים?</b> ${yesNo(ctx, "treated_by_professionals")}</div>
        <div class="rq-q-label"><b>פרט:</b></div>
        ${multiline(ctx, "professionals_details")}
      </td></tr>
      ${qRow(
        "תיאור כללי של הילד תוך התייחסות למצבו הלימודי, החברתי והרגשי",
        multiline(ctx, "student_description"),
        { tall: true, note: "(חשוב לציין מה היה מצבו בתחומים אלו כשהגיע למסגרת הנוכחית):" }
      )}
      ${qRow(
        "יכולות וכישורים בתחומים שונים",
        multiline(ctx, "abilities_skills"),
        { note: "(ספורט, אמנות, טכנולוגיה, שירה, אחר):" }
      )}
      ${qRow("רמת המוטיבציה של התלמיד בתחום הלימודי ובתחום החברתי:", multiline(ctx, "motivation_level"))}
      ${qRow(
        "סוגי התמיכה שקיבל התלמיד בתחומים שונים בבית הספר ומחוצה לו והשפעתם",
        multiline(ctx, "support_types_received"),
        { tall: true, note: "(תמיכה מסוג הוראה לרבות שעות שילוב, תמיכה ממקצועות הבריאות, חונכות, שיחות ייעוץ וכו'):" }
      )}
    </tbody>
  </table>`;
}

/** תחום עם תווית צד (כמו במקור: "התחום הלימודי" לצד השאלות) */
function domainBlock(
  sideLabel: string,
  rows: Array<{ question: string; note?: string; valueHtml: string; tall?: boolean }>
): string {
  const body = rows
    .map(
      (row) => `<div class="rq-domain-q${row.tall ? " rq-q-tall" : ""}">
        <div class="rq-q-label"><b>${escapeHtml(row.question)}</b>${row.note ? ` <span class="rq-q-note">${escapeHtml(row.note)}</span>` : ""}</div>
        ${row.valueHtml}
      </div>`
    )
    .join("");
  return `<table class="rq-box-table rq-domain">
    <tbody><tr>
      <th class="rq-domain-side">${escapeHtml(sideLabel)}</th>
      <td class="rq-domain-body">${body}</td>
    </tr></tbody>
  </table>`;
}

function domainsHtml(ctx: Ctx): string {
  return [
    domainBlock("התחום הלימודי", [
      {
        question: "תאר את תפקוד התלמיד במיומנויות הלימוד השונות",
        note: "(קריאה והבנת הקריאה, הבעה בעל פה, כתיבה, מתמטיקה):",
        valueHtml: multiline(ctx, "academic_skills"),
        tall: true,
      },
      {
        question: "מהי צורת הלימוד היעילה ביותר עבורו",
        note: "(עבודה פרטנית, קבוצתית, פרונטלית, עבודה בעזרת אמצעי המחשה, משחק, מחשב וכו'):",
        valueHtml: multiline(ctx, "effective_learning_style"),
      },
    ]),
    domainBlock("התחום החברתי", [
      {
        question: "תאר את תפקוד התלמיד בתחום החברתי",
        note: "(יצירת קשרים חברתיים, התמדה בקשרים חברתיים, מעורבות חברתית):",
        valueHtml: multiline(ctx, "domain_social"),
        tall: true,
      },
      {
        question: "תאר את תרבות הפנאי של התלמיד אחר הצהריים",
        note: "(בקבוצות חברים, בתנועת נוער, בחוגים וכו'):",
        valueHtml: multiline(ctx, "leisure_culture"),
      },
    ]),
    domainBlock("התחום ההתנהגותי-רגשי", [
      {
        question: "תאר את תפקוד התלמיד בתחום ההתנהגותי–הרגשי",
        note: "(בכיתה, בזמן הפסקה, בפעילות הבית-ספרית):",
        valueHtml: multiline(ctx, "domain_behavioral_emotional"),
        tall: true,
      },
    ]),
    domainBlock("הקשר של המשפחה עם בית-הספר", [
      {
        question: "תדירות הקשר, אופי הקשר ויוזם הקשר",
        note: "(האב, האם, בני משפחה אחרים?):",
        valueHtml: multiline(ctx, "family_school_contact"),
      },
      {
        question: "האם חל שינוי עקב פעולות התערבות? תאר את הפעולות ואת השינוי.",
        valueHtml: multiline(ctx, "intervention_change"),
        tall: true,
      },
    ]),
    domainBlock("הערות כלליות/ סיכום והמלצות", [
      {
        question: "",
        valueHtml: multiline(ctx, "summary_recommendations"),
        tall: true,
      },
    ]),
  ].join("");
}

function signRow(
  ctx: Ctx,
  nameLabel: string,
  nameKey: string,
  signatureKey: string,
  dateKey: string
): string {
  return `<div class="rq-sign-row">
    ${lineField(nameLabel, val(ctx, nameKey), "rq-line-name")}
    ${lineField("חתימה:", signatureValue(ctx, signatureKey), "rq-line-sig")}
    ${lineField("תאריך:", ltrVal(ctx, dateKey), "rq-line-date")}
  </div>`;
}

function signaturesHtml(ctx: Ctx): string {
  return `<section class="rq-signatures">
    ${signRow(ctx, "שם מנהל/ת בית-הספר:", "principal_name", "principal_signature", "principal_date")}
    ${signRow(ctx, "שם המחנך/ת:", "homeroom_sign_name", "homeroom_signature", "signer_date")}
    ${signRow(ctx, "שם המפקח/ת:", "supervisor_name", "supervisor_signature", "supervisor_date")}
    <p class="rq-parents-title"><b>חתימת ההורים לגבי הפניית התלמיד לוועדה*</b></p>
    ${signRow(ctx, "שם ההורה:", "parent1_sign_name", "parent1_signature", "parent1_sign_date")}
    ${signRow(ctx, "שם ההורה:", "parent2_sign_name", "parent2_signature", "parent2_sign_date")}
    <div class="rq-sign-row">
      ${lineField("העתק השאלון נמסר לידי ההורים בתאריך:", ltrVal(ctx, "parents_copy_date"), "rq-line-date")}
      ${lineField("ע\"י:", val(ctx, "parents_copy_by"), "rq-line-name")}
    </div>
    <p class="rq-footnote">* חתימת ההורים על שאלון זה, אין פירושה הסכמתם על הכתוב בשאלון, אלא פירושה שהובא לידיעתם כי ילדם מופנה לוועדת זכאות ואפיון.</p>
  </section>`;
}

/**
 * גוף המסמך (בלי <html>/<style> — אלה מגיעים מ-buildFormSnapshotHtml).
 * `moeLogoSrc` — סמל המדינה/משרד החינוך.
 */
export function buildReferralQuestionnaireBodyHtml(
  schema: FormSchema,
  data: Record<string, string>,
  moeLogoSrc: string
): string {
  const ctx = createCtx(schema, data);

  return `<div class="rq rq-referral">
    <header class="rq-header">
      <img class="rq-emblem logo-moe" src="${escapeHtml(moeLogoSrc)}" alt="סמל משרד החינוך" decoding="sync" />
      <p class="rq-ministry"><b>משרד החינוך</b><br />המינהל הפדגוגי<br />אגף א' חינוך מיוחד</p>
      <h1 class="rq-title rq-title-red">שאלון הפניה לוועדת זכאות ואפיון של תלמיד הלומד בבית-ספר (רגיל /מיוחד)</h1>
    </header>
    <p class="rq-intro">הדיון בוועדת זכאות ואפיון הוא צומת משמעותי ומכריע בקבלת החלטות הנוגעות להמשך דרכו החינוכית של התלמיד. יש להקפיד למלא את כל פרטי השאלון כדי שבידי הוועדה יעמדו כל הנתונים והמידע הדרושים לקבלת החלטה מיטבית, הוגנת ומקצועית בעניינו של התלמיד.</p>
    <div class="rq-sign-row rq-referral-line">
      ${lineField("הגורם המפנה:", val(ctx, "referral_source"), "rq-line-name")}
      ${lineField("תאריך ההפניה:", ltrVal(ctx, "referral_date"), "rq-line-date")}
    </div>

    <h2 class="rq-h2 rq-h2-underline">הרקע</h2>
    <p class="rq-table-title"><b><u>פרטי התלמיד/ה</u></b> (יש למלא את הפרטים ולסמן X במשבצות המתאימות)</p>
    ${studentTable(ctx)}
    ${parentsTable(ctx)}
    ${institutionTable(ctx)}
    ${teacherTable(ctx)}
    ${backgroundBox(ctx)}
    ${domainsHtml(ctx)}
    ${signaturesHtml(ctx)}
  </div>`;
}

/** CSS ייעודי לשאלון ההפניה (מעל ORIGINAL_LOOK_BASE_CSS) */
export const REFERRAL_QUESTIONNAIRE_PRINT_CSS = `
    /* ---- שאלון הפניה ---- */
    .rq-referral .rq-title { margin: 0; }
    .rq-table-title {
      margin: 0 0 1.5mm;
      font-size: 11pt;
    }
    .rq-referral-line { margin: 0 0 2mm; }
    .rq .rq-opt { width: 9mm; }
    .rq .rq-parent-name { text-align: right; }
    .rq table.rq-teacher { width: 70%; margin-right: 0; margin-left: auto; }
    .rq table.rq-teacher th { text-align: right; width: 28% !important; }
    .rq table.rq-teacher td { text-align: right; }

    /* תיבות שאלות פתוחות */
    .rq table.rq-box-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 3mm;
      page-break-inside: auto;
      break-inside: auto;
    }
    .rq table.rq-box-table > tbody > tr > td,
    .rq table.rq-box-table > tbody > tr > th {
      border: 1px solid #000;
      padding: 1.5mm 2mm;
      text-align: right;
      vertical-align: top;
      font-size: 10.5pt;
      width: auto !important;
      color: #000 !important;
    }
    .rq tr.rq-q { page-break-inside: avoid; break-inside: avoid; }
    .rq tr.rq-q > td { min-height: 9mm; }
    .rq tr.rq-q-tall > td, .rq .rq-domain-q.rq-q-tall { min-height: 22mm; }
    .rq .rq-q-label { margin: 0 0 1mm; }
    .rq .rq-q-note { font-weight: 400; }
    .rq .rq-inline { display: flex; flex-wrap: wrap; gap: 2mm 6mm; align-items: baseline; }
    .rq table.rq-split { width: 100%; border-collapse: collapse; margin: 0; }
    .rq table.rq-split td { border: none; padding: 0; vertical-align: top; }
    .rq .rq-split-main { width: 62%; padding-left: 3mm !important; border-left: 1px solid #000 !important; }
    .rq .rq-split-side { width: 38%; padding-right: 3mm !important; }

    /* תחומים עם תווית צד */
    .rq .rq-domain-side {
      width: 24mm !important;
      text-align: center !important;
      vertical-align: middle !important;
      font-weight: 700;
      font-size: 10.5pt;
      line-height: 1.3;
    }
    .rq .rq-domain-body { padding: 0 !important; }
    .rq .rq-domain-q {
      padding: 1.5mm 2mm;
      border-bottom: 1px solid #000;
      min-height: 12mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .rq .rq-domain-q:last-child { border-bottom: none; }
    .rq-parents-title { margin: 2mm 0 2mm; font-size: 11pt; }
`;
