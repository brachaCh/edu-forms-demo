"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardCounts {
  totalInstitutions: number;
  totalUsers: number;
  activeSubscriptions: number;
  expiringSubscriptions: number;
  expiredSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantClasses = {
    default: "border-brand-200 bg-white",
    success: "border-emerald-200 bg-emerald-50",
    warning: "border-amber-200 bg-amber-50",
    danger: "border-red-200 bg-red-50",
  };
  const iconClasses = {
    default: "text-brand-600",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border p-5 shadow-sm",
        variantClasses[variant]
      )}
    >
      <div className={cn("rounded-xl bg-white/80 p-3", iconClasses[variant])}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="text-sm text-pink">{label}</div>
      </div>
    </div>
  );
}

export function PlatformAdminDashboard() {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/platform-admin/dashboard");
      if (!response.ok) {
        throw new Error("LOAD_FAILED");
      }
      const data = await response.json();
      setCounts(data.counts);
    } catch {
      setError("לא ניתן לטעון את הנתונים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink">לוח בקרה</h1>
            <p className="text-sm text-pink">סקירת מצב המערכת</p>
          </div>
        </div>
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
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && !counts && (
        <div className="rounded-2xl border border-brand-200 bg-white p-8 text-center text-pink">
          טוען נתונים...
        </div>
      )}

      {counts && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="מוסדות"
              value={counts.totalInstitutions}
              icon={Building2}
            />
            <StatCard
              label="משתמשים"
              value={counts.totalUsers}
              icon={Users}
            />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-bold text-ink">סטטוס מנויים</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="מנויים פעילים"
                value={counts.activeSubscriptions}
                icon={CheckCircle}
                variant="success"
              />
              <StatCard
                label="מנויים עומדים לפוג (30 יום)"
                value={counts.expiringSubscriptions}
                icon={Clock}
                variant="warning"
              />
              <StatCard
                label="מנויים שפגו"
                value={counts.expiredSubscriptions}
                icon={AlertTriangle}
                variant="danger"
              />
              <StatCard
                label="ממתינים לתשלום"
                value={counts.pendingSubscriptions}
                icon={Package}
              />
              <StatCard
                label="מנויים מבוטלים"
                value={counts.cancelledSubscriptions}
                icon={AlertTriangle}
                variant="danger"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
