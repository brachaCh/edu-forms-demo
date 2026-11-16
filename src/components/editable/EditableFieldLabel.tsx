"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INLINE_TEXT_EDITING_ENABLED } from "@/lib/inline-editing";

interface EditableFieldLabelProps {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  className?: string;
  fallback?: string;
}

/** עריכת שם שדה באותו ממשק כמו EditableText (עיפרון ליד התווית) — לנתונים, לא לטקסט אתר */
export function EditableFieldLabel({
  value,
  onSave,
  className,
  fallback = "שדה נוסף",
}: EditableFieldLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  function updatePanelPosition() {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }

  function openEdit(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
  }

  function openEditKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    openEdit(e);
  }

  async function save(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = draft.trim() || fallback;
    await onSave(next);
    setEditing(false);
    setPanelPos(null);
  }

  function cancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditing(false);
    setPanelPos(null);
  }

  useEffect(() => {
    if (!editing) return;

    const frame = requestAnimationFrame(updatePanelPosition);

    function handleReposition() {
      updatePanelPosition();
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [editing]);

  if (!INLINE_TEXT_EDITING_ENABLED) {
    return <span className={className}>{value || fallback}</span>;
  }

  const editPanel =
    editing && panelPos
      ? createPortal(
          <div
            className="z-50 flex flex-col gap-2 rounded-xl border border-brand-200 bg-white p-3 shadow-xl"
            style={{
              position: "fixed",
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-lg border border-input bg-brand-50 px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={(e) => void save(e)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm hover:bg-brand-600"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={cancel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink hover:bg-brand-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={cn(
          "group relative inline-flex max-w-full items-center gap-1.5",
          editing && "rounded-lg ring-2 ring-brand-300",
          className
        )}
      >
        <span className={cn(editing && "opacity-80")}>{value || fallback}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={openEdit}
          onKeyDown={openEditKey}
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-brand-200 bg-white/80 text-brand-500 opacity-0 shadow-sm transition-opacity hover:opacity-100 group-hover:opacity-90"
          aria-label="עריכת שם השדה"
          title="עריכת שם השדה"
        >
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </span>
      {editPanel}
    </>
  );
}
