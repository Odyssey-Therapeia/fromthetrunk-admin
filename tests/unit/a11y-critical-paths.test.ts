/**
 * P6-06: tests/unit/a11y-critical-paths.test.ts
 *
 * Accessibility enforcement via axe-core over critical component HTML.
 *
 * Environment: jsdom (set per file via vitest environment docblock)
 * This file renders REAL components to HTML via renderToStaticMarkup,
 * parses into jsdom, and runs axe-core to assert ZERO violations.
 *
 * Cases covered:
 *  1. Deliberately-broken fixture (img no-alt, button no-label) MUST FAIL axe
 *     (mutation-proof: the axe assertion is load-bearing, not a stub)
 *  2. ProductGallery component passes with 0 violations
 *  3. ProductGallery with no images renders accessible fallback
 *
 * A11y paths that require a full browser (deployed app, next/image, react hooks
 * with client state): deferred to #G-P6 e2e / Playwright.
 *
 * @vitest-environment jsdom
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { ProductGallery } from "@/components/product/product-gallery";

// ---------------------------------------------------------------------------
// Helper: run axe over an HTML string in jsdom
// ---------------------------------------------------------------------------

async function runAxe(html: string): Promise<axe.AxeResults> {
  // Wrap in valid HTML document structure for axe
  const fullHtml = `<!DOCTYPE html><html lang="en"><head><title>Test</title></head><body>${html}</body></html>`;
  document.documentElement.innerHTML = fullHtml
    .replace("<!DOCTYPE html>", "")
    .replace("<html lang=\"en\">", "")
    .replace("</html>", "");
  document.documentElement.setAttribute("lang", "en");

  // Reset with the full HTML
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  document.body.innerHTML = "";
  document.body.appendChild(wrapper);

  return axe.run(document.body, {
    rules: {
      // Disable rules that need a full network/CSS context not available in jsdom
      "color-contrast": { enabled: false },
      // next/image renders as a wrapper div + noscript in static markup
      "image-redundant-alt": { enabled: false },
      // region rule checks page-level landmark structure — not applicable to
      // isolated component fragments rendered without a full page shell
      "region": { enabled: false },
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Deliberately-broken fixture — MUST FAIL axe (mutation-proof)
// ---------------------------------------------------------------------------

describe("a11y axe — deliberate violation fixture (mutation-proof)", () => {
  it("detects image-alt violation on img with no alt attribute", async () => {
    const brokenHtml = `<img src="saree.jpg">`;
    const results = await runAxe(brokenHtml);
    const violation = results.violations.find((v) => v.id === "image-alt");
    expect(
      violation,
      "axe MUST detect image-alt violation when img has no alt — if this fails, the axe check is not load-bearing"
    ).toBeDefined();
    expect(results.violations.length).toBeGreaterThan(0);
  });

  it("detects button-name violation on button with no accessible label", async () => {
    const brokenHtml = `<button></button>`;
    const results = await runAxe(brokenHtml);
    const violation = results.violations.find((v) => v.id === "button-name");
    expect(
      violation,
      "axe MUST detect button-name violation when button has no label — if this fails, the axe check is not load-bearing"
    ).toBeDefined();
  });

  // MUTATION PROOF: if you remove expect(violation).toBeDefined() the test still
  // catches the violation structure, but we need to prove the assertion itself matters.
  it("mutation-proof: a passing runAxe on broken HTML indicates axe is bypassed", async () => {
    const brokenHtml = `<img src="product.jpg"><button></button>`;
    const results = await runAxe(brokenHtml);
    // This should have violations — if violations.length === 0, axe is not running
    expect(
      results.violations.length,
      "Expected violations from a deliberately broken fixture; 0 violations means axe is not running"
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. ProductGallery — passes with 0 axe violations
// ---------------------------------------------------------------------------

describe("a11y axe — ProductGallery component", () => {
  it("renders ProductGallery with images and passes axe with 0 violations", async () => {
    // next/image in static markup renders a simplified version without JS
    // We render the component to HTML and check a11y on the resulting markup
    const html = renderToStaticMarkup(
      createElement(ProductGallery, {
        images: ["https://example.com/saree1.jpg", "https://example.com/saree2.jpg"],
        alt: "Banarasi silk saree with gold zari border",
      })
    );

    expect(html).toBeTruthy();

    const results = await runAxe(html);
    expect(
      results.violations,
      `ProductGallery has ${results.violations.length} a11y violations:\n${results.violations.map((v) => `  [${v.id}] ${v.description}: ${v.nodes.map((n) => n.html).join(", ")}`).join("\n")}`
    ).toHaveLength(0);
  });

  it("renders ProductGallery with no images and passes axe with 0 violations", async () => {
    const html = renderToStaticMarkup(
      createElement(ProductGallery, {
        images: [],
        alt: "No image available",
      })
    );

    expect(html).toBeTruthy();
    expect(html).toContain("No image available");

    const results = await runAxe(html);
    expect(
      results.violations,
      `ProductGallery (empty) has ${results.violations.length} a11y violations:\n${results.violations.map((v) => `  [${v.id}] ${v.description}`).join("\n")}`
    ).toHaveLength(0);
  });
});
