/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/providers/SiteTextProvider", () => ({
  useSiteText: () => ({ texts: {} }),
}));

vi.mock("@/lib/get-text-by-path", () => ({
  getTextByPath: () => null,
}));

import { TypedTextRefineButton } from "./VoiceRecordButton";

describe("TypedTextRefineButton", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not overwrite if user changed the field while refining (TZ-166 regression)", async () => {
    const onInsert = vi.fn();
    let resolveResponse: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    fetchMock.mockReturnValue(responsePromise);

    const initialValue = "טקסט מקורי";
    const { rerender } = render(
      <TypedTextRefineButton
        value={initialValue}
        onInsert={onInsert}
        fieldLabel="הערות"
      />
    );

    const button = screen.getByRole("button", { name: /נסחי לי/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/refine-transcript",
      expect.objectContaining({
        method: "POST",
      })
    );

    const changedValue = "טקסט ששונה על ידי המשתמש";
    rerender(
      <TypedTextRefineButton
        value={changedValue}
        onInsert={onInsert}
        fieldLabel="הערות"
      />
    );

    await act(async () => {
      resolveResponse!(
        new Response(JSON.stringify({ text: "טקסט מעובד מה-AI" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByText(/מנסח/)).toBeNull();
    });

    expect(onInsert).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText(/השדה השתנה/)).toBeTruthy();
    });
  });

  it("replaces text when user did not change the field while refining", async () => {
    const onInsert = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "טקסט מעובד מה-AI" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const initialValue = "טקסט מקורי";
    render(
      <TypedTextRefineButton
        value={initialValue}
        onInsert={onInsert}
        fieldLabel="הערות"
      />
    );

    const button = screen.getByRole("button", { name: /נסחי לי/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledWith("טקסט מעובד מה-AI");
    });
  });

  it("disables refine when text is too long (> 2000 chars)", () => {
    const onInsert = vi.fn();
    const longText = "א".repeat(2100);

    render(
      <TypedTextRefineButton
        value={longText}
        onInsert={onInsert}
        fieldLabel="הערות"
      />
    );

    const button = screen.getByRole("button", {
      name: /נסחי לי/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toMatch(/ארוך מדי/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows message when API returns empty response", async () => {
    const onInsert = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    render(
      <TypedTextRefineButton
        value="טקסט מקורי"
        onInsert={onInsert}
        fieldLabel="הערות"
      />
    );

    const button = screen.getByRole("button", { name: /נסחי לי/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText(/לא התקבלו שינויים/)).toBeTruthy();
    });

    expect(onInsert).not.toHaveBeenCalled();
  });

  it("shows error message when API returns 503", async () => {
    const onInsert = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "AI_UNAVAILABLE" }), {
        status: 503,
      })
    );

    render(
      <TypedTextRefineButton
        value="טקסט מקורי"
        onInsert={onInsert}
        fieldLabel="הערות"
      />
    );

    const button = screen.getByRole("button", { name: /נסחי לי/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText(/לא זמין/)).toBeTruthy();
    });

    expect(onInsert).not.toHaveBeenCalled();
  });
});
