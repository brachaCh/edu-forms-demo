import { describe, expect, it } from "vitest";
import {
  FORM_TABLE_DEFS,
  resolveTableRowCount,
  tableCellKey,
} from "./form-table-grids";

describe("kindergarten treatments table", () => {
  const tableId = "kindergarten-treatments";

  it("exposes a named key for every PDF cell", () => {
    expect(tableCellKey(tableId, 0, "gan")).toBe("support_psychologist_gan");
    expect(tableCellKey(tableId, 1, "community")).toBe(
      "support_medical_community"
    );
    expect(tableCellKey(tableId, 2, "kupat_holim")).toBe(
      "support_social_worker_kupat_holim"
    );
    expect(tableCellKey(tableId, 3, "private")).toBe(
      "support_physiotherapist_private"
    );
    expect(tableCellKey(tableId, 4, "frequency")).toBe(
      "support_occupational_frequency"
    );
    expect(tableCellKey(tableId, 5, "duration")).toBe("support_speech_duration");
    expect(tableCellKey(tableId, 6, "gan")).toBe(
      "support_integration_teacher_gan"
    );
    expect(tableCellKey(tableId, 7, "gan")).toBe("support_other_gan");
  });

  it("keeps eight fixed rows matching the official form", () => {
    const def = FORM_TABLE_DEFS[tableId];
    expect(def?.rowKeys).toHaveLength(8);
    expect(def?.rowLabels).toHaveLength(8);
    expect(def?.columns.map((col) => col.key)).toEqual([
      "gan",
      "community",
      "kupat_holim",
      "private",
      "frequency",
      "duration",
    ]);
    expect(resolveTableRowCount(tableId, { ["tbl_kindergarten-treatments_rows"]: "3" })).toBe(
      8
    );
  });
});
