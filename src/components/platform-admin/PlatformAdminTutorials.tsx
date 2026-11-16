"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Video,
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toEmbeddableVideoUrl } from "@/lib/tutorials-store";
import type { TutorialAudience, TutorialRecord } from "@/lib/tutorials";
import { cn } from "@/lib/utils";

const AUDIENCE_LABELS: Record<TutorialAudience, string> = {
  all: "כולם",
  teachers: "מורות",
  admins: "מנהלות",
};

type TutorialDraft = {
  title: string;
  url: string;
  audience: TutorialAudience;
};

const EMPTY_DRAFT: TutorialDraft = {
  title: "",
  url: "",
  audience: "all",
};

export function PlatformAdminTutorials() {
  const [items, setItems] = useState<TutorialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TutorialDraft>(EMPTY_DRAFT);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/tutorials");
      if (!response.ok) throw new Error("LOAD_FAILED");
      const data = (await response.json()) as { tutorials?: TutorialRecord[] };
      setItems(data.tutorials ?? []);
    } catch {
      setError("לא ניתן לטעון את סרטוני ההדרכה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  }

  function openEdit(item: TutorialRecord) {
    setEditingId(item.id);
    setDraft({
      title: item.title,
      url: item.url,
      audience: item.audience,
    });
    setDialogOpen(true);
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const response = await fetch(
        editingId ? `/api/tutorials/${editingId}` : "/api/tutorials",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      if (!response.ok) {
        setError("לא ניתן לשמור את הסרטון. בדקו כותרת וקישור תקין.");
        return;
      }
      setDialogOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm("למחוק את הסרטון?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/tutorials/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("לא ניתן למחוק את הסרטון");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setItems(next);
    setBusy(true);
    try {
      const response = await fetch("/api/tutorials/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: next.map((item) => item.id) }),
      });
      if (!response.ok) {
        setError("לא ניתן לשנות את הסדר");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
          <Video className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">סרטוני הדרכה</h1>
          <p className="text-sm text-pink">
            קישורי YouTube / Vimeo / Google Drive — נשמרים במסד ונראים לכל המשתמשות
          </p>
        </div>
        <div className="mr-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            רענון
          </Button>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            סרטון חדש
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="menu-box p-8 text-center text-pink">טוען סרטונים...</div>
      ) : items.length === 0 ? (
        <div className="menu-box p-8 text-center text-pink">
          אין סרטוני הדרכה עדיין
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const embed = toEmbeddableVideoUrl(item.url);
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-white p-4 sm:flex-row"
              >
                <div className="w-full overflow-hidden rounded-xl bg-brand-50 sm:w-56">
                  {embed.kind === "youtube" || embed.kind === "vimeo" ? (
                    <iframe
                      src={embed.src}
                      title={item.title}
                      className="aspect-video w-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-brand-500">
                      <Video className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{item.title}</div>
                  <div className="mt-1 truncate text-xs text-pink" dir="ltr">
                    {item.url}
                  </div>
                  <div className="mt-2 text-xs font-medium text-brand-700">
                    קהל: {AUDIENCE_LABELS[item.audience]}
                  </div>
                </div>
                <div className="flex flex-row gap-1 sm:flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || index === 0}
                    onClick={() => void moveItem(index, -1)}
                    title="העלאה"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || index === items.length - 1}
                    onClick={() => void moveItem(index, 1)}
                    title="הורדה"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => openEdit(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => void removeItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "עריכת סרטון" : "סרטון הדרכה חדש"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tut-title">כותרת</Label>
              <Input
                id="tut-title"
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tut-url">קישור (YouTube / Vimeo / Drive)</Label>
              <Input
                id="tut-url"
                dir="ltr"
                className="text-left"
                value={draft.url}
                onChange={(e) => setDraft((prev) => ({ ...prev, url: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tut-audience">קהל יעד</Label>
              <select
                id="tut-audience"
                value={draft.audience}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    audience: e.target.value as TutorialAudience,
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">כולם</option>
                <option value="teachers">מורות</option>
                <option value="admins">מנהלות</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              disabled={busy || !draft.title.trim() || !draft.url.trim()}
              onClick={() => void saveDraft()}
            >
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
