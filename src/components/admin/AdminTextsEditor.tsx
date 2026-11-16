"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableText } from "@/components/editable/EditableText";
import { useSiteText } from "@/components/providers/SiteTextProvider";
import { flattenTextsForEditor } from "@/lib/site-text";

export function AdminTextsEditor() {
  const { texts, updateText, resetToDefaults, syncing, ready } = useSiteText();
  const [query, setQuery] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const sections = useMemo(() => flattenTextsForEditor(texts), [texts]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter(
          (field) =>
            field.key.toLowerCase().includes(q) ||
            field.label.toLowerCase().includes(q) ||
            field.value.toLowerCase().includes(q)
        ),
      }))
      .filter((section) => section.fields.length > 0);
  }, [sections, query]);

  function handleReset() {
    if (!window.confirm("לאפס את כל הכיתובים לברירת המחדל?")) return;
    resetToDefaults();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
          <Pencil className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">
            <EditableText path="admin.editTextsTitle" as="span" />
          </h1>
          <p className="text-sm text-pink">
            <EditableText path="admin.editTextsDescription" as="span" />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="חיפוש כיתוב..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button
          type="button"
          variant="outline"
          disabled={syncing}
          onClick={handleReset}
        >
          <EditableText path="admin.resetTexts" as="span" />
        </Button>
        <span className="text-xs text-pink">
          {syncing ? "שומר..." : savedFlash ? "נשמר" : ready ? "שמירה אוטומטית" : "טוען..."}
        </span>
      </div>

      <div className="space-y-6">
        {filtered.map((section) => (
          <section
            key={section.id}
            className="rounded-2xl border border-brand-200 bg-white p-4 space-y-3"
          >
            <h2 className="text-lg font-bold text-ink">{section.title}</h2>
            {section.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-brand-700" htmlFor={field.key}>
                  {field.label}
                  <span className="ms-2 text-pink" dir="ltr">
                    {field.key}
                  </span>
                </label>
                {field.multiline ? (
                  <textarea
                    id={field.key}
                    value={field.value}
                    rows={4}
                    onChange={(e) => {
                      updateText(field.key, e.target.value);
                      setSavedFlash(true);
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                ) : (
                  <Input
                    id={field.key}
                    value={field.value}
                    onChange={(e) => {
                      updateText(field.key, e.target.value);
                      setSavedFlash(true);
                    }}
                  />
                )}
              </div>
            ))}
          </section>
        ))}
      </div>

      <div>
        <Button asChild variant="outline">
          <Link href="/platform-admin/institutions">
            <ArrowRight className="h-4 w-4" />
            חזרה למוסדות ומשתמשים
          </Link>
        </Button>
      </div>
    </div>
  );
}
