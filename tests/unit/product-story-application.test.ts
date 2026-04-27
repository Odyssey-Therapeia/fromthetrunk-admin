import { describe, expect, it } from "vitest";

import {
  buildStoryPatchPayload,
  hasStoryPatchPayload,
} from "@/lib/products/story-application";

describe("product story application", () => {
  it("builds a patch payload from generated story fields", () => {
    expect(
      buildStoryPatchPayload({
        storyEra: "1980s",
        storyNarrative: "A carefully restored archive saree.",
        storyProvenance: "Bengaluru family trunk",
        storyTitle: "The Archive Border",
      }),
    ).toEqual({
      storyEra: "1980s",
      storyNarrative: "A carefully restored archive saree.",
      storyProvenance: "Bengaluru family trunk",
      storyTitle: "The Archive Border",
    });
  });

  it("trims empty generated fields so saves do not wipe existing copy", () => {
    const payload = buildStoryPatchPayload({
      storyEra: "  ",
      storyNarrative: "  New product story  ",
      storyProvenance: "",
      storyTitle: undefined,
    });

    expect(payload).toEqual({
      storyNarrative: "New product story",
    });
    expect(hasStoryPatchPayload(payload)).toBe(true);
  });

  it("knows when there is nothing useful to save", () => {
    expect(hasStoryPatchPayload(buildStoryPatchPayload(undefined))).toBe(false);
  });
});
