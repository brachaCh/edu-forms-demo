/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { SpecialEdPackageGate } from "./SpecialEdPackageGate";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

vi.mock("@/components/providers/DataStoreProvider", () => ({
  useDataStore: () => ({ ready: true }),
}));

const mockCanAccess = vi.fn();
const mockHasExisting = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/plan-limits-client", () => ({
  canAccessSpecialEdClasses: () => mockCanAccess(),
  hasExistingSpecialEdStudents: () => mockHasExisting(),
}));

vi.mock("@/lib/mock-store", () => ({
  getUser: () => mockGetUser(),
}));

describe("SpecialEdPackageGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockReturnValue({
      institution_type: "schools",
      education_framework: "special",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders children when access is allowed", async () => {
    mockCanAccess.mockReturnValue(true);

    await act(async () => {
      render(
        <SpecialEdPackageGate mode="create">
          <div data-testid="child">Content</div>
        </SpecialEdPackageGate>
      );
    });

    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("TZ-161: shows Hebrew message in create mode when access is blocked", async () => {
    mockCanAccess.mockReturnValue(false);

    await act(async () => {
      render(
        <SpecialEdPackageGate mode="create">
          <div data-testid="child">Content</div>
        </SpecialEdPackageGate>
      );
    });

    expect(screen.queryByTestId("child")).toBeNull();
    expect(
      screen.getByText("החבילה של המוסד לא כוללת כיתות חינוך מיוחד.")
    ).toBeTruthy();
    expect(screen.getByText("חזרה לפרופיל המוסד")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders children in view mode when existing students exist", async () => {
    mockCanAccess.mockReturnValue(false);
    mockHasExisting.mockReturnValue(true);

    await act(async () => {
      render(
        <SpecialEdPackageGate mode="view">
          <div data-testid="child">Content</div>
        </SpecialEdPackageGate>
      );
    });

    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("redirects in view mode when no access and no existing students", async () => {
    mockCanAccess.mockReturnValue(false);
    mockHasExisting.mockReturnValue(false);

    await act(async () => {
      render(
        <SpecialEdPackageGate mode="view">
          <div data-testid="child">Content</div>
        </SpecialEdPackageGate>
      );
    });

    expect(mockReplace).toHaveBeenCalled();
  });
});
