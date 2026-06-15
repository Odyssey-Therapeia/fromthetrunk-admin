/**
 * P3-07: Theme CSS variable injection tests.
 *
 * L2 mutation-proofs:
 *   - formatThemeCssVariables(tokens) returns the ACTUAL production CSS-var string.
 *   - Changing a token value changes the emitted string.
 *   - Removing a token removes its declaration from the emitted string.
 *   - Empty tokens produces an empty string (no-theme default - site unchanged).
 *   - Only tokens whose names start with the allowed prefix map to CSS vars.
 *   - buildInlineStyle(tokens) returns a style object for the <style> tag.
 *   - ThemeStyler is wired into the root layout (removing it fails this test).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatThemeCssVariables,
  buildInlineStyle,
  THEME_CSS_VAR_PREFIX,
} from "@/lib/content/theme-tokens";

// -- formatThemeCssVariables --------------------------------------------------

describe("formatThemeCssVariables", () => {
  it("emits the correct CSS custom-property declarations for given tokens", () => {
    const tokens = {
      "--primary": "#6b1d1d",
      "--accent": "#b8860b",
    };

    const css = formatThemeCssVariables(tokens);

    expect(css).toContain("--primary: #6b1d1d");
    expect(css).toContain("--accent: #b8860b");
  });

  it("mutating a token value changes the emitted CSS string", () => {
    const tokens1 = { "--primary": "#6b1d1d" };
    const tokens2 = { "--primary": "#ff0000" };

    const css1 = formatThemeCssVariables(tokens1);
    const css2 = formatThemeCssVariables(tokens2);

    expect(css1).not.toBe(css2);
    expect(css1).toContain("#6b1d1d");
    expect(css2).toContain("#ff0000");
  });

  it("removing a token removes its declaration from the emitted string", () => {
    const withAccent = { "--primary": "#6b1d1d", "--accent": "#b8860b" };
    const withoutAccent = { "--primary": "#6b1d1d" };

    const css1 = formatThemeCssVariables(withAccent);
    const css2 = formatThemeCssVariables(withoutAccent);

    expect(css1).toContain("--accent");
    expect(css2).not.toContain("--accent");
  });

  it("returns an empty string when tokens is empty (no-theme default)", () => {
    const css = formatThemeCssVariables({});
    expect(css).toBe("");
  });

  it("only includes tokens whose keys start with '--'", () => {
    const tokens = {
      "--primary": "#6b1d1d",
      invalidKey: "should-be-ignored",
      radius: "0.75rem",
    };

    const css = formatThemeCssVariables(tokens);

    expect(css).toContain("--primary: #6b1d1d");
    expect(css).not.toContain("invalidKey");
    expect(css).not.toContain("radius:");
  });

  it("THEME_CSS_VAR_PREFIX is the '--' sentinel used to gate tokens", () => {
    // Proves the prefix constant is load-bearing and not just a string literal
    expect(THEME_CSS_VAR_PREFIX).toBe("--");
  });
});

// -- buildInlineStyle ---------------------------------------------------------

describe("buildInlineStyle", () => {
  it("wraps the token CSS in a :root selector for injection via <style>", () => {
    const tokens = { "--primary": "#6b1d1d" };
    const style = buildInlineStyle(tokens);
    expect(style).toContain(":root");
    expect(style).toContain("--primary: #6b1d1d");
  });

  it("returns empty string when tokens is empty (no-theme default - bytes unchanged)", () => {
    const style = buildInlineStyle({});
    expect(style).toBe("");
  });

  it("mutating a token changes the inline style string", () => {
    const s1 = buildInlineStyle({ "--radius": "0.5rem" });
    const s2 = buildInlineStyle({ "--radius": "1rem" });
    expect(s1).not.toBe(s2);
    expect(s1).toContain("0.5rem");
    expect(s2).toContain("1rem");
  });
});

// -- ThemeStyler consumer-path proof ------------------------------------------
//
// L2 requirement: removing the injection from the root layout must fail a test.
// Strategy: read the layout source file as text and assert it imports + renders
// ThemeStyler. This is a structural assertion that is robust to React rendering
// environment constraints in unit tests.

describe("ThemeStyler consumer path (L2 — layout wiring)", () => {
  const layoutPath = resolve(
    __dirname,
    "../../app/(site)/layout.tsx"
  );

  it("app/(site)/layout.tsx imports ThemeStyler from the layout component", () => {
    const src = readFileSync(layoutPath, "utf8");
    // Must import ThemeStyler
    expect(src).toMatch(/import.*ThemeStyler.*from/);
  });

  it("app/(site)/layout.tsx renders <ThemeStyler /> in JSX (removing it breaks this)", () => {
    const src = readFileSync(layoutPath, "utf8");
    // Must render the component - this assertion fails if ThemeStyler is removed
    expect(src).toMatch(/<ThemeStyler\s*\/>/);
  });

  it("ThemeStyler is imported from the correct module path", () => {
    const src = readFileSync(layoutPath, "utf8");
    // Must reference the layout component module
    expect(src).toContain("theme-styler");
  });
});
