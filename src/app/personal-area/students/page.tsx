import { redirect } from "next/navigation";

/** רשימת תלמידים גלובלית בוטלה — כל תלמיד רק מתוך הקטגוריה/הכיתה שלו */
export default function StudentsPage() {
  redirect("/personal-area");
}
