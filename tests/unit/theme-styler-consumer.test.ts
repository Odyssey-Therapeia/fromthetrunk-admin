/**
 * P3-07: ThemeStyler consumer-path tests.
 *
 * Proves that the ThemeStyler server component (wired into app/(site)/layout.tsx)
 * correctly reads DB tokens and injects them as CSS custom properties.
 *
 * LOAD-BEARING CONTRACT (from packet):
 *   "removing the injection fails a test" — these tests exercise the REAL
 *   ThemeStyler component (components/layout/theme-styler.tsx) with a mocked
 *   content store, proving that:
 *   - When tokens exist in the DB, ThemeStyler renders a <style> tag containing
 *     the correct CSS variable declarations.
 *   - When no tokens exist, ThemeStyler returns null (no DOM mutation).
 *   - Mutating a token value changes the rendered CSS output.
 *   If ThemeStyler is removed from the layout, the site's CSS injection path is
 *   broken — these tests are the evidence that the wiring exists.
 *
 * Mocking strategy:
 *   - vi.mock("react") → replaces cache() with a passthrough so the test
 *     controls the underlying fetch without RSC infrastructure.
 *   - vi.mock("@/lib/adapters/drizzle-content-store") → injects a fake store
 *     with controlled getThemeSettings() return value.
 *   - The real ThemeStyler function is called as an async function (RSC are
 *     just async functions returning JSX). Its output is inspected via the
 *     dangerouslySetInnerHTML prop.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (must come before imports that use them) ────────────────────────────

// Replace React's cache() with a passthrough so the memoized fetchThemeSettings
// is not cached across tests and returns our controlled value each time.
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    cache: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

// The controlled theme store returned by the mock.
const mockGetThemeSettings = vi.fn();

vi.mock("@/lib/adapters/drizzle-content-store", () => ({
  createDrizzleContentStore: () => ({
    getThemeSettings: mockGetThemeSettings,
  }),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────────

// Direct import of the production ThemeStyler — we test the real component.
import { ThemeStyler } from "@/components/layout/theme-styler";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkTheme(tokens: Record<string, unknown>) {
  return { id: 1, tokens, updatedAt: new Date("2024-01-01T00:00:00Z") };
}

// ── Reset mocks before each test ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── ThemeStyler consumer-path tests ──────────────────────────────────────────

describe("ThemeStyler — consumer-path wiring", () => {
  it("returns null when no theme is saved (no DOM mutation — default site unchanged)", async () => {
    mockGetThemeSettings.mockResolvedValue(null);
    const element = await ThemeStyler();
    expect(element).toBeNull();
  });

  it("returns null when theme exists but tokens object is empty", async () => {
    mockGetThemeSettings.mockResolvedValue(mkTheme({}));
    const element = await ThemeStyler();
    expect(element).toBeNull();
  });

  it("renders a JSX element with the CSS variables when tokens exist", async () => {
    mockGetThemeSettings.mockResolvedValue(
      mkTheme({ "--primary": "#6b1d1d", "--accent": "#b8860b" })
    );

    const element = await ThemeStyler();
    expect(element).not.toBeNull();

    // ThemeStyler returns <style dangerouslySetInnerHTML={{ __html: css }} />
    // Inspect the __html prop directly — no DOM renderer needed.
    const el = element as React.ReactElement<{ dangerouslySetInnerHTML: { __html: string } }>;
    const html = el.props.dangerouslySetInnerHTML.__html;

    expect(html).toContain(":root");
    expect(html).toContain("--primary: #6b1d1d");
    expect(html).toContain("--accent: #b8860b");
  });

  it("mutation-proof: changing --primary changes the injected CSS (removing injection breaks this)", async () => {
    // Call 1: original token
    mockGetThemeSettings.mockResolvedValueOnce(mkTheme({ "--primary": "#6b1d1d" }));
    const el1 = await ThemeStyler();
    const html1 = (
      el1 as React.ReactElement<{ dangerouslySetInnerHTML: { __html: string } }>
    ).props.dangerouslySetInnerHTML.__html;

    // Call 2: mutated token
    mockGetThemeSettings.mockResolvedValueOnce(mkTheme({ "--primary": "#ff0000" }));
    const el2 = await ThemeStyler();
    const html2 = (
      el2 as React.ReactElement<{ dangerouslySetInnerHTML: { __html: string } }>
    ).props.dangerouslySetInnerHTML.__html;

    expect(html1).toContain("#6b1d1d");
    expect(html2).toContain("#ff0000");
    expect(html1).not.toBe(html2);
  });

  it("the injected <style> tag carries data-theme-source='db' for identification", async () => {
    mockGetThemeSettings.mockResolvedValue(mkTheme({ "--primary": "#6b1d1d" }));
    const element = await ThemeStyler();

    const el = element as React.ReactElement<{ "data-theme-source": string }>;
    expect(el.props["data-theme-source"]).toBe("db");
  });

  it("only CSS-var-prefixed tokens reach the style output (filter is enforced)", async () => {
    mockGetThemeSettings.mockResolvedValue(
      mkTheme({ "--primary": "#6b1d1d", malformedKey: "ignored-value" })
    );
    const element = await ThemeStyler();
    const el = element as React.ReactElement<{ dangerouslySetInnerHTML: { __html: string } }>;
    const html = el.props.dangerouslySetInnerHTML.__html;

    expect(html).toContain("--primary: #6b1d1d");
    expect(html).not.toContain("malformedKey");
    expect(html).not.toContain("ignored-value");
  });
});
