// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudentCoreFieldsOnCard } from "@/components/students/StudentCoreFieldsOnCard";
import { CardFieldOrderProvider } from "@/components/students/CardFieldOrderContext";
import { TEAM_ROLE_OTHER_VALUE } from "@/lib/team-role-field";
import type { Student } from "@/lib/supabase/types";

const updateStudent = vi.fn();
const rememberStudentForForms = vi.fn();

vi.mock("@/lib/mock-store", () => ({
  updateStudent: (...args: unknown[]) => updateStudent(...args),
  rememberStudentForForms: (...args: unknown[]) => rememberStudentForForms(...args),
  getHiddenCoreFields: () => [],
}));

vi.mock("@/components/editable/EditableText", () => ({
  EditableText: ({ path }: { path: string }) => <span>{path}</span>,
}));

const staffStudent: Student = {
  id: "staff-1",
  institution_id: "inst-1",
  category: "schools",
  full_name: "Staff Member",
  phone: null,
  father_name: null,
  mother_name: null,
  status: "integration-teacher",
  class_name: null,
  teacher_name: null,
  notes: null,
  role: "",
  created_at: "",
  updated_at: "",
};

function renderStaffCard(student: Student = staffStudent) {
  return render(
    <CardFieldOrderProvider
      studentId={student.id}
      status={student.status}
      category={student.category}
    >
      <StudentCoreFieldsOnCard
        student={student}
        onStudentChange={vi.fn()}
      />
    </CardFieldOrderProvider>
  );
}

function openRoleEdit() {
  const rolePath = screen.getByText("studentFields.role");
  const card = rolePath.closest(".rounded-lg");
  if (!card) throw new Error("role card not found");
  const edit = card.querySelector('[aria-label="עריכה"]');
  if (!edit) throw new Error("edit button not found");
  fireEvent.click(edit);
}

describe("StudentCoreFieldsOnCard staff role (TZ-204)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves preset role when selected from dropdown", async () => {
    updateStudent.mockResolvedValue({ ...staffStudent, role: "סייעת" });
    renderStaffCard();
    openRoleEdit();

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "סייעת" } });

    await waitFor(() => {
      expect(updateStudent).toHaveBeenCalledWith(
        "staff-1",
        expect.objectContaining({ role: "סייעת" })
      );
    });
  });

  it("saves trimmed custom text after אחר + blur", async () => {
    updateStudent.mockResolvedValue({
      ...staffStudent,
      role: "מטפלת רגשית",
    });
    renderStaffCard();
    openRoleEdit();

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: TEAM_ROLE_OTHER_VALUE } });
    const input = screen.getByLabelText("תפקיד — פירוט");
    fireEvent.change(input, {
      target: { value: "  מטפלת רגשית  " },
    });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateStudent).toHaveBeenCalledWith(
        "staff-1",
        expect.objectContaining({ role: "מטפלת רגשית" })
      );
    });
  });
});