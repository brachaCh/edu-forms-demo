"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Eraser, PenLine } from "lucide-react";
import { Label } from "@/components/ui/label";
import { EditableText } from "@/components/editable/EditableText";
import {
  formatSimpleSignSignedLabel,
  isSimpleSignSignedValue,
} from "@/lib/simplesign/constants";
import {
  isSignatureInk,
  signatureToInkSegments,
  strokesToSegments,
  strokesToInkPath,
  type InkSegment,
  type SignaturePoint,
} from "@/lib/green-signature";

const PAD_HEIGHT = 56;

function InkStrokes({ segments }: { segments: InkSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={index}
          className="pointer-events-none absolute block rounded-full bg-[#0f766e]"
          style={{
            left: segment.x,
            top: segment.y,
            width: segment.length,
            height: 2.4,
            transform: `rotate(${segment.angle}rad)`,
            transformOrigin: "0 50%",
          }}
        />
      ))}
    </>
  );
}

interface GreenSignatureFieldProps {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  /**
   * איזו הודעת נעילה להציג כש-readOnly:
   * "parent" — חתימת הורים; "third-party" — מנהל/ת, מפקח/ת וכו'
   */
  lockedHint?: "parent" | "third-party";
  /** תיבת חתימה גדולה ובולטת — לדף החתימה הציבורי */
  size?: "default" | "large";
  /** טקסט שמופיע בתוך התיבה כשהיא ריקה; ריק = בלי הנחיה */
  placeholder?: string;
}

const DEFAULT_PLACEHOLDER = "חתמו כאן באצבע או בעכבר";

