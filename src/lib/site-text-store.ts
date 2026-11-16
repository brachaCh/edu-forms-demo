import {
  DEFAULT_SITE_TEXTS,
  alignCoreFieldCaptions,
  alignFooterCaptions,
  alignFreeAccessDurationCaptions,
  alignParentNameCaptions,
  alignStaffStudentStatusCaptions,
  alignUploadLimitCaptions,
  getSiteTexts,
  getSiteTextsUpdatedAt,
  mergeSiteTexts,
  resetSiteTexts,
  saveSiteTexts,
  type SiteTexts,
} from "./site-text";
import * as db from "./supabase-db";
import { canUseSupabase, SiteTextWriteDeniedError } from "./supabase-db";

function isSiteTextWriteDenied(error: unknown): boolean {
  return error instanceof SiteTextWriteDeniedError;
}

const STORAGE_KEY = "matoah.site-texts";

/** חלון קצר אחרי שמירה מקומית — לא לדרוס עריכה שעדיין בסנכרון */
const LOCAL_EDIT_GRACE_MS = 20_000;

function hasLocalOverrides(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(STORAGE_KEY));
}

function remoteUpdatedAtMs(remoteUpdatedAt: string | null): number | null {
  if (!remoteUpdatedAt) return null;
  const ms = Date.parse(remoteUpdatedAt);
  return Number.isFinite(ms) ? ms : null;
}

async function finalizeLoadedTexts(texts: SiteTexts): Promise<SiteTexts> {
  let current = texts;
  let changed = false;

  const statusAligned = alignStaffStudentStatusCaptions(current);
  if (statusAligned.changed) {
    current = statusAligned.texts;
    changed = true;
  }

  const parentAligned = alignParentNameCaptions(current);
  if (parentAligned.changed) {
    current = parentAligned.texts;
    changed = true;
  }

  const coreAligned = alignCoreFieldCaptions(current);
  if (coreAligned.changed) {
    current = coreAligned.texts;
    changed = true;
  }

  const footerAligned = alignFooterCaptions(current);
  if (footerAligned.changed) {
    current = footerAligned.texts;
    changed = true;
  }

  const freeAccessAligned = alignFreeAccessDurationCaptions(current);
  if (freeAccessAligned.changed) {
    current = freeAccessAligned.texts;
    changed = true;
  }

  const uploadLimitAligned = alignUploadLimitCaptions(current);
  if (uploadLimitAligned.changed) {
    current = uploadLimitAligned.texts;
    changed = true;
  }

  if (!changed) return texts;
  saveSiteTexts(current);
  if (canUseSupabase()) {
    try {
      await db.upsertSiteTextOverrides(current);
    } catch (error) {
      if (!isSiteTextWriteDenied(error)) {
        console.error("Failed to persist aligned site captions", error);
      }
    }
  }
  return current;
}

/**
 * Supabase = מקור האמת המשותף (מערכת ↔ מקומי).
 * המקומי נשמר רק אם זה עתה נערך כאן ועדיין לא הספיק להתעדכן בשרת.
 */
export async function loadSiteTexts(): Promise<SiteTexts> {
  const localUpdatedAtStart = getSiteTextsUpdatedAt();

  if (canUseSupabase()) {
    try {
      const remote = await db.fetchSiteTextOverrides();

      const local = getSiteTexts();
      const liveUpdatedAt = getSiteTextsUpdatedAt();
      const localUpdatedAt = liveUpdatedAt ?? localUpdatedAtStart;

      // עריכה מקומית תוך כדי הטעינה — לשמור ולדחוף לשרת
      if (
        liveUpdatedAt != null &&
        localUpdatedAtStart != null &&
        liveUpdatedAt > localUpdatedAtStart
      ) {
        const live = getSiteTexts();
        try {
          await db.upsertSiteTextOverrides(live);
        } catch (error) {
          if (!isSiteTextWriteDenied(error)) throw error;
        }
        return finalizeLoadedTexts(live);
      }

      if (remote) {
        const fromRemote = mergeSiteTexts(DEFAULT_SITE_TEXTS, remote.data);
        const remoteMs = remoteUpdatedAtMs(remote.updatedAt);

        const localJustEdited =
          hasLocalOverrides() &&
          localUpdatedAt != null &&
          remoteMs != null &&
          localUpdatedAt > remoteMs &&
          Date.now() - localUpdatedAt < LOCAL_EDIT_GRACE_MS;

        if (localJustEdited) {
          try {
            await db.upsertSiteTextOverrides(local);
            return finalizeLoadedTexts(local);
          } catch (error) {
            if (!isSiteTextWriteDenied(error)) throw error;
          }
        }

        // תמיד מושכים מהמערכת — גם אם יש עותק מקומי ישן
        saveSiteTexts(fromRemote, {
          updatedAt: remoteMs ?? Date.now(),
        });
        return finalizeLoadedTexts(fromRemote);
      }

      if (hasLocalOverrides()) {
        try {
          await db.upsertSiteTextOverrides(local);
        } catch (error) {
          if (!isSiteTextWriteDenied(error)) throw error;
        }
        return finalizeLoadedTexts(local);
      }
    } catch (error) {
      console.error("Failed to load site texts from Supabase", error);
      return finalizeLoadedTexts(getSiteTexts());
    }
  }

  return finalizeLoadedTexts(getSiteTexts());
}

export async function persistSiteTexts(texts: SiteTexts): Promise<void> {
  saveSiteTexts(texts);

  if (!canUseSupabase()) return;

  try {
    await db.upsertSiteTextOverrides(texts);
  } catch (error) {
    if (isSiteTextWriteDenied(error)) return;
    console.error("Failed to save site texts to Supabase", error);
    throw error;
  }
}

export async function clearSiteTextsEverywhere(): Promise<void> {
  resetSiteTexts();

  if (!canUseSupabase()) return;

  try {
    await db.clearSiteTextOverrides();
  } catch (error) {
    if (isSiteTextWriteDenied(error)) return;
    console.error("Failed to reset site texts in Supabase", error);
    throw error;
  }
}
