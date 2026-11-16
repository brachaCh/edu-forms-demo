"use client";

import {
  canUseSupabase,
  fetchDefaultInstitutionId,
  fetchStudentCustomFields,
  fetchStudentDocumentDataWithRetry,
  fetchStudentDocuments,
  fetchStudentFormFills,
  fetchStudents,
} from "./supabase-db";
import { hasInlinePrintPayload } from "./print-payload";
import { isStudentDocumentStorageRef } from "./student-document-storage-ref";
import type { ProjectHours } from "./project-hours-store";
import type {
  Student,
  StudentCustomField,
  StudentDocument,
  StudentFormFill,
} from "./supabase/types";

type CacheState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  defaultInstitutionId: string | null;
  students: Student[];
  documentsByStudent: Record<string, StudentDocument[]>;
  customFieldsByStudent: Record<string, StudentCustomField[]>;
  formFillsByStudent: Record<string, StudentFormFill[]>;
  projectHours: ProjectHours | null;
};

const listeners = new Set<() => void>();

/** Prevents hung Supabase fetches from leaving the app on "טוען…" forever. */
const INIT_TIMEOUT_MS = 25_000;

let cache: CacheState = {
  ready: false,
  loading: false,
  error: null,
  defaultInstitutionId: null,
  students: [],
  documentsByStudent: {},
  customFieldsByStudent: {},
  formFillsByStudent: {},
  projectHours: null,
};

/** Shared in-flight init so concurrent callers wait instead of bailing out. */
let initPromise: Promise<void> | null = null;
/** Bumps on each start/force so late responses from a superseded init are ignored. */
let initGeneration = 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("טעינת הנתונים ארכה מדי. נסו שוב."));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** מאפס מטמון אחרי התחברות/הרשמה/יציאה — מונע תלמידים ממוסד קודם */
export function resetDataCache(): void {
  initGeneration += 1;
  initPromise = null;
  cache = {
    ready: false,
    loading: false,
    error: null,
    defaultInstitutionId: null,
    students: [],
    documentsByStudent: {},
    customFieldsByStudent: {},
    formFillsByStudent: {},
    projectHours: null,
  };
  notify();
}

export function subscribeDataCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDataCache(): CacheState {
  return cache;
}

export function setStudentsInCache(students: Student[]) {
  cache = { ...cache, students };
  notify();
}

export function setDocumentsInCache(
  studentId: string,
  documents: StudentDocument[]
) {
  cache = {
    ...cache,
    documentsByStudent: {
      ...cache.documentsByStudent,
      [studentId]: documents,
    },
  };
  notify();
}

export function setCustomFieldsInCache(
  studentId: string,
  fields: StudentCustomField[]
) {
  cache = {
    ...cache,
    customFieldsByStudent: {
      ...cache.customFieldsByStudent,
      [studentId]: fields,
    },
  };
  notify();
}

export function setFormFillsInCache(
  studentId: string,
  fills: StudentFormFill[]
) {
  cache = {
    ...cache,
    formFillsByStudent: {
      ...cache.formFillsByStudent,
      [studentId]: fills,
    },
  };
  notify();
}

export function setProjectHoursInCache(hours: ProjectHours) {
  cache = { ...cache, projectHours: hours };
  notify();
}

export async function initDataCache(options?: {
  force?: boolean;
  /** מנקה גם מטמוני מסמכים/טפסים — רק ברענון ידני, לא בסנכרון רקע */
  invalidateNested?: boolean;
  /** סנכרון ברקע בלי מצב «טוען» — בין מורות באותו מוסד */
  quiet?: boolean;
  institutionId?: string | null;
  /** בקשת התלמידים אם כבר נשלחה במקביל לסנכרון הסשן — חוסך סבב רשת בטעינה */
  studentsPromise?: Promise<Student[]> | null;
}): Promise<void> {
  if (!canUseSupabase()) {
    cache = { ...cache, ready: true, loading: false, error: null };
    notify();
    return;
  }

  if (cache.loading && initPromise && !options?.force) {
    return initPromise;
  }

  const institutionId = options?.institutionId ?? null;
  const generation = ++initGeneration;
  const invalidateNested = options?.invalidateNested === true;
  const quiet = options?.quiet === true;
  if (!quiet) {
    cache = { ...cache, loading: true, error: null };
    notify();
  }

  initPromise = (async () => {
    try {
      // שעות הפרויקט נטענות בנפרד ע"י הווידג'ט — לא מעכבות את טעינת האפליקציה
      const [resolvedDefaultInstitutionId, students] = await withTimeout(
        Promise.all([
          institutionId
            ? Promise.resolve(institutionId)
            : fetchDefaultInstitutionId(),
          institutionId && options?.studentsPromise
            ? options.studentsPromise
            : fetchStudents(institutionId),
        ]),
        INIT_TIMEOUT_MS
      );

      if (generation !== initGeneration) return;

      const studentsChanged =
        JSON.stringify(cache.students.map((s) => [s.id, s.updated_at])) !==
        JSON.stringify(students.map((s) => [s.id, s.updated_at]));

      cache = {
        ...cache,
        ready: true,
        loading: false,
        error: null,
        defaultInstitutionId: resolvedDefaultInstitutionId,
        students,
        ...(invalidateNested
          ? {
              documentsByStudent: {},
              customFieldsByStudent: {},
              formFillsByStudent: {},
            }
          : {}),
      };
      if (!quiet || studentsChanged || invalidateNested) {
        notify();
      }
    } catch (err) {
      if (generation !== initGeneration) return;

      if (quiet && cache.ready) {
        // סנכרון רקע נכשל — לא להחליף מסך תקין בהודעת שגיאה
        return;
      }

      const message = err instanceof Error ? err.message : "";
      // אין סשן בדף ציבורי — זו לא תקלה להצגה
      if (message === "UNAUTHORIZED" || message === "NO_INSTITUTION") {
        cache = {
          ...cache,
          ready: true,
          loading: false,
          error: null,
          students: [],
        };
        notify();
        return;
      }

      cache = {
        ...cache,
        ready: true,
        loading: false,
        error: message || "שגיאה בטעינת נתונים",
      };
      notify();
    } finally {
      if (generation === initGeneration) {
        initPromise = null;
      }
    }
  })();

  return initPromise;
}

