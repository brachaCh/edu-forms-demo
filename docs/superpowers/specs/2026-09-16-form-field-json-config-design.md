# עיצוב: קטלוג שדות ב-JSON ונעילת מפתחות SimpleSign

תאריך: 2026-09-16

## מטרה

להוציא את הגדרות השדות של טפסי מתוה מקוד TypeScript לקבצי JSON, כדי שאפשר יהיה לנהל אותן בלי לגעת בלוגיקה. במקביל לנעול את מפתחות השדות (`key`) שמחוברים ל-SimpleSign, כך ששינוי שם לא יעבור בלי עדכון מודע של התבנית ב-SimpleSign.

## מחוץ להיקף

- אין בדיקת התאמה בזמן «שלח ל-SimpleSign». לקוחות לא יחכו לרשת של SimpleSign בשליחה.
- אין מסך ניהול / עריכה במסד נתונים בשלב זה. מקור האמת הוא קבצי JSON בריפו.
- אין יצירה או עדכון אוטומטי של תבניות בתוך SimpleSign (העריכה שם נשארת ידנית).
- הגדרות חותמים (`parentSigners`, `defaultSignerName`, טוקן מסמך) נשארות ב-`src/lib/simplesign/config.ts`.
- קטלוגי טבלאות, מערכת שעות ומחוון מחנכת נשארים בקוד (`form-table-grids.ts`, `homeroom-report-grid.ts` וכו'). ב-JSON מופיעה רק הפניה לסוג.
- כינויי תיקיות, הקלטת קול וקישורי תיק נשארים ב-`form-schemas.ts`.

## ארכיטקטורה

```
src/content/forms/{form-id}.json  →  טוען + zod  →  FormSchema
                                         ↓
                         טסט נעילה (בלי רשת)
                                         ↓
                    simplesign:check ב-CI (רשת ל-simplesign.co.il)
```

`getFormSchema` / `listFormFields` / `FORM_SCHEMAS` נשארים ה-API הציבורי. הרכיבים הקיימים לא צריכים לדעת שהמקור הוא JSON.

## קבצי JSON

מיקום: `src/content/forms/{id}.json`, קובץ אחד לכל טופס. אותו דפוס כמו `src/content/legal/`.

שדות חובה ברמת הטופס: `id`, `title`, `folder`, `categoryFolder`, `sections`.

`id` בקובץ חייב להיות זהה לשם הקובץ (בלי `.json`).

דוגמה מקוצרת:

```json
{
  "id": "waiver-confidentiality",
  "title": "טופס ויתור סודיות",
  "folder": "טופס ויתור סודיות",
  "categoryFolder": "אינפורמציה כללית",
  "simplesign": {
    "lockedKeys": ["student_name", "father_name", "mother_name"]
  },
  "sections": [
    {
      "fields": [
        {
          "key": "student_name",
          "label": "אנו הורי התלמיד/ה",
          "required": true,
          "shared": true,
          "studentKey": "full_name"
        }
      ]
    }
  ]
}
```

### שדה ב-JSON

תואם ל-`FormFieldDef` הקיים: `key`, `label`, `type`, `required`, `shared`, `studentKey`, `rows`, `options`, `hint`, `scheduleVariant`, `layout` ברמת סעיף.

סוגים מורכבים נשמרים כ-`type` בלבד:

| type ב-JSON | מימוש בקוד |
|---|---|
| `row-table` | `key` / מזהה טבלה קיים ב-`FORM_TABLE_DEFS` |
| `schedule-grid` | `scheduleVariant` קיים |
| `rating-grid` | מחוון מחנכת הקיים |
| `accommodations-picker` | קטלוג התאמות הקיים |
| `func-scale` | select 1–9 (קיצור ל-`funcScaleField`) |

הטוען דוחה JSON לא תקין (zod) בזמן טעינה / בבדיקות. אין נפילה שקטה לסכמה ריקה.

### מה מותר לשנות ב-JSON בלי נעילה

- `label`, `hint`, `required`, `rows`, סדר שדות, כותרות סעיפים, טקסט `static`.
- הוספת שדה חדש לטופס האינטרנטי בלבד (בלי להוסיף אותו ל-`lockedKeys`).

### מה אסור בלי עדכון מודע

- שינוי או מחיקה של `key` שמופיע ב-`lockedKeys`.
- הוספת `key` ל-`lockedKeys` בלי שהוא קיים בשדות הטופס.

`key` הוא מזהה הנתונים (גם במילויים שמורים ב-DB). שינוי `key` הוא שינוי שובר, לא שינוי תווית.

## נעילת SimpleSign

בלוק `simplesign` מופיע **רק** בטפסים שמופיעים ב-`SIMPLESIGN_FORM_CONFIGS` (כיום 8 טפסים).

`lockedKeys` הוא חוזה מול תבנית SimpleSign: רשימת מפתחות מתוה שחייבים להתאים לשדה בתבנית (לפי `input.key` או `input.label`, אחרי נרמול אותיות קטנות ורווחים — אותה לוגיקה כמו `mapPrefillToSimpleSignKeys`). הרשימה כוללת גם את מפתחות חתימת ההורים של אותו טופס (`father_signature`, `parent1_signature` וכו').

זה **לא** כל שדות הטופס. שאלון הפניה יכול להכיל עשרות שדות במתוה ורק חלקם על ה-PDF.

כל טופס ב-`SIMPLESIGN_FORM_CONFIGS` חייב:

1. קובץ JSON עם אותו `id`.
2. בלוק `simplesign.lockedKeys` לא ריק.
3. כל ערך ב-`lockedKeys` קיים כ-`key` של שדה בטופס.
4. כל מפתח ב-`parentSigners[].signatureFieldKey` של אותו טופס מופיע ב-`lockedKeys`.

טופס בלי מיפוי SimpleSign: אסור שיהיה בו בלוק `simplesign`.

חותמים, `documentTokenEnv` ו-`signatureFieldKey` נשארים ב-`config.ts`. הודעות הכשל ב-CI מדפיסות את שם משתנה ה-env משם, כדי שהמפתח יידע איזו תבנית לעדכן.

### זריעת lockedKeys הראשונית

פעם אחת, אחרי שיש טוקני מסמך: הסקריפט מדפיס את מפתחות SimpleSign החיים. המפתח שומר ב-JSON את המפתחות שצריכים להישאר מסונכרנים (חיתוך עם שדות מתוה + מפתחות חתימת הורים שמופיעים בתבנית).

אין דגל `--write` שמחליף את הקובץ אוטומטית ב-CI. עדכון `lockedKeys` הוא commit מודע.

## בדיקות — CI בלבד

אין קריאת SimpleSign מנתיב השליחה ללקוח (`create-submissions` ודומיו לא משתנים לצורך בדיקת מפתחות).

### 1. טסט יחידה (בלי רשת)

רץ ב-`npm test` (Vitest), גם אצל מפתח וגם ב-CI.

נכשל אם:

- טופס SimpleSign בלי `lockedKeys`, או עם מפתח נעול שחסר בסכמה.
- `lockedKeys` מכיל כפילויות.
- שדה עם `key` נעול נמחק או ששמו שונה ב-JSON.

הודעת הכשל בעברית, כוללת: `form_id`, מפתחות שנוספו/הוסרו מול הרשימה הנעולה, ושם משתנה ה-env של התבנית (`SIMPLESIGN_DOC_…`). נוסח קבוע:

> המפתחות הנעולים של `{formId}` השתנו. עדכנו את אותם שמות שדות בתבנית SimpleSign (`{documentTokenEnv}`), ואז עדכנו את `simplesign.lockedKeys` ב-`src/content/forms/{formId}.json`.

שינוי `label` בלבד לא נכשל כאן.

### 2. בדיקה חיה מול SimpleSign

פקודה: `npm run simplesign:check`.

עבור כל טופס ב-`SIMPLESIGN_FORM_CONFIGS`:

1. קורא טוקן מ-`getSimpleSignDocumentToken`.
2. קורא `GET https://simplesign.co.il/api/v1/documents/{token}/inputs` דרך הלקוח הקיים (host קבוע, לא קלט משתמש).
3. לכל `lockedKey`: חייב להימצא input ש-`key` או `label` שלו תואמים אחרי נרמול. לשדות חתימת הורים — input מסוג `signature`.
4. נכשל אם חסר מפתח, עם אותה הודעה כמו למעלה ועם רשימת החסרים.

כללי CI:

- אם חסר `SIMPLESIGN_API_KEY` או טוקן למסמך — **הבדיקה נכשלת**, לא מדלגת. אחרת הנעילה תיעלם בשקט.
- אם SimpleSign מחזיר שגיאת רשת/5xx — נכשל (ניסיון חוזר אחד). אין דילוג.
- מקומית, בלי מפתחות: `npm test` ממשיך לעבוד (רק טסט 1). `simplesign:check` נכשל במפורש.

### Workflow ב-GitHub

נוסף workflow חדש (ליד `dependency-audit.yml`):

- `on`: push לכל ענף ו-pull_request. בלי schedule קבוע — CI מספיק.
- Job א: `npm ci` + `npm test` (כולל נעילת JSON).
- Job ב: `npm run simplesign:check`, עם secrets: `SIMPLESIGN_API_KEY` וכל `SIMPLESIGN_DOC_*` שמופיעים ב-`config.ts`.

בלי secrets האלה Job ב יישאר אדום. זה מכוון.

## טוען הסכמות

מודול חדש (למשל `src/lib/form-schema-loader.ts`):

- קורא את כל `src/content/forms/*.json` בזמן build (import סטטי / glob שמ-Next יודע לארוז).
- מאמת ב-zod.
- ממיר ל-`FormSchema`.
- `form-schemas.ts` מחזיק את פונקציות הניווט (`getFormSchemaByFolder`, voice, href) ומייצא `FORM_SCHEMAS` מהטוען.

אין קריאת `fs` לפי שם שבא מהמשתמש (רק רשימת קבצים ידועה ב-bundle).

## זרימת מפתח

1. עורכים `src/content/forms/{id}.json`.
2. `npm test` — אם שונה `key` נעול, נכשל עם ההודעה למעלה.
3. מעדכנים ידנית את השדות באותם שמות בתבנית SimpleSign.
4. `npm run simplesign:check` (עם `.env.local`) עד שעובר.
5. מעדכנים את `lockedKeys` באותו קובץ JSON ועושים commit.

שינוי תווית עברית: שלבים 1–2 בלבד.

## מיגרציה

כל הסכמות שב-`FORM_SCHEMAS` (~50 טפסים) עוברות ל-JSON. אין מצב ביניים שבו חלק מהטפסים רק בקוד וחלק ב-JSON אחרי סיום העבודה.

סדר ביצוע מומלץ בתוכנית המימוש (לא בשליחה ללקוח):

1. טוען + סכמת zod + טופס אחד (ויתור סודיות) כהוכחה.
2. שאר טפסי SimpleSign + `lockedKeys` + טסט נעילה.
3. `simplesign:check` + workflow.
4. שאר הטפסים ל-JSON.
5. מחיקת קטלוג השדות מ-`form-schemas.ts`.

בדיקות קיימות (`form-snapshot`, `prefill`, ניווט תיק) ממשיכות לעבוד דרך `getFormSchema` ולא מול המערך המוטמע.

## תיעוד

`docs/simplesign-setup.md`: סעיף קצר על `lockedKeys`, הפקודה `simplesign:check`, והחובה לעדכן תבנית SimpleSign לפני עדכון הרשימה הנעולה.

`.env.local.example`: בלי שינוי חוזה, רק אזכור שהטוקנים דרושים גם כ-GitHub secrets ל-CI.
