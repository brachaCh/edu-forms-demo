import { describe, expect, it } from "vitest";
import {
  buildOwnerAckEmail,
  buildReporterAckEmail,
  buildReporterStatusEmail,
} from "./email";

describe("problem-report emails", () => {
  it("builds a Hebrew thank-you with ticket number and report summary", () => {
    const mail = buildReporterAckEmail({
      ticketId: "TZ-42",
      description: "הכפתור לא נשמר",
    });
    expect(mail.subject).toContain("TZ-42");
    expect(mail.text).toContain("TZ-42");
    expect(mail.text).toContain("תודה! הפנייה שלך התקבלה ונמצאת בטיפול");
    expect(mail.text).toContain("הכפתור לא נשמר");
    expect(mail.html).toContain("TZ-42");
    expect(mail.html).toContain("הפנייה שלך התקבלה ונמצאת בטיפול");
    expect(mail.html).toContain("הכפתור לא נשמר");
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain("פרוטוקל");
  });

  it("escapes HTML in the reporter acknowledgement description", () => {
    const mail = buildReporterAckEmail({
      ticketId: "TZ-9",
      description: "<script>alert(1)</script> & foo",
    });
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&amp;");
    expect(mail.html).not.toContain("<script>");
  });

  it("truncates long report text in the reporter acknowledgement", () => {
    const mail = buildReporterAckEmail({
      ticketId: "TZ-7",
      description: "א".repeat(400),
    });
    expect(mail.text.length).toBeLessThan(500);
    expect(mail.text).toContain("…");
    expect(mail.html).toContain("…");
  });

  it("omits the ticket block when no ticket id is available", () => {
    const mail = buildReporterAckEmail({
      ticketId: null,
      description: "בעיה קטנה",
    });
    expect(mail.subject).not.toContain("TZ-");
    expect(mail.text).not.toContain("מספר פנייה:");
    expect(mail.text).toContain("בעיה קטנה");
  });

  it("includes the ticket number and report details in Giti's copy", () => {
    const mail = buildOwnerAckEmail({
      ticketId: "TZ-42",
      reporterEmail: "teacher@school.il",
      description: "הכפתור לא נשמר",
      pagePath: "/personal-area/students/:id",
      browser: "Mozilla/5.0 Test",
    });
    expect(mail.subject).toContain("TZ-42");
    expect(mail.text).toContain("TZ-42");
    expect(mail.text).toContain("teacher@school.il");
    expect(mail.text).toContain("הכפתור לא נשמר");
    expect(mail.text).toContain("/personal-area/students/:id");
    expect(mail.text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(mail.html).toContain("TZ-42");
    expect(mail.html).not.toContain("<script>");
  });

  it("escapes HTML in the description", () => {
    const mail = buildOwnerAckEmail({
      ticketId: "TZ-7",
      reporterEmail: "a@b.com",
      description: '<img src=x onerror="alert(1)">',
      pagePath: null,
      browser: null,
    });
    expect(mail.html).toContain("&lt;img src=x");
    expect(mail.html).not.toContain("<img src=x");
  });

  it("includes the ticket number in later status emails", () => {
    const mail = buildReporterStatusEmail({
      ticketId: "TZ-42",
      statusLabel: "טופל",
    });
    expect(mail.subject).toContain("TZ-42");
    expect(mail.text).toContain("TZ-42");
    expect(mail.text).toContain("טופל");
    expect(mail.html).toContain("TZ-42");
  });
});