export async function ensureStudentDocuments(studentId: string) {
  if (!canUseSupabase()) return;
  if (cache.documentsByStudent[studentId]) return;
  const docs = await fetchStudentDocuments(
    studentId,
    getDataCache().defaultInstitutionId
  );
  setDocumentsInCache(studentId, docs);
}

/**
 * טוען מחדש מסמכים מהשרת (למשל אחרי ארכיון/שחזור).
 * ברירת מחדל: מטא-דאטה בלבד (מהיר). `withData` מביא גם את התוכן — להדפסה.
 */
export async function reloadStudentDocuments(
  studentId: string,
  options?: { withData?: boolean }
) {
  if (!canUseSupabase()) return;
  const docs = await fetchStudentDocuments(
    studentId,
    getDataCache().defaultInstitutionId,
    { includeData: options?.withData === true }
  );
  if (options?.withData) {
    setDocumentsInCache(studentId, docs);
    return;
  }
  // לא לזרוק תוכן שכבר נטען — ממזגים data_url מהמטמון הקיים
  const existing = new Map(
    (cache.documentsByStudent[studentId] ?? []).map((d) => [d.id, d.data_url])
  );
  setDocumentsInCache(
    studentId,
    docs.map((d) =>
      d.data_url ? d : { ...d, data_url: existing.get(d.id) ?? "" }
    )
  );
}

/**
 * משלים את תוכן המסמך (data URL) אם עדיין לא נטען, ומעדכן את המטמון.
 * מחזיר את המסמך עם התוכן, או null אם לא נמצא.
 * Storage-backed documents: always fetch a fresh signed URL (1h expiry).
 */
export async function ensureStudentDocumentData(
  doc: StudentDocument,
  options?: { signal?: AbortSignal; purpose?: "print" }
): Promise<StudentDocument | null> {
  const existing = doc.data_url?.trim() ?? "";
  if (isStudentDocumentStorageRef(existing)) {
    // Pointer only — mint a fresh signed URL through the document GET.
  } else if (hasInlinePrintPayload(existing)) {
    return doc;
  } else if (existing && options?.purpose !== "print") {
    // Storage https URLs are truthy but the print window cannot fetch a
    // private bucket. Re-load through GET ?format=bytes so the server
    // resolves the object. View/download keep the stored href.
    return doc;
  }
  if (!canUseSupabase()) return doc;
  const loaded = await fetchStudentDocumentDataWithRetry(doc.id, undefined, {
    signal: options?.signal,
    purpose: options?.purpose,
  });
  if (!loaded?.data_url) return null;
  const withData = { ...doc, data_url: loaded.data_url };
  const list = cache.documentsByStudent[doc.student_id];
  if (list) {
    const isSignedUrl = loaded.data_url.startsWith("https://");
    setDocumentsInCache(
      doc.student_id,
      list.map((d) =>
        d.id === doc.id
          ? { ...d, data_url: isSignedUrl ? existing : loaded.data_url }
          : d
      )
    );
  }
  return withData;
}

export async function ensureStudentCustomFields(studentId: string) {
  if (!canUseSupabase()) return;
  if (cache.customFieldsByStudent[studentId]) return;
  const fields = await fetchStudentCustomFields(
    studentId,
    getDataCache().defaultInstitutionId
  );
  setCustomFieldsInCache(studentId, fields);
}

export async function ensureStudentFormFills(studentId: string) {
  if (!canUseSupabase()) return;
  if (cache.formFillsByStudent[studentId]) return;
  await refreshStudentFormFills(studentId);
}

/** טוען מחדש מהשרת — חובה אחרי חתימת הורים מרחוק */
export async function refreshStudentFormFills(
  studentId: string,
  options?: { quiet?: boolean }
): Promise<void> {
  if (!canUseSupabase()) return;
  try {
    const fills = await fetchStudentFormFills(
      studentId,
      getDataCache().defaultInstitutionId,
      options?.quiet ? { quiet: true } : undefined
    );
    setFormFillsInCache(studentId, fills);
  } catch {
    if (!cache.formFillsByStudent[studentId]) {
      setFormFillsInCache(studentId, []);
    }
  }
}

/** טוען שדות מותאמים ומחזיר אותם — לשימוש חוזר ב-UI אחרי שמירה */
export async function loadStudentCustomFields(
  studentId: string
): Promise<StudentCustomField[]> {
  if (!canUseSupabase()) {
    return getDataCache().customFieldsByStudent[studentId] ?? [];
  }
  await ensureStudentCustomFields(studentId);
  return getDataCache().customFieldsByStudent[studentId] ?? [];
}
