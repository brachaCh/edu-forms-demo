/**
 * Shared print layout rules used by:
 *   - individual form snapshots (`buildFormSnapshotHtml`)
 *   - the student-file / folder print window (`student-document-print`)
 *
 * TZ-81: tables that overflowed (`.data-grid` / `.homeroom-grid`) fit the
 *        printable width (RTL), wrap user text instead of overflowing,
 *        and are not clipped by overflow:hidden on html/body.
 * TZ-83: boxes/cards/sections/table rows stay together across page breaks
 *        when they fit; boxes taller than a page still print (browsers
 *        ignore break-inside:avoid rather than clipping).
 *
 * Schedule grids keep their own TZ-16 / TZ-3 rules (one landscape page).
 * Do not apply table-layout/pre-wrap to `.page-sheet` or generic `td` —
 * original-look MOE / TL"K / תל"א tables keep the layout they have on main.
 * Generic tables stay splittable (same print block as main).
 *
 * TZ-86: two-column date+summary grids (שיחות עם הורים) follow the Word
 *        original — narrow date (~16%), wide summary (~84%). Shared print
 *        polish (heading colour, data-grid header fill) is print-only.
 */
export const SHARED_PRINT_LAYOUT_CSS = `
    /* TZ-81 — do not clip tables at the page edge */
    html, body {
      overflow: visible !important;
      overflow-x: visible !important;
    }
    .print-doc,
    .print-doc-body,
    .print-doc-body .page,
    .print-doc-body .page-sheet,
    .doc-body {
      max-width: 100% !important;
      overflow: visible !important;
    }
    /*
     * Fixed layout only on the app grids that were cut at the page edge.
     * Original-look Ministry / TL"K / תל"א tables keep auto (or their own) layout.
     */
    .data-grid,
    .homeroom-grid {
      max-width: 100% !important;
      width: 100% !important;
      table-layout: fixed !important;
    }
    .data-grid th,
    .homeroom-grid th {
      min-width: 0;
      overflow-wrap: anywhere;
      word-wrap: break-word;
      word-break: break-word;
    }
    /* User-text value cells only — not headers/labels, not original-look tables */
    .data-grid td,
    .homeroom-grid td {
      min-width: 0;
      overflow-wrap: anywhere;
      word-wrap: break-word;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .data-grid .data-grid-col-wide {
      width: 22%;
    }

    /* טבלאות ארוכות — אפשרות פיצול בין עמודים במקום חיתוך */
    table,
    .homeroom-grid,
    .holistic-grid,
    .cluster-card,
    .schedule-grid,
    .data-grid {
      page-break-inside: auto;
      break-inside: auto;
    }

    /*
     * TZ-83 — keep printed boxes/cards/rows together when they fit a page.
     * A box taller than one page is still printed: Chromium/WebKit ignore
     * avoid in that case instead of dropping content. Do not apply avoid to
     * large containers (whole documents / whole grids / page-sheet rows) —
     * that creates empty pages. Avoid wins over the splittable block above
     * for cards/rows (same specificity, later rule).
     */
    .holistic-cell,
    .cluster-card,
    .sign-row,
    .rq-parent-block,
    .rq-signatures,
    .rq-discussion,
    h2,
    .data-grid tr,
    .homeroom-grid tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Long tables and the holistic/cluster grids may split; their cells/rows do not.
       Schedule grids keep TZ-16 (one landscape page) and are excluded.
       Original-look tables keep their own page-break rules. */
    .data-grid,
    .homeroom-grid,
    .holistic-grid,
    .clusters-grid {
      break-inside: auto;
      page-break-inside: auto;
    }

    /*
     * TZ-86 — Word-inspired print polish, scoped to generic form print.
     * Original-look Ministry / schedule grids are not selected here.
     */
    .doc-body > h1,
    .print-doc-title {
      color: #084e76;
    }
    .data-grid th {
      background: #faf8f4;
      color: #084e76;
    }

    /*
     * TZ-86 — parent conversations / correspondence / expert guidance.
     * The Word original uses ~16% date and ~84% summary (7609/1405 twips).
     * Overrides .data-grid-col-wide { width: 22% } which squeezed the summary
     * on two-column tables and left the date column taking most of the page.
     * Blank rows stay (the paper form is a handwriting pad) at a compact line
     * height so they do not fill the rest of the page.
     */
    .data-grid.data-grid-date-summary {
      font-size: 10pt;
    }
    .data-grid.data-grid-date-summary .data-grid-col-date {
      width: 16% !important;
      white-space: nowrap !important;
      overflow-wrap: normal;
      word-break: keep-all;
      text-align: center;
    }
    .data-grid.data-grid-date-summary .data-grid-col-wide {
      width: 84% !important;
    }
    .data-grid.data-grid-date-summary td {
      min-height: 11mm;
      height: auto;
      vertical-align: top;
    }
    .data-grid.data-grid-date-summary tr.data-grid-row-empty td {
      height: 11mm;
      min-height: 11mm;
    }

    /*
     * TZ-90 — ישיבות צוות (date + participants + summary).
     * The generic .data-grid-col-wide { width: 22% } left the date column
     * taking the leftover ~56% and squeezed the two text columns.
     */
    .data-grid.data-grid-date-notes {
      font-size: 10pt;
    }
    .data-grid.data-grid-date-notes .data-grid-col-date {
      width: 16% !important;
      white-space: nowrap !important;
      overflow-wrap: normal;
      word-break: keep-all;
      text-align: center;
    }
    .data-grid.data-grid-date-notes .data-grid-col-participants {
      width: 30% !important;
    }
    .data-grid.data-grid-date-notes .data-grid-col-summary {
      width: 54% !important;
    }
    .data-grid.data-grid-date-notes .data-grid-col-wide {
      width: auto;
    }
    .data-grid.data-grid-date-notes td {
      vertical-align: top;
    }

    /*
     * TZ-103 — schedule / new-design wrapper only. Do not restyle h1/h2
     * inside Ministry forms, appendix 6.11, or Word HTML.
     */
    .print-doc-title {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #2f3b67;
      letter-spacing: 0.01em;
    }
    .print-doc-schedule .print-doc-body h1 {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #2f3b67;
      letter-spacing: 0.01em;
    }
    .print-doc-schedule .print-doc-body h2 {
      color: #084e76;
      font-size: 12pt;
      margin: 3mm 0 2mm;
      padding-bottom: 1mm;
      border-bottom: 0.6pt solid #d7dde5;
    }
    .print-cover-kind,
    .print-cover-folder-name {
      letter-spacing: 0.02em;
    }
    .print-doc-note {
      font-size: 10pt;
      color: #64748b;
    }

    /* TZ-103 — personal-basket weekly schedule in a multi-document file */
    @page schedule-landscape {
      size: A4 landscape;
      margin: 10mm;
    }
    .print-doc.print-doc-schedule {
      page: schedule-landscape;
    }
    .print-doc-schedule .schedule-grid {
      font-size: 8pt !important;
      table-layout: fixed !important;
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 1mm 0 2mm !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .print-doc-schedule .schedule-grid th,
    .print-doc-schedule .schedule-grid td {
      padding: 0.7mm 0.6mm !important;
      line-height: 1.15 !important;
      font-size: 8pt !important;
      text-align: center !important;
      vertical-align: top !important;
      border: 0.4pt solid #334155 !important;
      overflow-wrap: anywhere !important;
    }
    .print-doc-schedule .schedule-grid thead th {
      background: #eef3f8 !important;
      color: #2f3b67 !important;
      font-weight: 700 !important;
      font-size: 7.5pt !important;
    }
    .print-doc-schedule .schedule-grid .period {
      width: 6mm !important;
      font-weight: 700 !important;
      background: #f5f7fa !important;
    }
    .print-doc-schedule .sched-cell-empty {
      background: #fafbfc !important;
    }
    .print-doc-schedule .sched-subject {
      min-height: 0 !important;
      margin: 0 !important;
      line-height: 1.15 !important;
      font-size: 8pt !important;
    }
    .print-doc-schedule .sched-flags {
      font-size: 6.5pt !important;
      border-top: 0.4pt solid #cbd5e1 !important;
      padding-top: 0.3mm !important;
      margin-top: 0.3mm !important;
      display: flex !important;
      justify-content: center !important;
      gap: 1mm !important;
    }
    .print-doc-schedule .sched-flag {
      display: inline-block;
      font-weight: 700;
      color: #2f3b67;
    }
    .print-doc-schedule .print-schedule-instructions {
      font-size: 7.5pt;
      line-height: 1.25;
      margin: 0 0 2mm;
      color: #475569;
    }
`;
