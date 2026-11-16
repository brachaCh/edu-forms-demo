# עיצוב: ניתוב חתימות — SimpleSign מול מתוה

תאריך: 2026-09-17

## מטרה

רק רשימת מסמכים סגורה נשלחת לחתימה ב-SimpleSign — **כל** החתימות שלהם (הורים וצוות) שם, וה-PDF החתום נשמר בתיקיית התלמיד. כל שאר המסמכים, כולל תח״י, תח״י אינטגרטיבי והכלה, נחתמים בתוך מתוה: צוות חותם במערכת, הורה/חותם חיצוני מקבל קישור מייל עם OTP, והמסמך המלא נשמר במערכת.

## כלל הזהב

| ערוץ | מי חותם שם | מה נשמר במתוה |
|---|---|---|
| SimpleSign (רשימה סגורה) | כל החתימות של המסמך — הורים וצוות; לכל חותם קישור אישי מ-SimpleSign | מילוי הטופס + PDF חתום מ-SimpleSign בתיקייה |
| מתוה (כל השאר) | צוות יכול לחתום בטופס **או** לקבל קישור מייל+OTP; הורים/חיצוניים בקישור+OTP | מילוי הטופס + צילום מלא של המסמך החתום בתיקייה |

אין מצב מעורב: לא חתימת צוות במתוה ואחר כך הורים ב-SimpleSign לאותו מסמך.

## רשימת SimpleSign (allowlist)

| מסמך | `form_id` | חתימות שחייבות להיות ב-SimpleSign |
|---|---|---|
| ויתור סודיות | `waiver-confidentiality` | `father_signature`, `mother_signature` |
| ויתור סודיות לצוות רב מקצועי | `waiver-multidisciplinary-team` | `parent1_signature`, `parent2_signature` |
| ויתור סודיות לוועדת השגה | `waiver-appeal-committee` | `parent1_signature`, `parent2_signature` |
| ויתור סודיות לוועדת זכאות ואפיון | `waiver-eligibility-characterization` | `parent1_signature`, `parent2_signature` |
| נספח 8 | `moe-psychologist-recommendation` | `psychologist_sign`, `supervisor_sign` |
| מיצוי אפשרויות | `moe-exhaust-options` | `principal_sign`, `inspector_sign` |
| שאלון הפניה לצוות רב מקצועי | `referral-questionnaire-multidisciplinary` | `homeroom_signature`, `principal_signature`, `supervisor_signature`, `parent_signature` |
| שאלון הפניה לוועדת זכאות ואפיון (גן) | `referral-questionnaire-kindergarten` | `signer_signature`, `parent1_signature`, `parent2_signature` |
| שאלון הפניה לוועדת זכאות ואפיון (בית ספר) | `referral-questionnaire` | `homeroom_signature`, `parent1_signature`, `parent2_signature` |
| המלצת פסיכולוג לשינוי קוד אפיון | `moe-psychologist-code-change` | `psychologist_sign`, `supervisor_sign` |
| אישור הורים לקיום ועדה ללא נוכחות | `moe-parent-approval-committee-no-presence` | `principal_sign`, `parent1_sign`, `parent2_sign` |

מחוץ לרשימה, כולל `tachi`, `tachi-integrative` ו-`moe-inclusion-plan`: חתימה במתוה בלבד.

## פעולות ידניות ב-SimpleSign (לפני/במקביל לקוד)

אלה מסמכים שדורשים **גם הורים וגם צוות**, וחתימות הצוות **לא** מוגדרות כחותמים ב-SimpleSign במערכת (חלקן נחתמות היום במתוה לפני השליחה). צריך לסמן בתבנית «הוספת חותם נוסף» לכל חותם צוות, עם המפתח ממתוה:

1. **שאלון הפניה (בית ספר)** — חסר: `homeroom_signature` (מחנך/ת). היום נדרש לחתום במתוה לפני «שלח ל-SimpleSign».
2. **שאלון הפניה לצוות רב מקצועי** — חסרים: `homeroom_signature`, `principal_signature`, `supervisor_signature`. היום רק `parent_signature` נשלח ל-SimpleSign.
3. **שאלון הפניה (גן)** — לא מחובר בכלל ב-`config.ts` (יש משתנה `SIMPLESIGN_DOC_REFERRAL_KG`). צריך: `signer_signature` (גננת) + שני הורים.
4. **אישור הורים ללא נוכחות** — חסר כחותם ב-API: `principal_sign`. במדריך המיפוי הוא מסומן, אבל הקוד דורש חתימה במתוה לפני השליחה.

מסמכי צוות-בלבד שכבר ממופים (מיצוי, נספח 8, המלצת פסיכולוג) ומסמכי הורים-בלבד (ארבעת הוויתורים) לא דורשים תיקון סימון צוות.

## ארכיטקטורה

