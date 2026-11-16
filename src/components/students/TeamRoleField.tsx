"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TEAM_ROLE_OTHER_VALUE,
  TEAM_ROLE_PRESET_LABELS,
  composeTeamRoleOtherDraft,
  composeTeamRoleStored,
  finalizeTeamRoleOther,
  isTeamRolePreset,
  shouldUseTeamRoleOtherUi,
  teamRoleOtherText,
} from "@/lib/team-role-field";

type TeamRoleFieldProps = {
  value: string;
  onChange: (next: string) => void;
  onBlur?: (committedValue: string) => void;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  disabled?: boolean;
  /** תווית נגישות לשדה הטקסט החופשי */
  ariaLabel?: string;
};

function otherTextFromStored(stored: string, freeTextMode: boolean): string {
  if (!freeTextMode) return "";
  if (stored === TEAM_ROLE_OTHER_VALUE) return "";
  const fromHelper = teamRoleOtherText(stored);
  if (fromHelper) return fromHelper;
  if (isTeamRolePreset(stored.trim())) return "";
  return stored;
}

export function TeamRoleField({
  value,
  onChange,
  onBlur,
  className,
  selectClassName,
  inputClassName,
  disabled = false,
  ariaLabel = "תפקיד — פירוט",
}: TeamRoleFieldProps) {
  const [freeTextMode, setFreeTextMode] = useState(() =>
    shouldUseTeamRoleOtherUi(value)
  );
  const [otherDraft, setOtherDraft] = useState(() =>
    otherTextFromStored(value, shouldUseTeamRoleOtherUi(value))
  );
  const otherEditingRef = useRef(false);
  const userPickedOtherRef = useRef(false);
  const valueRef = useRef(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);
  valueRef.current = value;

  useEffect(() => {
    if (otherEditingRef.current || userPickedOtherRef.current) return;
    const nextFree = shouldUseTeamRoleOtherUi(value);
    setFreeTextMode(nextFree);
    setOtherDraft(otherTextFromStored(value, nextFree));
  }, [value]);

  const selectValue = freeTextMode
    ? TEAM_ROLE_OTHER_VALUE
    : isTeamRolePreset(value.trim())
      ? value.trim()
      : value.trim() === TEAM_ROLE_OTHER_VALUE
        ? TEAM_ROLE_OTHER_VALUE
        : "";

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-1", className)}>
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const nextSelect = e.target.value;
          if (nextSelect === "") {
            userPickedOtherRef.current = false;
            setFreeTextMode(false);
            setOtherDraft("");
            otherEditingRef.current = false;
            onChange("");
            onBlur?.("");
            return;
          }
          if (nextSelect === TEAM_ROLE_OTHER_VALUE) {
            userPickedOtherRef.current = true;
            setFreeTextMode(true);
            setOtherDraft(otherTextFromStored(valueRef.current, true));
            otherEditingRef.current = true;
            requestAnimationFrame(() => otherInputRef.current?.focus());
            return;
          }
          userPickedOtherRef.current = false;
          setFreeTextMode(false);
          setOtherDraft("");
          otherEditingRef.current = false;
          const committed = composeTeamRoleStored(nextSelect, "");
          onChange(committed);
          onBlur?.(committed);
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && rootRef.current?.contains(next)) return;
        }}
        className={cn(
          "flex h-8 w-full rounded-md border border-input bg-white px-2 text-sm",
          selectClassName
        )}
      >
        <option value="">—</option>
        {TEAM_ROLE_PRESET_LABELS.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      {freeTextMode ? (
        <input
          ref={otherInputRef}
          type="text"
          value={otherDraft}
          disabled={disabled}
          placeholder="למשל: מטפלת רגשית"
          aria-label={ariaLabel}
          onFocus={() => {
            otherEditingRef.current = true;
          }}
          onChange={(e) => {
            const next = e.target.value;
            setOtherDraft(next);
            if (next) onChange(composeTeamRoleOtherDraft(next));
          }}
          onBlur={(e) => {
            otherEditingRef.current = false;
            userPickedOtherRef.current = false;
            const final = finalizeTeamRoleOther(e.target.value);
            setOtherDraft(final);
            setFreeTextMode(shouldUseTeamRoleOtherUi(final));
            onChange(final);
            onBlur?.(final);
          }}
          className={cn(
            "h-8 w-full rounded-md border border-border bg-white px-2 text-sm text-ink outline-none focus:bg-brand-50/40",
            inputClassName
          )}
        />
      ) : null}
    </div>
  );
}