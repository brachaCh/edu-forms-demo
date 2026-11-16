export interface TutorialVideo {
  id: string;
  title: string;
  description: string;
  /** קישור ליוטיוב / קובץ / data URL */
  videoUrl: string | null;
  /** mime של קובץ שהועלה, אם יש */
  mimeType: string | null;
  createdAt: string;
}

const STORAGE_KEY = "matoah.tutorials.items";
const HIDDEN_LEGACY_KEY = "matoah.tutorials.hidden";

export const MAX_TUTORIAL_VIDEO_BYTES = 20 * 1024 * 1024; // 20MB

const DEFAULT_TUTORIALS: TutorialVideo[] = [
  {
    id: "1",
    title: "איך להירשם למערכת",
    description: "הסבר על תהליך הרישום למערכת",
    videoUrl: "/tutorials/registration-1.mp4",
    mimeType: "video/mp4",
    createdAt: "1970-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    title: "יצירת כרטיס תלמיד",
    description: "הוספת תלמיד חדש לרשימה - מהיר וקל",
    videoUrl: null,
    mimeType: null,
    createdAt: "1970-01-01T00:00:00.000Z",
  },
  {
    id: "3",
    title: "ניהול קטגוריות",
    description: "חלוקת התלמידים לפי בית ספר, גיל וסטטוס",
    videoUrl: null,
    mimeType: null,
    createdAt: "1970-01-01T00:00:00.000Z",
  },
  {
    id: "4",
    title: "טבלת סיכום ורשימות",
    description: "צפייה בסיכום כל התלמידים במקום אחד",
    videoUrl: null,
    mimeType: null,
    createdAt: "1970-01-01T00:00:00.000Z",
  },
];

function readItems(): TutorialVideo[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TutorialVideo[];
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item) => item && typeof item.id === "string" && typeof item.title === "string"
    );
  } catch {
    return null;
  }
}

function writeItems(items: TutorialVideo[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function migrateFromLegacy(): TutorialVideo[] {
  let items = [...DEFAULT_TUTORIALS];
  try {
    const hiddenRaw = window.localStorage.getItem(HIDDEN_LEGACY_KEY);
    if (hiddenRaw) {
      const hidden = JSON.parse(hiddenRaw) as string[];
      if (Array.isArray(hidden)) {
        items = items.filter((item) => !hidden.includes(item.id));
      }
      window.localStorage.removeItem(HIDDEN_LEGACY_KEY);
    }
  } catch {
    // ignore
  }
  writeItems(items);
  return items;
}

/** משלים קישורי ברירת מחדל כשנשמרו כרטיסים בלי וידאו (localStorage ישן) */
function mergeDefaultVideos(items: TutorialVideo[]): TutorialVideo[] {
  const defaultsById = new Map(DEFAULT_TUTORIALS.map((item) => [item.id, item]));
  let changed = false;
  const next = items.map((item) => {
    if (item.videoUrl) return item;
    const fallback = defaultsById.get(item.id);
    if (!fallback?.videoUrl) return item;
    changed = true;
    return {
      ...item,
      videoUrl: fallback.videoUrl,
      mimeType: item.mimeType ?? fallback.mimeType,
      description: item.description || fallback.description,
    };
  });
  if (changed) writeItems(next);
  return next;
}

export function listTutorials(): TutorialVideo[] {
  if (typeof window === "undefined") return DEFAULT_TUTORIALS;
  const existing = readItems();
  if (existing) return mergeDefaultVideos(existing);
  return migrateFromLegacy();
}

export function saveTutorials(items: TutorialVideo[]): TutorialVideo[] {
  writeItems(items);
  return items;
}

export function addTutorial(input: {
  title: string;
  description?: string;
  videoUrl?: string | null;
  mimeType?: string | null;
}): TutorialVideo[] {
  const items = listTutorials();
  const next: TutorialVideo = {
    id: crypto.randomUUID(),
    title: input.title.trim() || "סרטון חדש",
    description: (input.description ?? "").trim(),
    videoUrl: input.videoUrl ?? null,
    mimeType: input.mimeType ?? null,
    createdAt: new Date().toISOString(),
  };
  return saveTutorials([next, ...items]);
}

export function updateTutorial(
  id: string,
  patch: Partial<Pick<TutorialVideo, "title" | "description" | "videoUrl" | "mimeType">>
): TutorialVideo[] {
  const items = listTutorials().map((item) =>
    item.id === id ? { ...item, ...patch } : item
  );
  return saveTutorials(items);
}

export function deleteTutorial(id: string): TutorialVideo[] {
  return saveTutorials(listTutorials().filter((item) => item.id !== id));
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function googleDriveFileId(parsed: URL): string | null {
  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "drive.google.com") return null;

  const fromPath = parsed.pathname.split("/").filter(Boolean);
  const fileAt = fromPath.indexOf("d");
  const candidate =
    fromPath[fileAt - 1] === "file" && fromPath[fileAt + 1]
      ? fromPath[fileAt + 1]
      : parsed.searchParams.get("id");
  if (!candidate || !/^[a-zA-Z0-9_-]{10,}$/.test(candidate)) return null;
  return candidate;
}

/** ממיר קישור יוטיוב, וימאו או גוגל דרייב לכתובת הטמעה אם אפשר */
export function toEmbeddableVideoUrl(url: string): {
  kind: "youtube" | "vimeo" | "drive" | "direct";
  src: string;
  original?: string;
} {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");

    const driveId = googleDriveFileId(parsed);
    if (driveId) {
      return {
        kind: "drive",
        src: `https://drive.google.com/file/d/${driveId}/preview`,
        original: trimmed,
      };
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "");
      return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
    }
    if (host.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) {
        return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
      }
      const parts = parsed.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${parts[embedIdx + 1]}`,
        };
      }
    }
    if (host.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (id) {
        return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` };
      }
    }
  } catch {
    // not a URL — treat as direct
  }

  return { kind: "direct", src: trimmed };
}
