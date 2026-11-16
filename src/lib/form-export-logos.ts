/**
 * כותרות לוגו מוסד בטפסים שנשמרו כ-HTML — לפני הורדה כ-Word או ייצוא מחדש.
 * מסיר לוגו «קבוע» מארכיון ישן ומחיל רק לוגואים ממוסד נוכחי.
 */

import type { DocumentBrandLogos } from "@/lib/document-branding";
import {
  buildPrintFixedHeaderHtml,
  buildStandardDocHeaderHtml,
} from "@/lib/form-snapshot";
import {
  isTachiWordExportFormId,
  optimizeTachiSnapshotHtmlForWord,
} from "@/lib/tachi-word-export";

const INSTITUTION_LOGO_IMG =
  /<img\b[^>]*\bclass="[^"]*\blogo-(?:school|association|protocol|moe)\b[^"]*"[^>]*>/gi;
const INSTITUTION_LOGO_SLOT =
  /<div\b[^>]*\bclass="[^"]*\blogo-(?:school|association|protocol|moe)\b[^"]*\blogo-slot\b[^"]*"[^>]*\s*\/?>/gi;

export type FormWordExportOptions = {
  formId?: string;
};
function stripMoeOfficialSide(html: string): string {
  const openRe = /<div class="moe-official-side">/gi;
  let result = html;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(result)) !== null) {
    const start = match.index;
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = start;
    let depth = 0;
    let end = -1;
    while (true) {
      const tag = tagRe.exec(result);
      if (!tag) break;
      const raw = tag[0].toLowerCase();
      if (raw.startsWith("</div")) {
        depth -= 1;
        if (depth === 0) {
          end = tagRe.lastIndex;
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (end > start) {
      result = result.slice(0, start) + result.slice(end);
      openRe.lastIndex = start;
    }
  }
  return result;
}

function stripSnapshotProtocolFooter(html: string): string {
  let next = html.replace(
    /<footer class="doc-footer">[\s\S]*?<\/footer>/gi,
    ""
  );
  next = next.replace(INSTITUTION_LOGO_IMG, "");
  next = next.replace(INSTITUTION_LOGO_SLOT, "");
  return next;
}

/** מסיר תמונות/משבצות לוגו בי״ס, עמותה ופרוטוקול מעותק HTML שמור (למשל לפני המרה ל-Word). */
export function stripSnapshotInstitutionHeaderLogos(html: string): string {
  let next = html.replace(INSTITUTION_LOGO_IMG, "").replace(INSTITUTION_LOGO_SLOT, "");
  next = next.replace(/<header class="doc-header-fixed"[\s\S]*?<\/header>/gi, "");
  next = next.replace(/<header class="doc-header">\s*<\/header>/gi, "");
  next = next.replace(/<header class="doc-header">[\s\S]*?<\/header>/gi, "");
  next = next.replace(/<header class="moe-official-header">[\s\S]*?<\/header>/gi, "");
  next = stripMoeOfficialSide(next);
  next = stripSnapshotProtocolFooter(next);
  return next;
}

function insertFixedHeader(html: string, fixedHeader: string): string {
  if (!fixedHeader) return html;
  if (/<header class="doc-header-fixed"/i.test(html)) {
    return html.replace(
      /<header class="doc-header-fixed"[\s\S]*?<\/header>/i,
      fixedHeader
    );
  }
  if (/<footer class="doc-footer"/i.test(html)) {
    return html.replace(/<footer class="doc-footer"/i, `${fixedHeader}<footer class="doc-footer"`);
  }
  if (/<\/div>\s*<\/body>/i.test(html)) {
    return html.replace(/<\/div>\s*<\/body>/i, `${fixedHeader}</div></body>`);
  }
  return `${html}${fixedHeader}`;
}

/**
 * מחליף לוגואי מוסד ב-HTML שמור — רק לפי לוגואים שהמוסד שמר; אחרת בלי לוגו.
 * שימושי כשפותחים ארכיון ישן כ-Word (תח״י וכו׳).
 */
export function applyInstitutionLogosToSnapshotHtml(
  html: string,
  logos: DocumentBrandLogos = {}
): string {
  const schoolSrc = logos.schoolLogoUrl?.trim() || null;
  const associationSrc = logos.associationLogoUrl?.trim() || null;

  let next = stripSnapshotInstitutionHeaderLogos(html);

  if (!schoolSrc && !associationSrc) {
    return next;
  }

  const header = buildStandardDocHeaderHtml(schoolSrc, associationSrc);
  const fixedHeader = buildPrintFixedHeaderHtml(schoolSrc, associationSrc);

  if (/<header class="doc-header">/i.test(next)) {
    next = next.replace(/<header class="doc-header">[\s\S]*?<\/header>/i, header);
  } else if (/<div class="doc-header-screen">/i.test(next)) {
    next = next.replace(
      /<div class="doc-header-screen">/i,
      `<div class="doc-header-screen">${header}`
    );
  } else if (/<thead[^>]*>\s*<tr[^>]*>\s*<td[^>]*>/i.test(next)) {
    next = next.replace(
      /(<thead[^>]*>\s*<tr[^>]*>\s*<td[^>]*>)/i,
      `$1${header}`
    );
  } else if (header) {
    next = `${header}${next}`;
  }

  return insertFixedHeader(next, fixedHeader);
}

/** מוכן ל-blob Word — תח״י: בלי לוגואים + פריסת Word; אחרת לוגו מוסד נוכחי בלבד */
export function prepareFormSnapshotHtmlForWordExport(
  html: string,
  logos: DocumentBrandLogos = {},
  options: FormWordExportOptions = {}
): string {
  const formId = options.formId ?? "";
  if (isTachiWordExportFormId(formId)) {
    let next = stripSnapshotInstitutionHeaderLogos(html);
    next = next.replace(INSTITUTION_LOGO_IMG, "");
    return optimizeTachiSnapshotHtmlForWord(next);
  }
  return applyInstitutionLogosToSnapshotHtml(html, logos);
}