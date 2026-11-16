import { describe, expect, it } from "vitest";
import {
  bugIdFromUnknown,
  bugNumberFromTicketId,
  normalizeTzavtaTicketId,
  ticketIdFromUnknown,
} from "./ticket-id";

describe("normalizeTzavtaTicketId", () => {
  it("formats TZ-n from strings and numbers", () => {
    expect(normalizeTzavtaTicketId("TZ-12")).toBe("TZ-12");
    expect(normalizeTzavtaTicketId("tz-12")).toBe("TZ-12");
    expect(normalizeTzavtaTicketId("12")).toBe("TZ-12");
    expect(normalizeTzavtaTicketId(12)).toBe("TZ-12");
  });

  it("rejects junk and internal bug ids", () => {
    expect(normalizeTzavtaTicketId("")).toBeNull();
    expect(normalizeTzavtaTicketId("TZ-")).toBeNull();
    expect(normalizeTzavtaTicketId("BUG-12")).toBeNull();
    expect(normalizeTzavtaTicketId("bug-2510201613-12")).toBeNull();
    expect(normalizeTzavtaTicketId(0)).toBeNull();
  });
});

describe("bugNumberFromTicketId", () => {
  it("reads the TZ-n number", () => {
    expect(bugNumberFromTicketId("TZ-18")).toBe(18);
    expect(bugNumberFromTicketId("tz-18")).toBe(18);
    expect(bugNumberFromTicketId("18")).toBe(18);
  });

  it("rejects an internal bugs.id", () => {
    expect(bugNumberFromTicketId("bug-2510201613-18")).toBeNull();
  });
});

describe("ticketIdFromUnknown", () => {
  it("reads common Tzavta payload shapes", () => {
    expect(ticketIdFromUnknown("TZ-9")).toBe("TZ-9");
    expect(ticketIdFromUnknown({ id: "TZ-9" })).toBe("TZ-9");
    expect(ticketIdFromUnknown({ ticket_id: 9 })).toBe("TZ-9");
    expect(ticketIdFromUnknown({ bug_number: 9 })).toBe("TZ-9");
    expect(ticketIdFromUnknown({ bugNumber: "9" })).toBe("TZ-9");
    expect(ticketIdFromUnknown({ code: "TZ-9" })).toBeNull();
  });
});

describe("bugIdFromUnknown", () => {
  it("extracts bug_id from plain string", () => {
    expect(bugIdFromUnknown("bug-2610210847-21")).toBe("bug-2610210847-21");
    expect(bugIdFromUnknown("bug-2610211250-42")).toBe("bug-2610211250-42");
  });

  it("extracts bug_id from object with bug_id property", () => {
    expect(bugIdFromUnknown({ bug_id: "bug-2610210847-21" })).toBe("bug-2610210847-21");
    expect(bugIdFromUnknown({ ticket_id: "TZ-21", bug_id: "bug-2610210847-21", bug_number: 21 })).toBe("bug-2610210847-21");
  });

  it("returns null for invalid inputs", () => {
    expect(bugIdFromUnknown("TZ-21")).toBeNull();
    expect(bugIdFromUnknown({ ticket_id: "TZ-21" })).toBeNull();
    expect(bugIdFromUnknown(null)).toBeNull();
    expect(bugIdFromUnknown(undefined)).toBeNull();
    expect(bugIdFromUnknown(123)).toBeNull();
  });
});