export function GreenSignatureField({
  id,
  label,
  required,
  value,
  onChange,
  readOnly = false,
  lockedHint = "parent",
  size = "default",
  placeholder = DEFAULT_PLACEHOLDER,
}: GreenSignatureFieldProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<SignaturePoint | null>(null);
  const strokesRef = useRef<SignaturePoint[][]>([]);
  const skipLoadRef = useRef(false);
  const [segments, setSegments] = useState<InkSegment[]>([]);
  const signedViaSimpleSign = isSimpleSignSignedValue(value);
  const hasInk = isSignatureInk(value) || signedViaSimpleSign;
  const showPlaceholder =
    !readOnly && !signedViaSimpleSign && segments.length === 0 && Boolean(placeholder);
  const isLarge = size === "large";
  const valueRef = useRef(value);
  valueRef.current = value;

  const paintStrokes = useCallback(() => {
    setSegments(strokesToSegments(strokesRef.current));
  }, []);

  const loadSavedInk = useCallback(async () => {
    const pad = padRef.current;
    const width = Math.max(160, Math.floor(pad?.getBoundingClientRect().width ?? 240));
    const height = Math.max(
      40,
      Math.floor(pad?.getBoundingClientRect().height ?? PAD_HEIGHT)
    );
    const next = await signatureToInkSegments(value, width, height);
    if (drawingRef.current) return;
    // אם הערך השתנה בזמן הטעינה — לא לדרוס
    if (valueRef.current !== value) return;
    strokesRef.current = [];
    setSegments(next);
  }, [value]);

  useEffect(() => {
    if (skipLoadRef.current) {
      skipLoadRef.current = false;
      return;
    }
    if (drawingRef.current) return;
    // ערך חיצוני (חתימה שחזרה מהשרת) — תמיד טוענים מחדש
    strokesRef.current = [];
    void loadSavedInk();
  }, [loadSavedInk]);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (drawingRef.current) return;
      if (strokesRef.current.length > 0) paintStrokes();
      else void loadSavedInk();
    });
    observer.observe(pad);
    return () => observer.disconnect();
  }, [loadSavedInk, paintStrokes]);

  function padPoint(e: React.PointerEvent<HTMLDivElement>) {
    const pad = padRef.current;
    if (!pad) return null;
    const rect = pad.getBoundingClientRect();
    return {
      x: Math.min(rect.width, Math.max(0, e.clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, e.clientY - rect.top)),
    };
  }

  function commitStrokes() {
    const pad = padRef.current;
    const width = pad?.clientWidth || 240;
    const height = pad?.clientHeight || PAD_HEIGHT;
    if (strokesRef.current.length === 0) {
      skipLoadRef.current = true;
      if (value) onChange("");
      return;
    }
    skipLoadRef.current = true;
    paintStrokes();
    onChange(strokesToInkPath(strokesRef.current, width, height));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    const point = padPoint(e);
    const pad = padRef.current;
    if (!point || !pad) return;
    pad.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point;
    strokesRef.current = [...strokesRef.current, [point]];
    paintStrokes();
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (readOnly || !drawingRef.current) return;
    const point = padPoint(e);
    if (!point) return;
    strokesRef.current[strokesRef.current.length - 1]?.push(point);
    lastPointRef.current = point;
    paintStrokes();
  }

  function endStroke(e: React.PointerEvent<HTMLDivElement>) {
    if (readOnly || !drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      padRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    commitStrokes();
  }

  function clearPad() {
    if (readOnly) return;
    strokesRef.current = [];
    skipLoadRef.current = true;
    setSegments([]);
    if (value) onChange("");
  }

  if (signedViaSimpleSign) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <div className="flex w-full items-center gap-2">
          <Label htmlFor={id} className="shrink-0 font-bold text-emerald-800">
            {label}
            {required ? " *" : ""}:
          </Label>
          <div
            id={id}
            role="status"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
          >
            <BadgeCheck className="h-4 w-4 shrink-0" />
            <span className="truncate">{formatSimpleSignSignedLabel(value)}</span>
          </div>
        </div>
      </div>
    );
  }

  const lockedHintPath = hasInk
    ? lockedHint === "parent"
      ? "studentPortfolio.parentSignatureReceivedHint"
      : "studentPortfolio.thirdPartySignatureReceivedHint"
    : lockedHint === "parent"
      ? "studentPortfolio.parentSignatureLockedHint"
      : "studentPortfolio.thirdPartySignatureLockedHint";

  // נעול בלי דיו — בלי משטח «חתמו כאן», רק הודעת נעילה
  if (readOnly && !hasInk) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <Label htmlFor={id} className="font-bold text-emerald-800">
          {label}
          {required ? " *" : ""}:
        </Label>
        <div
          id={id}
          role="status"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-pink"
        >
          <EditableText path={lockedHintPath} />
        </div>
      </div>
    );
  }

  const padHeightClass = isLarge ? "h-32 sm:h-36" : "h-14";
  const padBase = `relative ${padHeightClass} min-w-0 flex-1 overflow-hidden bg-emerald-50/40`;
  const padShape = isLarge
    ? "rounded-xl border-2 border-dashed border-emerald-500"
    : "border-b-2 border-emerald-600";
  const padInteractive = readOnly ? "" : "touch-none cursor-crosshair";

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className={isLarge ? "flex w-full flex-col gap-2" : "flex w-full items-end gap-2"}>
        <Label
          htmlFor={id}
          className={
            isLarge
              ? "font-bold text-emerald-800"
              : "shrink-0 pb-2 font-bold text-emerald-800"
          }
        >
          {label}
          {required ? " *" : ""}:
        </Label>
        <div className={isLarge ? "flex w-full items-start gap-2" : "contents"}>
        <div
          id={id}
          ref={padRef}
          role="img"
          aria-label={label}
          aria-readonly={readOnly}
          className={`${padBase} ${padShape} ${padInteractive}`.trim()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        >
          {showPlaceholder ? (
            <span
              aria-hidden="true"
              className={
                isLarge
                  ? "pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-1 text-emerald-700/80"
                  : "pointer-events-none absolute inset-0 flex select-none items-center justify-center text-xs text-emerald-700/70"
              }
            >
              {isLarge ? <PenLine className="h-6 w-6" /> : null}
              <span className={isLarge ? "text-sm font-medium" : undefined}>
                {placeholder}
              </span>
            </span>
          ) : null}
          <InkStrokes segments={segments} />
        </div>
        {readOnly ? null : (
          <button
            type="button"
            className={
              isLarge
                ? "flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                : "shrink-0 pb-2 text-emerald-700 hover:text-emerald-900"
            }
            title="ניקוי"
            onClick={clearPad}
          >
            <Eraser className="h-4 w-4" />
            {isLarge ? (
              <span>ניקוי</span>
            ) : (
              <span className="sr-only">
                <EditableText path="studentPortfolio.greenSignatureClear" />
              </span>
            )}
          </button>
        )}
        </div>
      </div>
      {readOnly ? (
        <p className="pr-[1ch] text-xs text-pink">
          <EditableText path={lockedHintPath} />
        </p>
      ) : null}
    </div>
  );
}
