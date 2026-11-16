"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { addTutorial } from "@/lib/tutorials-store";

export function AddTutorialButton() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data: { isPlatformAdmin?: boolean }) => {
        if (!cancelled) setAllowed(data.isPlatformAdmin === true);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetForm() {
    setTitle("");
    setDescription("");
    setVideoUrl("");
    setError(null);
  }

  async function handleAdd() {
    if (!allowed) return;
    setBusy(true);
    setError(null);
    try {
      addTutorial({
        title,
        description,
        videoUrl: videoUrl.trim() || null,
      });
      setOpen(false);
      resetForm();
    } catch {
      setError("לא ניתן להוסיף את הסרטון");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
      >
        <Plus className="h-5 w-5" />
        <EditableText path="tutorials.addButton" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="tutorials.addTitle" as="span" />
            </DialogTitle>
            <DialogDescription>
              <EditableText path="tutorials.addDescription" as="span" />
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-tut-title">
                <EditableText path="tutorials.titleLabel" />
              </Label>
              <Input
                id="admin-tut-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-tut-desc">
                <EditableText path="tutorials.descriptionLabel" />
              </Label>
              <Input
                id="admin-tut-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-tut-url">
                <EditableText path="tutorials.urlLabel" />
              </Label>
              <Input
                id="admin-tut-url"
                dir="ltr"
                className="text-left"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <EditableText path="wizard.cancelButton" />
            </Button>
            <Button
              type="button"
              disabled={busy || !title.trim()}
              onClick={() => void handleAdd()}
            >
              <Plus className="h-4 w-4" />
              <EditableText path="tutorials.addButton" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
