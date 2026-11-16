import { describe, expect, it } from "vitest";
import { toEmbeddableVideoUrl } from "@/lib/tutorials-store";

describe("toEmbeddableVideoUrl", () => {
  it("embeds a Google Drive file with preview URL", () => {
    expect(
      toEmbeddableVideoUrl(
        "https://drive.google.com/file/d/1N7Iem5Yp0DD6D-WvHhdYr8wmIqRy01Q2/view?usp=drive_link"
      )
    ).toEqual({
      kind: "drive",
      src: "https://drive.google.com/file/d/1N7Iem5Yp0DD6D-WvHhdYr8wmIqRy01Q2/preview",
      original: "https://drive.google.com/file/d/1N7Iem5Yp0DD6D-WvHhdYr8wmIqRy01Q2/view?usp=drive_link",
    });
  });

  it("leaves a direct video file as a video source", () => {
    expect(toEmbeddableVideoUrl("/tutorials/registration-1.mp4")).toEqual({
      kind: "direct",
      src: "/tutorials/registration-1.mp4",
    });
  });
});
