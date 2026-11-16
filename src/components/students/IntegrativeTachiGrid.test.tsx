// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntegrativeTachiGrid } from "@/components/students/IntegrativeTachiGrid";
import { INTEGRATIVE_COL_OTHER_KEY } from "@/lib/integrative-tachi-defs";

describe("IntegrativeTachiGrid column headers (TZ-204)", () => {
  afterEach(() => cleanup());

  it("persists a custom label for the אחר column", () => {
    const onChange = vi.fn();
    render(
      <IntegrativeTachiGrid
        fields={[{ key: "full_name", label: "שם", type: "text" }]}
        data={{ full_name: "דנה" }}
        onChange={onChange}
        fieldLabel={(f) => f.label ?? ""}
      />
    );

    const header = screen.getByLabelText("כותרת עמודת אחר");
    fireEvent.change(header, { target: { value: "מטפלת רגשית" } });
    expect(onChange).toHaveBeenLastCalledWith(
      INTEGRATIVE_COL_OTHER_KEY,
      "מטפלת רגשית"
    );
  });

  it("round-trips a saved אחר column label into the header input", () => {
    render(
      <IntegrativeTachiGrid
        fields={[{ key: "full_name", label: "שם", type: "text" }]}
        data={{
          full_name: "דנה",
          [INTEGRATIVE_COL_OTHER_KEY]: "מטפלת רגשית",
        }}
        onChange={vi.fn()}
        fieldLabel={(f) => f.label ?? ""}
      />
    );

    const header = screen.getByLabelText(
      "כותרת עמודת אחר"
    ) as HTMLInputElement;
    expect(header.value).toBe("מטפלת רגשית");
  });

  it("styles empty column header as editable placeholder, not static header", () => {
    render(
      <IntegrativeTachiGrid
        fields={[{ key: "full_name", label: "שם", type: "text" }]}
        data={{ full_name: "דנה" }}
        onChange={vi.fn()}
        fieldLabel={(f) => f.label ?? ""}
      />
    );

    const header = screen.getByLabelText("כותרת עמודת אחר");
    expect(header.className).toContain("border-slate-300");
    expect(header.className).not.toContain("border-transparent");
    expect(header.className).toContain("font-normal");
    expect(header.className).not.toContain("placeholder:font-bold");
  });
});