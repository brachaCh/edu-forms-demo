"use client";

import { useEffect, useState } from "react";
import { UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cacheAuthenticatedUser } from "@/lib/mock-store";
import type { UserProfile } from "@/lib/supabase/types";

interface InstitutionMember {
  id: string;
  full_name: string;
  email: string;
  is_institution_owner: boolean;
}

export function TransferOwnershipPanel() {
  const [visible, setVisible] = useState(false);
  const [members, setMembers] = useState<InstitutionMember[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await fetch("/api/auth/session");
        if (!session.ok) return;
        const data = (await session.json()) as { profile?: UserProfile | null };
        if (cancelled || data.profile?.is_institution_owner !== true) return;

        const response = await fetch("/api/institutions/members");
        if (!response.ok) return;
        const body = (await response.json()) as { members?: InstitutionMember[] };
        if (cancelled) return;
        const others = (body.members ?? []).filter(
          (member) => member.id !== data.profile?.id
        );
        setMembers(others);
        setVisible(true);
      } catch {
        // בלי רשימת משתמשים אין מה להציג
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  if (done) {
    return (
      <section className="menu-box p-4 text-sm text-brand-800">
        הבעלות הועברה. מעכשיו רק המשתמש שנבחר הוא בעל המוסד.
      </section>
    );
  }

  const selected = members.find((member) => member.id === selectedId);

  async function transfer() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/institutions/transfer-ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedId }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        if (body.error === "NOT_FOUND") {
          setError("המשתמש לא רשום למוסד הזה.");
        } else {
          setError("העברת הבעלות נכשלה. נסו שוב.");
        }
        setConfirming(false);
        return;
      }

      const session = await fetch("/api/auth/session");
      if (session.ok) {
        const data = (await session.json()) as { profile?: UserProfile | null };
        if (data.profile) cacheAuthenticatedUser(data.profile);
      }
      setDone(true);
    } catch {
      setError("העברת הבעלות נכשלה. נסו שוב.");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="menu-box flex flex-col gap-3 p-4 text-start">
      <div className="flex items-center gap-2 text-base font-bold text-ink">
        <UserRoundCog className="h-5 w-5 text-brand-700" />
        העברת בעלות על המוסד
      </div>
      <p className="text-sm text-brand-800">
        הבעלות עוברת למשתמש אחר שכבר רשום למוסד. אחרי ההעברה רק הוא יוכל להזמין
        מורות ולעדכן את פרטי המוסד.
      </p>

      {members.length === 0 ? (
        <p className="text-sm text-brand-700">
          אין עדיין משתמשים נוספים במוסד. אפשר להזמין מורה, ואחרי שהיא נרשמת
          להעביר אליה את הבעלות.
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="ownership-target">משתמש במוסד</Label>
            <select
              id="ownership-target"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setConfirming(false);
                setError(null);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">בחרו משתמש</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name} ({member.email})
                </option>
              ))}
            </select>
          </div>
          {confirming ? (
            <Button
              type="button"
              size="lg"
              disabled={saving || !selected}
              onClick={() => void transfer()}
            >
              {saving
                ? "מעביר..."
                : `אישור העברה אל ${selected?.full_name ?? ""}`}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={!selectedId}
              onClick={() => setConfirming(true)}
            >
              העברת בעלות
            </Button>
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}
    </section>
  );
}
