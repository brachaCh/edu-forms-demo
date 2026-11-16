import { describe, expect, it } from "vitest";
import { driveVideoUpstreamUrl } from "./drive-video-proxy";

describe("driveVideoUpstreamUrl", () => {
  it("builds a fixed Google download URL from a file id", () => {
    expect(driveVideoUpstreamUrl("1N7Iem5Yp0DD6D-WvHhdYr8wmIqRy01Q2")).toBe(
      "https://drive.usercontent.google.com/download?id=1N7Iem5Yp0DD6D-WvHhdYr8wmIqRy01Q2&export=download&confirm=t"
    );
  });

  it("rejects ids that are not a Drive file id", () => {
    expect(driveVideoUpstreamUrl("https://evil.example/file")).toBeNull();
    expect(driveVideoUpstreamUrl("../etc")).toBeNull();
  });
});
