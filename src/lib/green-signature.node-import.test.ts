import { describe, expect, it } from "vitest";

describe("green-signature node import", () => {
  it("imports without isomorphic-dompurify / jsdom", async () => {
    const mod = await import("@/lib/green-signature");
    expect(mod.stripScriptsForView('<p>ok</p><script>bad()</script>')).toContain(
      "<p>ok</p>"
    );
    expect(
      mod.stripScriptsForView('<p>ok</p><script>bad()</script>')
    ).not.toContain("<script");
  });

  it("sign-document page and external-signature sign route import green-signature in node", async () => {
    await expect(import("@/app/sign-document/[token]/page")).resolves.toBeDefined();
    await expect(
      import("@/app/api/external-signature/sign/route")
    ).resolves.toBeDefined();
  });
});
