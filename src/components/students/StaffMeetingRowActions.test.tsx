/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffMeetingRowActions } from "./StaffMeetingRowActions";
import { tableCellKey } from "@/lib/form-table-grids";
import type { Student } from "@/lib/supabase/types";

const student = {
  id: "stu-1",
  full_name: "הדסה דהן",
  email: "parent@example.com",
} as Student;

function staffMeetingRowData(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    [tableCellKey("staff-meetings", 0, "date")]: "2026-03-01",
    [tableCellKey("staff-meetings", 0, "participants")]: "מחנכת, יועצת",
    [tableCellKey("staff-meetings", 0, "summary")]: "סיכום ישיבה לבדיקה",
    ...overrides,
  };
}

function Harness({ data }: { data: Record<string, string> }) {
  return (
    <StaffMeetingRowActions student={student} data={data} rowIndex={0} />
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/session")) {
        return new Response(JSON.stringify({ canManageStudents: false }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 404 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StaffMeetingRowActions parent email draft", () => {
  it("keeps textarea edits when parent re-renders with a new data object", async () => {
    const baseData = staffMeetingRowData();
    const { rerender } = render(<Harness data={baseData} />);

    fireEvent.click(screen.getByRole("button", { name: "להורים" }));

    const body = await screen.findByLabelText("תוכן המייל");
    const edited = "טקסט מעודכן על ידי המשתמש";
    fireEvent.change(body, { target: { value: edited } });
    expect((body as HTMLTextAreaElement).value).toBe(edited);

    rerender(<Harness data={{ ...baseData }} />);

    await waitFor(() => {
      expect(
        (screen.getByLabelText("תוכן המייל") as HTMLTextAreaElement).value
      ).toBe(edited);
    });
  });
});
