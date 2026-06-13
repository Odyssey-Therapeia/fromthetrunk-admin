import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 402, height: 874 } });

test("mobile product page screenshot", async ({ page }) => {
  await page.goto("/collection/Kempu-Pachai-and-bandhani", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("h1", { hasText: "Kempu Pachai" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Bag" })).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-product-page.png",
    fullPage: false,
  });
});

test("mobile product gallery screenshot", async ({ page }) => {
  await page.goto("/collection/Kempu-Pachai-and-bandhani", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("h1", { hasText: "Kempu Pachai" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Bag" })).toBeVisible();
  const firstGalleryThumb = page
    .locator('button[aria-label^="View image"]')
    .first();
  await firstGalleryThumb.scrollIntoViewIfNeeded();
  await expect(firstGalleryThumb).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-product-gallery.png",
    fullPage: false,
  });
});
