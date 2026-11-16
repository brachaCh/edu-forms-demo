"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Check, X } from "lucide-react";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { getTextByPath } from "@/lib/get-text-by-path";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo-mode";
import { INLINE_TEXT_EDITING_ENABLED } from "@/lib/inline-editing";

type EditableTag = "span" | "p" | "h1" | "h2" | "h3" | "div";

interface EditableTextProps {
  path: string;
  className?: string;
  as?: EditableTag;
  multiline?: boolean;
  block?: boolean;
  center?: boolean;
}

export function EditableText({
  path,
  className,
  as: Tag = "span",
  multiline = false,
  block = false,
  center = false,
}: EditableTextProps) {
  const { texts, updateText, syncing } = useSiteText();
  // Always global — sector-scoped copies were shadowing edits and looked "unsaved"
  const value = getTextByPath(texts, path);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // תצוגה בלבד — בדמו, וכשעריכה בתוך הדף כבויה
  const draftMode = isDemoMode() || !INLINE_TEXT_EDITING_ENABLED;
  const [draft, setDraft] = useState(value);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const skipCommitRef = useRef(false);

  draftRef.current = draft;
  valueRef.current = value;

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
    skipCommitRef.current = false;
    setDraft(value);
    setEditing(true);
  }

  function openEditKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    openEdit(e);
  }

  function closeEditor() {
    setEditing(false);
    setPanelPos(null);
  }

  function commitDraft() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      closeEditor();
      return;
    }
    const next = draftRef.current.trim() || valueRef.current;
    if (next !== valueRef.current) {
      updateText(path, next);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    }
    closeEditor();
  }

  function save(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    commitDraft();
  }

  function cancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    skipCommitRef.current = false;
    closeEditor();
  }

  function onDraftKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    if (e.key === "Escape") {
      e.preventDefault();
      skipCommitRef.current = true;
      closeEditor();
      return;
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      commitDraft();
    }
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

  if (draftMode) {
    return (
      <Tag
        className={cn(
          block && "block w-full",
          center && "text-center",
          className
        )}
      >
        {value}
      </Tag>
    );
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
            {multiline ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={onDraftKeyDown}
                rows={4}
                className="w-full rounded-lg border border-input bg-brand-50 px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
                autoFocus
              />
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={onDraftKeyDown}
                className="w-full rounded-lg border border-input bg-brand-50 px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
                autoFocus
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={save}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm hover:bg-brand-600"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink hover:bg-brand-50"
              >
                <X className="h-3.5 w-3.5" />
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
          "group relative inline-flex max-w-full items-center",
          block && "flex w-full",
          center && "justify-center text-center",
          editing && "rounded-lg ring-2 ring-brand-300",
          className
        )}
      >
        <Tag
          className={cn(
            !block && className,
            center && "text-center",
            editing && "opacity-80"
          )}
        >
          {value}
        </Tag>
        {justSaved && (
          <span className="ms-1 text-[10px] font-medium text-brand-600">
            {syncing ? "שומר…" : "נשמר"}
          </span>
        )}
        {/* absolute — לא תופס מקום בפריסה, כדי שטקסט ממורכז לא יוזז */}
        <span
          role="button"
          tabIndex={0}
          onClick={openEdit}
          onKeyDown={openEditKey}
          className="absolute start-full top-1/2 z-10 ms-1 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border border-brand-200 bg-white/90 text-brand-500 opacity-0 shadow-sm transition-opacity hover:opacity-100 group-hover:opacity-90 group-focus-within:opacity-90"
          aria-label="עריכת כיתוב"
          title="עריכת כיתוב"
        >
          <Pencil className="h-3.5 w-3.5" />
        </span>
      </span>
      {editPanel}
    </>
  );
}
