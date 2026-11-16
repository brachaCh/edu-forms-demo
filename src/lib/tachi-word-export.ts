/** תח״י — הורדה כ-Word בלי לוגואים, בפריסה קרובה לתבנית */

export const TACHI_WORD_EXPORT_FORM_IDS = new Set([
  "tachi",
  "tachi-integrative",
]);

export function isTachiWordExportFormId(formId: string): boolean {
  return TACHI_WORD_EXPORT_FORM_IDS.has(formId);
}

const WORD_TACHI_LAYOUT_CSS = `
    body {
      direction: rtl;
      unicode-bidi: embed;
      font-family: Arial, "Assistant", sans-serif;
    }
    .page-frame { display: none !important; }
    table.page-sheet {
      display: block;
      width: 100%;
      border: none;
      padding: 0;
      margin: 0;
    }
    .page-sheet > thead,
    .page-sheet > tbody,
    .page-sheet > tfoot,
    .page-sheet > tbody > tr,
    .page-sheet > thead > tr,
    .page-sheet > tfoot > tr,
    .page-sheet > tbody > tr > td,
    .page-sheet > thead > tr > td,
    .page-sheet > tfoot > tr > td {
      display: block;
      width: 100%;
      border: none;
      padding: 0;
      margin: 0;
    }
    .doc-header-space,
    .doc-footer-space,
    .doc-header-fixed,
    .doc-footer {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .doc-header-screen:empty { display: none !important; }
    .sign-row {
      display: table;
      width: 100%;
      border-collapse: collapse;
    }
    .sign-line {
      display: table-cell;
      vertical-align: bottom;
      width: 33%;
    }
    .data-grid {
      display: table;
      width: 100%;
      border-collapse: collapse;
      direction: rtl;
      table-layout: fixed;
    }
    .data-grid tr {
      display: table-row;
    }
    .data-grid th,
    .data-grid td {
      display: table-cell;
      border: 1pt solid #333333;
      padding: 4pt;
      text-align: right;
      vertical-align: top;
    }
    .integrative-goals th {
      text-align: center;
    }
    .clusters-grid {
      display: table;
      width: 100%;
      border-collapse: collapse;
    }
    .cluster-card {
      display: table-row;
    }
    .cluster-label,
    .cluster-value {
      display: table-cell;
      border: 1pt solid #333333;
      padding: 4pt;
      vertical-align: top;
    }
`;

const MSO_HEAD_PREFIX = `<!--[if gte mso 9]><xml>
<w:WordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml><![endif]-->`;

/** CSS ו-Meta לפתיחה ב-Word — לא משנה את תוכן השדות */
export function optimizeTachiSnapshotHtmlForWord(html: string): string {
  let next = html;
  if (/<\/head>/i.test(next)) {
    next = next.replace(
      /<\/head>/i,
      `<style type="text/css">${WORD_TACHI_LAYOUT_CSS}\n  </style>\n${MSO_HEAD_PREFIX}\n</head>`
    );
  }
  return next;
}