```
SIMPLESIGN_FORM_CONFIGS          allowlist + signers[] (הורים וצוות)
        │
        ├─ formMayUseSimpleSign  → כפתור «שלח לחתימה ב-SimpleSign»
        ├─ כל שדה חתימה ב-signers נשלח ל-SimpleSign (לא requiredStaff במתוה)
        └─ webhook / sync        → סימון שדות + PDF ב-student_documents

שאר טפסי חתימה
        │
        ├─ צוות: GreenSignatureField בטופס (לא readOnly) וגם קישור מייל+OTP
        ├─ כל החותמים: «שלח לחתימה» → רשימת חותמים + מיילים לעריכה/הוספה
        └─ אחרי החתימה האחרונה: שמירת צילום מלא ב-student_documents
```

`requiredStaffSignatureKeys` מתרוקן לכל טפסי ה-allowlist. חתימת צוות במסמך SimpleSign היא חותם ב-SimpleSign, לא שער במתוה.

`parentSigners` נשאר שם השדה הקיים (שינוי שם גורף מיותר), אבל משמש לכל החותמים — כולל צוות. בתיעוד וב-UI מדברים על «חותמים», לא רק «הורים».

## דיאלוג «שליחה לחתימה» (שני הערוצים)

בלחיצה על השליחה נפתח דיאלוג עם **שורה לכל חותם** (שם/תפקיד החתימה + כתובת מייל):

- המיילים ניתנים לעריכה.
- אפשר להוסיף כתובת נוספת לאותו חותם (אותו שדה חתימה, מייל אחר).
- שורות החותמים הנדרשים לא נמחקות; שורות נוספות כן.
- Prefill: מיילי הורים מ-`student.email` (פיצול אב/אם); מייל צוות ממחנכת/רשימת צוות כשיש התאמה; אחרת ריק לעריכה ידנית.
- שליחה נחסמת עד שיש מייל תקין לכל חותם נדרש.

היום דיאלוג SimpleSign מוסתר מבחירת שדה (`hideFieldSelect`) ולכן **אי אפשר להוסיף מייל**, ומציג רק חותמים שכבר ב-`parentSigners` (בלי צוות בטפסי הפניה). זה יתוקן.

### SimpleSign

1. צוות ממלא את הטופס במתוה (שדות חתימה של SimpleSign לקריאה בלבד בטופס).
2. «שלח לחתימה ב-SimpleSign» מציג את כל החותמים מה-allowlist.
3. API יוצר submission אחד רב-חותמים: **מייל ראשון לכל שדה** הולך ל-SimpleSign כחותם (קישור אישי לכל slot). כתובות נוספות לאותו שדה מקבלות את **אותו** קישור החתימה במייל ממתוה.
4. אי אפשר לשלוח בלי כיסוי של כל ה-slots. אי אפשר לשלוח שדה שלא מוגדר כחותם בתבנית.
5. Webhook `signer_signed` מסמן את שדה החתימה במתוה; `signed` מוריד PDF אחד לתיקייה (`signedPdfFolder`).

### מתוה

1. איש צוות מחובר יכול לחתום ישירות בשדה החתימה.
2. «שלח לחתימה» מציג את **כל** שדות החתימה בטופס — כולל צוות — עם מייל לעריכה/הוספה. לכל שורה נוצר קישור `form-signature` אישי + OTP.
3. פתיחת הקישור דורשת OTP למייל הנמען (אותו דפוס כמו `/fill`), גם לצוות.
4. אחרי שכל שדות החתימה מלאים: נשמר מסמך מלא בתיקיית התלמיד (HTML snapshot כקובץ, באותו מנגנון `student_documents`).

## מחוץ להיקף

- אין יצירה/עריכה אוטומטית של תבניות בתוך SimpleSign.
- אין מחולל PDF שרתי חדש (אין puppeteer בפרויקט). שמירה מלאה במתוה = נתוני `student_form_fills` + צילום HTML מלא ב-`student_documents`. PDF מ-SimpleSign נשאר כפי שהוא (הורדה מה-API).
- אין שינוי בזרימת הכניסה החופשית לוויתור סודיות מעבר להשארתה על הערוץ הפנימי/קיים.
- תל״א, התאמות, שאלוני הורים, הערכה מעצבת, הכלה — נשארים במתוה בלי שינוי allowlist.

## בדיקות הצלחה

- `formMayUseSimpleSign("tachi") === false` ואותו דבר ל-`tachi-integrative` ול-`moe-inclusion-plan`.
- `formMayUseSimpleSign("referral-questionnaire-kindergarten") === true`.
- לכל טופס ב-allowlist: כל שדה `type: signature` מופיע ב-`parentSigners`, ו-`requiredStaffSignatureKeys` ריק.
- בטפסי מתוה: כפתור «שלח לחתימה» מציג גם שדות צוות; אפשר לשלוח להם קישור, ואפשר גם לחתום בטופס.
- דיאלוג SimpleSign מציג שורה לכל חותם (לא רק הורים); מיילים ניתנים לעריכה ולהוספה; לכל חותם נדרש נוצר קישור SimpleSign אישי.
- דף חתימה ציבורי בלי OTP נכשל; אחרי OTP אפשר לחתום.
- Webhook SimpleSign ממשיך לשמור PDF; חתימה פנימית אחרונה שומרת צילום בתיקייה.
