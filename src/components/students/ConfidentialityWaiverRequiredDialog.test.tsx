/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_TEXTS } from "@/lib/site-text";
import { getTextByPath } from "@/lib/get-text-by-path";

const completed = vi.fn((_studentId?: string) => false);

vi.mock("@/lib/confidentiality-waiver-gate", () => ({
  confidentialityWaiverFormsHref: () => "/waiver",
  isConfidentialityWaiverCompleted: (studentId: string) => completed(studentId),
}));

vi.mock("@/components/students/WaiverSignerLockedStatus", () => ({
  WaiverSignerLockedStatus: () => <div>signer-status</div>,
}));

vi.mock("@/components/students/PaperWaiverScanPanel", () => ({
  PaperWaiverScanPanel: ({ onChanged }: { onChanged?: () => void }) => (
    <button type="button" onClick={() => onChanged?.()}>
      upload-scan
    </button>
  ),
}));

vi.mock("@/components/editable/EditableText", () => ({
  EditableText: ({ path }: { path: string }) => (
    <span>{getTextByPath(DEFAULT_SITE_TEXTS, path)}</span>
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

import { ConfidentialityWaiverRequiredDialog } from "./ConfidentialityWaiverRequiredDialog";

describe("ConfidentialityWaiverRequiredDialog locked-screen unlock", () => {
  afterEach(() => {
    cleanup();
    completed.mockReset();
    completed.mockReturnValue(false);
  });

  it("closes and unlocks the parent page after a scan satisfies the waiver", () => {
    const onOpenChange = vi.fn();
    const onUnlocked = vi.fn();
    completed.mockReturnValue(true);

    render(
      <ConfidentialityWaiverRequiredDialog
        open
        onOpenChange={onOpenChange}
        studentId="s1"
        onUnlocked={onUnlocked}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "upload-scan" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it("does not unlock when the scan is not enough to complete the waiver", () => {
    const onOpenChange = vi.fn();
    const onUnlocked = vi.fn();
    completed.mockReturnValue(false);

    render(
      <ConfidentialityWaiverRequiredDialog
        open
        onOpenChange={onOpenChange}
        studentId="s1"
        onUnlocked={onUnlocked}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "upload-scan" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});
