import { describe, expect, it } from "vitest";

import {
  buildPdpTitle,
  buildPdpDescription,
} from "@/lib/seo/pdp-meta";

// ---------------------------------------------------------------------------
// buildPdpTitle
// ---------------------------------------------------------------------------

describe("buildPdpTitle", () => {
  it("appends the suffix when the name does NOT already end in '{fabric} saree'", () => {
    const title = buildPdpTitle("Temple Border Archive", "Kanjeevaram silk");
    expect(title).toBe("Temple Border Archive | Preloved Kanjeevaram silk Saree");
  });

  it("skips the suffix when the name ends in '{fabric} Saree' (case-insensitive match)", () => {
    const title = buildPdpTitle("Temple Border Kanjeevaram silk Saree", "Kanjeevaram silk");
    expect(title).toBe("Temple Border Kanjeevaram silk Saree");
  });

  it("skips the suffix when the name ends with lowercase 'saree'", () => {
    const title = buildPdpTitle("Vintage Cotton saree", "Cotton");
    expect(title).toBe("Vintage Cotton saree");
  });

  it("skips the suffix when the name ends with mixed-case 'SAREE'", () => {
    const title = buildPdpTitle("Bridal Banarasi silk SAREE", "Banarasi silk");
    expect(title).toBe("Bridal Banarasi silk SAREE");
  });

  it("does not add the brand segment (layout handles that)", () => {
    const title = buildPdpTitle("Heritage Linen Drape", "Linen");
    expect(title).not.toContain("From the Trunk");
  });

  it("strips trailing 'saree' from fabric value to avoid double-saree output", () => {
    // fabric = "Heirloom saree" should produce "| Preloved Heirloom Saree", not
    // "| Preloved Heirloom saree Saree".
    const title = buildPdpTitle("Heirloom Beauty", "Heirloom saree");
    expect(title).toBe("Heirloom Beauty | Preloved Heirloom Saree");
  });

  it("strips trailing 'SAREE' (case-insensitive) from fabric value", () => {
    const title = buildPdpTitle("Vintage Drape", "Cotton SAREE");
    expect(title).toBe("Vintage Drape | Preloved Cotton Saree");
  });
});

// ---------------------------------------------------------------------------
// buildPdpDescription
// ---------------------------------------------------------------------------

describe("buildPdpDescription", () => {
  it("returns storyNarrative in full when it is ≤150 chars", () => {
    const narrative = "A beautiful heirloom piece passed down three generations.";
    const desc = buildPdpDescription("Product", "Silk", narrative);
    expect(desc).toBe(narrative);
  });

  it("truncates storyNarrative at word boundary when it is >150 chars", () => {
    // Build a string that is clearly > 150 chars where char 150 falls mid-word.
    // "hello " repeated 25 times = 150 chars exactly, then add a long word so
    // the total is 170 chars. The truncation point at 150 falls right after the
    // last space (position 149), so we should get the 150-char prefix without
    // the extra long word.
    const base = "hello ".repeat(25); // 150 chars — the last char is a space
    const longWord = "overlengthword"; // 14 chars, pushes to 164 total
    const narrative = base + longWord;
    expect(narrative.length).toBeGreaterThan(150);

    const desc = buildPdpDescription("Product", "Silk", narrative);
    expect(desc.length).toBeLessThanOrEqual(150);
    // The long word that starts at position 150 must not appear in the result
    expect(desc).not.toContain(longWord);
  });

  it("truncates at word boundary and does not cut mid-word (exact boundary check)", () => {
    // "word ".repeat(28) = 140 chars (28×5), indices 0–139, last char is a space.
    // "superlongwordhere123" = 20 chars, indices 140–159. Total = 160 chars.
    // truncateAtWordBoundary(text, 150):
    //   slice(0,150) → indices 0–149, which is the 140 "word " chars + "superlon"
    //   lastIndexOf(" ") in that slice → 139 (the trailing space of the 28th "word ")
    //   result = slice(0,139) → "word ".repeat(27) + "word" = 139 chars
    const part1 = "word ".repeat(28); // 140 chars, ends with space
    const longWord = "superlongwordhere123"; // 20 chars
    const narrative = part1 + longWord; // 160 chars

    const desc = buildPdpDescription("Product", "Silk", narrative);
    expect(desc.length).toBeLessThanOrEqual(150);
    expect(desc).not.toContain(longWord);
    // Exact equality — a naive slice(0,150) mutant would produce a 150-char string
    // ending in "superlon" and would NOT equal this, so the assertion detects regressions.
    expect(desc).toBe("word ".repeat(27) + "word");
  });

  it("falls back to storyTitle when storyNarrative is absent", () => {
    const desc = buildPdpDescription(
      "Heritage Piece",
      "Chanderi",
      null,
      "The Story of a Lifetime"
    );
    expect(desc).toBe("The Story of a Lifetime");
  });

  it("falls back to storyTitle when storyNarrative is an empty string", () => {
    const desc = buildPdpDescription(
      "Heritage Piece",
      "Chanderi",
      "",
      "The Story of a Lifetime"
    );
    expect(desc).toBe("The Story of a Lifetime");
  });

  it("falls back to '{name} {fabric} saree' when both storyNarrative and storyTitle are absent", () => {
    const desc = buildPdpDescription("Heritage Piece", "Chanderi", null, null);
    expect(desc).toBe("Heritage Piece Chanderi saree");
  });

  it("falls back to '{name} {fabric} saree' when both are empty strings", () => {
    const desc = buildPdpDescription("Vintage Silk", "Georgette", "", "");
    expect(desc).toBe("Vintage Silk Georgette saree");
  });
});
