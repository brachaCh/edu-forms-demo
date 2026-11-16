"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditableText } from "@/components/editable/EditableText";
import { deleteTutorial, listTutorials, type TutorialVideo } from "@/lib/tutorials-store";

export function DeleteTutorialsButton() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TutorialVideo[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

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

  function openList() {
    setPendingId(null);
    setItems(listTutorials());
    setOpen(true);
  }

  function confirmDelete() {
    if (!allowed || !pendingId) return;
    setItems(deleteTutorial(pendingId));
    setPendingId(null);
  }

  if (!allowed) return null;

  const pending = items.find((item) => item.id === pendingId) ?? null;

  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={openList}>
        <Trash2 className="h-5 w-5" />
        <EditableText path="tutorials.deleteTitle" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPendingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <EditableText path="tutorials.deleteTitle" as="span" />
            </DialogTitle>
            {pending ? (
              <DialogDescription>
                <EditableText path="tutorials.deleteConfirm" as="span" />
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {pending ? (
            <p className="text-sm font-semibold text-brand-900">{pending.title}</p>
          ) : items.length === 0 ? (
            <EditableText path="tutorials.emptyList" as="p" block className="text-sm text-brand-700" />
          ) : (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {items.map((tutorial) => (
                <li
                  key={tutorial.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 px-3 py-2"
                >
                  <span className="text-sm font-semibold text-brand-900">{tutorial.title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    aria-label="מחיקת סרטון"
                    onClick={() => setPendingId(tutorial.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter className="gap-2 sm:justify-center">
            {pending ? (
              <>
                <Button type="button" variant="outline" onClick={() => setPendingId(null)}>
                  <EditableText path="wizard.cancelButton" />
                </Button>
                <Button type="button" variant="destructive" onClick={confirmDelete}>
                  <Trash2 className="h-4 w-4" />
                  <EditableText path="common.delete" />
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                <EditableText path="wizard.cancelButton" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
