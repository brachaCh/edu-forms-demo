import { describe, expect, it } from "vitest";
import type { Student } from "@/lib/supabase/types";
import {
  INTEGRATION_RENEWAL_ALERT_LEAD_DAYS,
  INTEGRATION_RENEWAL_PERIOD_YEARS,
  formatIntegrationDateForDisplay,
  formatIsoDateOnly,
  integrationRenewalAlertStartDate,
  integrationRenewalDueDate,
  parseIsoDateOnly,
  studentIntegrationRenewalIsOverdue,
  studentNeedsIntegrationRenewalAlert,
  studentsNeedingIntegrationRenewal,
} from "@/lib/integration-renewal";

function student(
  overrides: Partial<Student> = {}
): Pick<Student, "id" | "full_name" | "status" | "integration_start_date" | "archived_at"> {
  return {
    id: "s1",
    full_name: "יוסי כהן",
    status: "integration",
    integration_start_date: "2023-06-15",
    archived_at: null,
    ...overrides,
  };
}

describe("integration renewal constants", () => {
  it("keeps a single named lead-time constant at 60 days and a 3-year period", () => {
    expect(INTEGRATION_RENEWAL_PERIOD_YEARS).toBe(3);
    expect(INTEGRATION_RENEWAL_ALERT_LEAD_DAYS).toBe(60);
  });
});

describe("parseIsoDateOnly", () => {
  it("accepts YYYY-MM-DD and rejects junk", () => {
    expect(formatIsoDateOnly(parseIsoDateOnly("2023-06-15")!)).toBe("2023-06-15");
    expect(parseIsoDateOnly("15/06/2023")).toBeNull();
    expect(parseIsoDateOnly("")).toBeNull();
    expect(parseIsoDateOnly(null)).toBeNull();
    expect(parseIsoDateOnly("2023-13-40")).toBeNull();
  });
});

describe("integration renewal date math", () => {
  it("due date is exactly 3 years after entry", () => {
    expect(formatIsoDateOnly(integrationRenewalDueDate("2023-06-15")!)).toBe(
      "2026-06-15"
    );
    expect(formatIsoDateOnly(integrationRenewalDueDate("2020-02-29")!)).toBe(
      "2023-02-28"
    );
  });

  it("alert starts INTEGRATION_RENEWAL_ALERT_LEAD_DAYS before the 3-year mark", () => {
    // 2026-06-15 minus 60 days = 2026-04-16
    expect(
      formatIsoDateOnly(integrationRenewalAlertStartDate("2023-06-15")!)
    ).toBe("2026-04-16");
  });

  it("returns null without a usable entry date", () => {
    expect(integrationRenewalDueDate(null)).toBeNull();
    expect(integrationRenewalAlertStartDate("not-a-date")).toBeNull();
  });
});

describe("studentNeedsIntegrationRenewalAlert", () => {
  const today = new Date(2026, 4, 1); // 2026-05-01 — inside the 60-day window

  it("alerts when today is on or after the lead-time start", () => {
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ integration_start_date: "2023-06-15" }),
        today
      )
    ).toBe(true);
  });

  it("does not alert before the lead-time window", () => {
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ integration_start_date: "2023-06-15" }),
        new Date(2026, 3, 15) // 2026-04-15 — one day before 2026-04-16
      )
    ).toBe(false);
  });

  it("alerts on the first day of the window", () => {
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ integration_start_date: "2023-06-15" }),
        new Date(2026, 3, 16)
      )
    ).toBe(true);
  });

  it("keeps alerting after the 3-year mark (overdue)", () => {
    const overdueDay = new Date(2026, 6, 1); // 2026-07-01
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ integration_start_date: "2023-06-15" }),
        overdueDay
      )
    ).toBe(true);
    expect(
      studentIntegrationRenewalIsOverdue(
        student({ integration_start_date: "2023-06-15" }),
        overdueDay
      )
    ).toBe(true);
  });

  it("does not treat a day inside the window as overdue", () => {
    expect(
      studentIntegrationRenewalIsOverdue(
        student({ integration_start_date: "2023-06-15" }),
        today
      )
    ).toBe(false);
  });

  it("does not alert without an entry date, for other statuses, or archived students", () => {
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ integration_start_date: null }),
        today
      )
    ).toBe(false);
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ status: "personal-basket" }),
        today
      )
    ).toBe(false);
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ status: "special-ed-class" }),
        today
      )
    ).toBe(false);
    expect(
      studentNeedsIntegrationRenewalAlert(
        student({ archived_at: "2026-01-01T00:00:00.000Z" }),
        today
      )
    ).toBe(false);
  });
});

describe("studentsNeedingIntegrationRenewal", () => {
  it("returns only visible integration students in the alert window", () => {
    const today = new Date(2026, 4, 1);
    const list = studentsNeedingIntegrationRenewal(
      [
        student({ id: "due", full_name: "צריך חידוש" }),
        student({
          id: "fresh",
          full_name: "חדש",
          integration_start_date: "2025-09-01",
        }),
        student({
          id: "basket",
          status: "personal-basket",
          full_name: "סל אישי",
        }),
      ],
      today
    );
    expect(list.map((s) => s.id)).toEqual(["due"]);
  });
});

describe("formatIntegrationDateForDisplay", () => {
  it("formats ISO dates as dd/mm/yyyy", () => {
    expect(formatIntegrationDateForDisplay("2023-06-15")).toBe("15/06/2023");
    expect(formatIntegrationDateForDisplay(null)).toBe("");
  });
});
