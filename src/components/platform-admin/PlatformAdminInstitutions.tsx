"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  Pencil,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MemberRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string | null;
}

interface InstitutionRow {
  id: string;
  name: string;
  schoolName: string | null;
  code: string;
  institutionType: string | null;
  createdAt: string;
  members: MemberRow[];
}

const TYPE_LABELS: Record<string, string> = {
  kindergartens: "גנים",
  schools: "בתי ספר",
  "high-schools": "חטיבות / תיכונים",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "בעלים",
  admin: "מנהלת",
  member: "חברה",
};

export function PlatformAdminInstitutions() {
  const [rows, setRows] = useState<InstitutionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/platform-admin/institutions");
      if (!response.ok) throw new Error("LOAD_FAILED");
      const data = (await response.json()) as { institutions?: InstitutionRow[] };
      setRows(data.institutions ?? []);
    } catch {
      setError("לא ניתן לטעון את רשימת המוסדות");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const memberHit = row.members.some(
        (member) =>
          member.fullName.toLowerCase().includes(q) ||
          member.email.toLowerCase().includes(q)
      );
      return (
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        (row.schoolName?.toLowerCase().includes(q) ?? false) ||
        memberHit
      );
    });
  }, [rows, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">מוסדות ומשתמשים</h1>
          <p className="text-sm text-pink">
            {filtered.length} מוסדות · תצוגה בלבד
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mr-auto"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          רענון
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/logs"
          className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm transition hover:border-brand-400"
        >
          <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-ink">לוג פעולות</div>
            <p className="mt-1 text-sm text-pink">
              היסטוריית פעולות במוסד הפעיל — מי עשה מה ומתי
            </p>
          </div>
        </Link>
        <Link
          href="/admin/texts"
          className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm transition hover:border-brand-400"
        >
          <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
            <Pencil className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-ink">עריכת כיתובים</div>
            <p className="mt-1 text-sm text-pink">
              עריכת כל הטקסטים והכותרות באתר
            </p>
          </div>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
        <Input
          type="search"
          placeholder="חיפוש מוסד או משתמשת..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="menu-box p-8 text-center text-pink">טוען מוסדות...</div>
      ) : filtered.length === 0 ? (
        <div className="menu-box p-8 text-center text-pink">לא נמצאו מוסדות</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const open = openId === row.id;
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-brand-200 bg-white p-4"
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 text-right"
                  onClick={() => setOpenId(open ? null : row.id)}
                >
                  <div>
                    <div className="font-semibold text-ink">{row.name}</div>
                    {row.schoolName ? (
                      <div className="text-sm text-pink">{row.schoolName}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-brand-600">
                      {row.code}
                      {row.institutionType
                        ? ` · ${TYPE_LABELS[row.institutionType] ?? row.institutionType}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-brand-700">
                    <Users className="h-4 w-4" />
                    {row.members.length} משתמשות
                  </div>
                </button>
                {open ? (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-brand-100">
                    {row.members.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-pink">אין חברות במוסד</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-brand-50">
                          <tr>
                            <th className="px-3 py-2 text-right font-semibold">שם</th>
                            <th className="px-3 py-2 text-right font-semibold">מייל</th>
                            <th className="px-3 py-2 text-right font-semibold">טלפון</th>
                            <th className="px-3 py-2 text-right font-semibold">תפקיד</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.members.map((member) => (
                            <tr key={member.id} className="border-t border-brand-100">
                              <td className="px-3 py-2">{member.fullName || "—"}</td>
                              <td className="px-3 py-2" dir="ltr">
                                {member.email || "—"}
                              </td>
                              <td className="px-3 py-2">{member.phone || "—"}</td>
                              <td className="px-3 py-2">
                                {member.role
                                  ? ROLE_LABELS[member.role] ?? member.role
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
