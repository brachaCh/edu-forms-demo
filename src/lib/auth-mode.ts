/**
 * מצב אימות זמני של האפליקציה.
 * TEMP_OPEN_ACCESS=true → הגישה לאזור האישי פתוחה בלי לוגין (שלב פיתוח).
 * לפני פרודקשן יש להעביר את הדגל ל-false ולוודא שהאימות עובד בכל הזרימות.
 *
 * הקבוע מיובא מ-middleware.ts וכן מ-route handlers שרוצים לכבד את אותו המצב.
 */
export const TEMP_OPEN_ACCESS = false;
