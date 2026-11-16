import { describe, expect, it } from "vitest";
import {
  ARCHIVE_RETENTION_YEARS,
  archiveRetentionCutoff,
  isArchivePastRetention,
} from "./archive-retention";

describe("archive-retention", () => {
  it("uses 8 year retention", () => {
    expect(ARCHIVE_RETENTION_YEARS).toBe(8);
  });

  it("computes cutoff 8 years before now", () => {
    const now = new Date("2030-06-15T12:00:00.000Z");
    expect(archiveRetentionCutoff(now).toISOString()).toBe(
      "2022-06-15T12:00:00.000Z"
    );
  });

  it("detects documents past retention", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    expect(isArchivePastRetention("2021-01-01T00:00:00.000Z", now)).toBe(true);
    expect(isArchivePastRetention("2023-01-01T00:00:00.000Z", now)).toBe(false);
    expect(isArchivePastRetention(null, now)).toBe(false);
  });
});
