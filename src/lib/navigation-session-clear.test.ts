import { afterEach, describe, expect, it } from "vitest";
import {
  clearInstitutionSpecificCaches,
  clearUser,
} from "./mock-store";
import {
  previousInAppHistory,
  readNavBackHref,
  recordInAppHistory,
  rememberNavBackHref,
} from "./navigation-back";

function installMemoryWindow() {
  const session = new Map<string, string>();
  const local = new Map<string, string>();
  const storage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  });
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousFetch = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { window: unknown }).window = {
    sessionStorage: storage(session),
    localStorage: storage(local),
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  (globalThis as { fetch: typeof fetch }).fetch = (async () =>
    new Response(null, { status: 200 })) as typeof fetch;
  return { previousWindow, previousFetch };
}

function restoreWindow(
  previousWindow: unknown,
  previousFetch: unknown
) {
  if (previousWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = previousWindow;
  }
  if (previousFetch === undefined) {
    delete (globalThis as { fetch?: unknown }).fetch;
  } else {
    (globalThis as { fetch: unknown }).fetch = previousFetch;
  }
}

describe("nav session clears on institution switch and logout", () => {
  let previousWindow: unknown;
  let previousFetch: unknown;

  afterEach(() => {
    restoreWindow(previousWindow, previousFetch);
  });

  it("clears stored list and history on institution switch", () => {
    ({ previousWindow, previousFetch } = installMemoryWindow());
    rememberNavBackHref("/personal-area/category/special-ed-class/mode/student");
    recordInAppHistory("/personal-area/category/special-ed-class/mode/student");

    clearInstitutionSpecificCaches();

    expect(readNavBackHref()).toBeNull();
    expect(
      previousInAppHistory("/personal-area/students/view/abc")
    ).toBeNull();
  });

  it("clears stored list and history on logout", () => {
    ({ previousWindow, previousFetch } = installMemoryWindow());
    rememberNavBackHref("/personal-area/category/integration");
    recordInAppHistory("/personal-area/category/integration");

    clearUser();

    expect(readNavBackHref()).toBeNull();
    expect(
      previousInAppHistory("/personal-area/students/view/abc")
    ).toBeNull();
  });
});
