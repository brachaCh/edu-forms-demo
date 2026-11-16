import { afterEach, describe, expect, it } from "vitest";
import { assertSafeOutboundUrl } from "./url-allowlist";

describe("assertSafeOutboundUrl", () => {
  const prevHosts = process.env.ALLOWED_OUTBOUND_HOSTS;
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.ALLOWED_OUTBOUND_HOSTS = prevHosts;
    process.env.NEXT_PUBLIC_APP_URL = prevApp;
  });

  it("blocks private and metadata hosts", () => {
    process.env.ALLOWED_OUTBOUND_HOSTS = "evil.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    expect(assertSafeOutboundUrl("http://127.0.0.1/x").ok).toBe(false);
    expect(assertSafeOutboundUrl("http://169.254.169.254/").ok).toBe(false);
  });

  it("allows only listed hosts", () => {
    process.env.ALLOWED_OUTBOUND_HOSTS = "files.example.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://demo-app.vercel.app";
    expect(assertSafeOutboundUrl("https://files.example.com/a").ok).toBe(true);
    expect(assertSafeOutboundUrl("https://other.example/a").ok).toBe(false);
    expect(assertSafeOutboundUrl("https://demo-app.vercel.app/a").ok).toBe(
      true
    );
  });
});
