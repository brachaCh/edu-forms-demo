import { describe, expect, it } from "vitest";
import {
  currentCalendarYear,
  formatHebrewYear,
  parseCalendarYear,
} from "@/lib/calendar-year";

describe("calendar-year Hebrew", () => {
  it("formats Hebrew years with gershayim", () => {
    expect(formatHebrewYear(5786)).toBe('תשפ"ו');
    expect(formatHebrewYear(5785)).toBe('תשפ"ה');
    expect(formatHebrewYear(5787)).toBe('תשפ"ז');
    expect(formatHebrewYear(5788)).toBe('תשפ"ח');
    expect(formatHebrewYear(5780)).toBe("תש\"פ");
  });

  it("parses Hebrew years and migrates legacy Gregorian", () => {
    expect(parseCalendarYear(5786)).toBe(5786);
    expect(parseCalendarYear(2026)).toBe(5786);
    expect(parseCalendarYear("2025")).toBe(5785);
    expect(parseCalendarYear(null)).toBeNull();
  });

  it("uses school year from August (תשפ״ז in Aug 2026)", () => {
    expect(currentCalendarYear(new Date(2026, 7, 31))).toBe(5787);
    expect(currentCalendarYear(new Date(2026, 6, 31))).toBe(5786);
    expect(formatHebrewYear(currentCalendarYear(new Date(2026, 7, 31)))).toBe(
      'תשפ"ז'
    );
  });
});
