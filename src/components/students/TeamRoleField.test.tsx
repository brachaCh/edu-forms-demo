// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TeamRoleField } from "@/components/students/TeamRoleField";
import { TEAM_ROLE_OTHER_VALUE } from "@/lib/team-role-field";

describe("TeamRoleField (TZ-204 typing)", () => {
  afterEach(() => cleanup());

  it("keeps spaces while typing in אחר mode", () => {
    const onChange = vi.fn();
    render(
      <TeamRoleField
        value={TEAM_ROLE_OTHER_VALUE}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText("תפקיד — פירוט");
    fireEvent.change(input, { target: { value: "מטפלת " } });
    expect(onChange).toHaveBeenLastCalledWith("מטפלת ");
    expect((input as HTMLInputElement).value).toBe("מטפלת ");

    fireEvent.change(input, { target: { value: "מטפלת רגשית" } });
    expect(onChange).toHaveBeenLastCalledWith("מטפלת רגשית");
    expect((input as HTMLInputElement).value).toBe("מטפלת רגשית");
  });

  it("stays in אחר mode when typing a preset word like סייעת", () => {
    const onChange = vi.fn();
    render(
      <TeamRoleField
        value={TEAM_ROLE_OTHER_VALUE}
        onChange={onChange}
      />
    );

    const select = screen.getByRole("combobox");
    const input = screen.getByLabelText("תפקיד — פירוט");

    fireEvent.change(input, { target: { value: "סייעת" } });
    expect((select as HTMLSelectElement).value).toBe(TEAM_ROLE_OTHER_VALUE);
    expect(input).not.toBeNull();
    expect(onChange).toHaveBeenLastCalledWith("סייעת");
  });

  it("empty value shows — without free-text box", () => {
    render(<TeamRoleField value="" onChange={vi.fn()} />);
    const select = screen.getByRole("combobox");
    expect((select as HTMLSelectElement).value).toBe("");
    expect(screen.queryByLabelText("תפקיד — פירוט")).toBeNull();
  });

  it("selecting — clears role and stays on —", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TeamRoleField value="מחנכת" onChange={onChange} />
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
    rerender(<TeamRoleField value="" onChange={onChange} />);
    expect((select as HTMLSelectElement).value).toBe("");
    expect(screen.queryByLabelText("תפקיד — פירוט")).toBeNull();
  });

  it("staff-card flow: אחר does not commit on select blur; saves after typing", async () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(
      <TeamRoleField value="" onChange={onChange} onBlur={onBlur} />
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: TEAM_ROLE_OTHER_VALUE } });
    expect(onBlur).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    const input = screen.getByLabelText("תפקיד — פירוט");
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    fireEvent.change(input, { target: { value: "מטפלת רגשית" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("מטפלת רגשית");
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenLastCalledWith("מטפלת רגשית");
  });

  it("commits preset to onBlur with the chosen value", () => {
    const onBlur = vi.fn();
    render(<TeamRoleField value="" onChange={vi.fn()} onBlur={onBlur} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "סייעת" } });
    expect(onBlur).toHaveBeenCalledWith("סייעת");
  });
});