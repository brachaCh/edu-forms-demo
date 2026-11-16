import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberAccessContext } from "@/lib/server-tenant-data";

type Row = Record<string, unknown>;

type Store = {
  students: Row[];
  memberships: Row[];
  meetings: Row[];
  invitees: Row[];
};

function createStoreClient(store: Store) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let insertPayload: unknown = null;
      let updatePayload: unknown = null;
      let isDelete = false;

      const tableRows = (): Row[] => {
        if (table === "students") return store.students;
        if (table === "user_institutions") return store.memberships;
        if (table === "staff_meetings") return store.meetings;
        if (table === "staff_meeting_invitees") return store.invitees;
        return [];
      };

      const matches = (row: Row): boolean => {
        for (const [key, value] of Object.entries(filters)) {
          if (row[key] !== value) return false;
        }
        for (const [key, values] of Object.entries(inFilters)) {
          if (!values.includes(row[key] as never)) return false;
        }
        return true;
      };

      const finish = () => {
        const rows = tableRows();
        if (isDelete) {
          const next = rows.filter((row) => !matches(row));
          if (table === "staff_meetings") {
            const removedIds = rows
              .filter((row) => matches(row))
              .map((row) => row.id);
            store.meetings.splice(0, store.meetings.length, ...next);
            store.invitees = store.invitees.filter(
              (invitee) => !removedIds.includes(invitee.meeting_id)
            );
          } else {
            rows.splice(0, rows.length, ...next);
          }
          return { data: null, error: null };
        }
        if (insertPayload) {
          const items = Array.isArray(insertPayload)
            ? insertPayload
            : [insertPayload];
          const created = items.map((item, index) => ({
            id: (item as Row).id ?? `${table}-${rows.length + index + 1}`,
            sent_at: null,
            created_at: "2026-01-01T00:00:00Z",
            ...(item as Row),
          }));
          rows.push(...created);
          return { data: created, error: null };
        }
        if (updatePayload) {
          for (const row of rows) {
            if (matches(row)) Object.assign(row, updatePayload);
          }
          return { data: rows.filter(matches), error: null };
        }
        return { data: rows.filter(matches), error: null };
      };

      const builder: Record<string, unknown> = {
        select: vi.fn().mockImplementation(() => builder),
        insert: vi.fn().mockImplementation((payload: unknown) => {
          insertPayload = payload;
          return builder;
        }),
        update: vi.fn().mockImplementation((payload: unknown) => {
          updatePayload = payload;
          return builder;
        }),
        delete: vi.fn().mockImplementation(() => {
          isDelete = true;
          return builder;
        }),
        eq: vi.fn().mockImplementation((col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        }),
        in: vi.fn().mockImplementation((col: string, vals: unknown[]) => {
          inFilters[col] = vals;
          return builder;
        }),
        gt: vi.fn().mockImplementation(() => builder),
        order: vi.fn().mockImplementation(() => builder),
        maybeSingle: vi.fn().mockImplementation(async () => {
          const { data, error } = finish();
          const list = Array.isArray(data) ? data : data ? [data] : [];
          return { data: list[0] ?? null, error };
        }),
        single: vi.fn().mockImplementation(async () => {
          const { data, error } = finish();
          const list = Array.isArray(data) ? data : data ? [data] : [];
          return { data: list[0] ?? null, error };
        }),
        then: (resolve: (value: { data: unknown; error: null }) => void) => {
          resolve(finish());
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "@/lib/supabase/admin";
import {
  createStaffMeetingWithInvites,
  listInstitutionStaffForInvite,
} from "./staff-meetings-server";

const INST = "inst-1";
const OWNER_CTX: MemberAccessContext = {
  userId: "owner-1",
  institutionId: INST,
  membershipRole: "owner",
};

const futureAt = "2099-06-01T07:00:00.000Z";

function seedStore(): Store {
  return {
    students: [
      {
        id: "s-active",
        institution_id: INST,
        status: "integration-teacher",
        full_name: "רחל פעילה",
        email: "rachel@school.il",
        role: "יועצת",
        user_profile_id: "user-active",
        archived_at: null,
      },
      {
        id: "s-unlinked",
        institution_id: INST,
        status: "integration-teacher",
        full_name: "מורה חדשה",
        email: "new@school.il",
        role: "מורה",
        user_profile_id: null,
        archived_at: null,
      },
      {
        id: "s-archived",
        institution_id: INST,
        status: "integration-teacher",
        full_name: "בארכיון",
        email: "old@school.il",
        role: "מורה",
        user_profile_id: "user-active",
        archived_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "s-left",
        institution_id: INST,
        status: "integration-teacher",
        full_name: "עזבה",
        email: "left@school.il",
        role: "מורה",
        user_profile_id: "user-left",
        archived_at: null,
      },
    ],
    memberships: [{ user_id: "user-active", institution_id: INST }],
    meetings: [],
    invitees: [],
  };
}

describe("listInstitutionStaffForInvite", () => {
  let store: Store;

  beforeEach(() => {
    store = seedStore();
    vi.mocked(createServiceClient).mockImplementation(
      () => createStoreClient(store) as never
    );
  });

  it("excludes archived staff cards and cards whose user left the institution", async () => {
    const staff = await listInstitutionStaffForInvite(INST, OWNER_CTX);
    expect(staff.map((s) => s.id).sort()).toEqual(
      ["s-active", "s-unlinked"].sort()
    );
  });
});

describe("createStaffMeetingWithInvites rollback", () => {
  let store: Store;

  beforeEach(() => {
    store = seedStore();
    vi.mocked(createServiceClient).mockImplementation(
      () => createStoreClient(store) as never
    );
  });

  it("rolls back the meeting when every email fails so a retry does not duplicate", async () => {
    const input = {
      title: "ישיבת צוות",
      meetingAt: futureAt,
      invitationSubject: "הזמנה לישיבת צוות",
      invitationText: "שלום רב,\nמוזמנת לישיבת צוות ביום שלישי.",
      staffStudentIds: ["s-active"],
    };

    await expect(
      createStaffMeetingWithInvites(INST, OWNER_CTX, input, async () => ({
        sent: false,
      }))
    ).rejects.toThrow("EMAIL_SEND_FAILED");
    expect(store.meetings).toHaveLength(0);
    expect(store.invitees).toHaveLength(0);

    await expect(
      createStaffMeetingWithInvites(INST, OWNER_CTX, input, async () => ({
        sent: false,
      }))
    ).rejects.toThrow("EMAIL_SEND_FAILED");
    expect(store.meetings).toHaveLength(0);

    const ok = await createStaffMeetingWithInvites(
      INST,
      OWNER_CTX,
      input,
      async () => ({ sent: true })
    );
    expect(ok.sentTo).toEqual(["rachel@school.il"]);
    expect(store.meetings).toHaveLength(1);
    expect(store.invitees).toHaveLength(1);
  });

  it("rejects archived and non-member recipients when validating", async () => {
    await expect(
      createStaffMeetingWithInvites(
        INST,
        OWNER_CTX,
        {
          title: "ישיבת צוות",
          meetingAt: futureAt,
          invitationSubject: "הזמנה לישיבת צוות",
          invitationText: "שלום רב,\nמוזמנת לישיבת צוות ביום שלישי.",
          staffStudentIds: ["s-archived"],
        },
        async () => ({ sent: true })
      )
    ).rejects.toThrow("INVALID_INVITEES");
    await expect(
      createStaffMeetingWithInvites(
        INST,
        OWNER_CTX,
        {
          title: "ישיבת צוות",
          meetingAt: futureAt,
          invitationSubject: "הזמנה לישיבת צוות",
          invitationText: "שלום רב,\nמוזמנת לישיבת צוות ביום שלישי.",
          staffStudentIds: ["s-left"],
        },
        async () => ({ sent: true })
      )
    ).rejects.toThrow("INVALID_INVITEES");
    expect(store.meetings).toHaveLength(0);
  });
});
