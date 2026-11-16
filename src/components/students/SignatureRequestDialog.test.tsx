/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignatureRequestDialog } from "./SignatureRequestDialog";
import { WAIVER_SAME_EMAIL_WARNING } from "@/lib/waiver-signer-status";

afterEach(() => {
  cleanup();
});

describe("SignatureRequestDialog same-inbox warning", () => {
  it("warns when father and mother emails are the same address", async () => {
    render(
      <SignatureRequestDialog
        open
        onOpenChange={() => undefined}
        fields={[
          { key: "father_signature", label: "חתימת האב" },
          { key: "mother_signature", label: "חתימת האם" },
        ]}
        sending={false}
        onSend={vi.fn()}
        hideFieldSelect
        initialRows={[
          { fieldKey: "father_signature", email: "parent@school.com" },
          { fieldKey: "mother_signature", email: "parent@school.com" },
        ]}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        WAIVER_SAME_EMAIL_WARNING
      );
    });
  });

  it("warns when parent1_sign and parent2_sign share one inbox", async () => {
    render(
      <SignatureRequestDialog
        open
        onOpenChange={() => undefined}
        fields={[
          { key: "parent1_sign", label: "חתימת הורה 1" },
          { key: "parent2_sign", label: "חתימת הורה 2" },
        ]}
        sending={false}
        onSend={vi.fn()}
        hideFieldSelect
        initialRows={[
          { fieldKey: "parent1_sign", email: "shared@family.com" },
          { fieldKey: "parent2_sign", email: "shared@family.com" },
        ]}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        WAIVER_SAME_EMAIL_WARNING
      );
    });
  });

  it("does not warn when the two parent emails differ", async () => {
    render(
      <SignatureRequestDialog
        open
        onOpenChange={() => undefined}
        fields={[
          { key: "father_signature", label: "חתימת האב" },
          { key: "mother_signature", label: "חתימת האם" },
        ]}
        sending={false}
        onSend={vi.fn()}
        hideFieldSelect
        initialRows={[
          { fieldKey: "father_signature", email: "dad@school.com" },
          { fieldKey: "mother_signature", email: "mom@school.com" },
        ]}
      />
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("dad@school.com")).toBeTruthy();
    });
    expect(screen.queryByText(WAIVER_SAME_EMAIL_WARNING)).toBeNull();
  });
});
