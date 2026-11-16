import { describe, it, expect } from "vitest";
import {
  findRequestsDueForReminder,
  SignatureRequestForReminder,
  REMINDER_INTERVAL_DAYS,
  MAX_AUTO_REMINDERS,
} from "./external-signature-reminder-logic";

function makeRequest(
  overrides: Partial<SignatureRequestForReminder> = {}
): SignatureRequestForReminder {
  return {
    id: "req-1",
    student_id: "student-1",
    document_id: "doc-1",
    document_name: "תל״א",
    recipient_email: "parent@example.com",
    signer_label: "הורה",
    institution_id: "inst-1",
    created_at: "2026-01-01T10:00:00Z",
    auto_reminder_count: 0,
    last_reminder_at: null,
    expires_at: "2026-01-15T10:00:00Z",
    ...overrides,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("findRequestsDueForReminder", () => {
  const baseDate = new Date("2026-01-01T10:00:00Z");

  it("returns empty array when no requests", () => {
    const result = findRequestsDueForReminder([], baseDate);
    expect(result).toEqual([]);
  });

  it("skips request created less than 3 days ago", () => {
    const req = makeRequest({ created_at: baseDate.toISOString() });
    const now = addDays(baseDate, 2);
    const result = findRequestsDueForReminder([req], now);
    expect(result).toEqual([]);
  });

  it("includes request created exactly 3 days ago", () => {
    const req = makeRequest({ created_at: baseDate.toISOString() });
    const now = addDays(baseDate, REMINDER_INTERVAL_DAYS);
    const result = findRequestsDueForReminder([req], now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("req-1");
  });

  it("includes request created more than 3 days ago", () => {
    const req = makeRequest({ created_at: baseDate.toISOString() });
    const now = addDays(baseDate, 5);
    const result = findRequestsDueForReminder([req], now);
    expect(result).toHaveLength(1);
  });

  it("skips request with last_reminder_at less than 3 days ago", () => {
    const reminderDate = addDays(baseDate, 3);
    const req = makeRequest({
      created_at: baseDate.toISOString(),
      auto_reminder_count: 1,
      last_reminder_at: reminderDate.toISOString(),
    });
    const now = addDays(reminderDate, 2);
    const result = findRequestsDueForReminder([req], now);
    expect(result).toEqual([]);
  });

  it("includes request with last_reminder_at exactly 3 days ago", () => {
    const reminderDate = addDays(baseDate, 3);
    const req = makeRequest({
      created_at: baseDate.toISOString(),
      auto_reminder_count: 1,
      last_reminder_at: reminderDate.toISOString(),
    });
    const now = addDays(reminderDate, REMINDER_INTERVAL_DAYS);
    const result = findRequestsDueForReminder([req], now);
    expect(result).toHaveLength(1);
  });

  it("skips request that already received max reminders", () => {
    const req = makeRequest({
      created_at: baseDate.toISOString(),
      auto_reminder_count: MAX_AUTO_REMINDERS,
      last_reminder_at: addDays(baseDate, 9).toISOString(),
    });
    const now = addDays(baseDate, 20);
    const result = findRequestsDueForReminder([req], now);
    expect(result).toEqual([]);
  });

  it("includes request with 2 reminders due for third", () => {
    const lastReminder = addDays(baseDate, 6);
    const req = makeRequest({
      created_at: baseDate.toISOString(),
      auto_reminder_count: 2,
      last_reminder_at: lastReminder.toISOString(),
    });
    const now = addDays(lastReminder, REMINDER_INTERVAL_DAYS);
    const result = findRequestsDueForReminder([req], now);
    expect(result).toHaveLength(1);
  });

  it("filters mixed batch correctly", () => {
    const requests = [
      makeRequest({ id: "too-recent", created_at: baseDate.toISOString() }),
      makeRequest({
        id: "due",
        created_at: addDays(baseDate, -5).toISOString(),
      }),
      makeRequest({
        id: "maxed-out",
        created_at: addDays(baseDate, -15).toISOString(),
        auto_reminder_count: MAX_AUTO_REMINDERS,
        last_reminder_at: addDays(baseDate, -3).toISOString(),
      }),
      makeRequest({
        id: "reminder-too-recent",
        created_at: addDays(baseDate, -10).toISOString(),
        auto_reminder_count: 1,
        last_reminder_at: addDays(baseDate, -1).toISOString(),
      }),
      makeRequest({
        id: "reminder-due",
        created_at: addDays(baseDate, -10).toISOString(),
        auto_reminder_count: 1,
        last_reminder_at: addDays(baseDate, -4).toISOString(),
      }),
    ];

    const result = findRequestsDueForReminder(requests, baseDate);
    const ids = result.map((r) => r.id);
    expect(ids).toEqual(["due", "reminder-due"]);
  });
});
