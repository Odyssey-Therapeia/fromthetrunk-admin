import { test, expect } from "@playwright/test";

test.describe("Footer social links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  test("Instagram link points to from.thetrunk", async ({ page }) => {
    const instagramLink = page.locator(
      'a[aria-label="Follow From the Trunk on Instagram"]'
    );
    await expect(instagramLink).toHaveAttribute(
      "href",
      "https://www.instagram.com/from.thetrunk/"
    );
  });

  test("WhatsApp link uses real number 919731910202", async ({ page }) => {
    const whatsappLink = page.locator(
      'a[aria-label="Chat with From the Trunk on WhatsApp"]'
    );
    await expect(whatsappLink).toHaveAttribute(
      "href",
      "https://wa.me/919731910202"
    );
  });
});

test.describe("Light mode only", () => {
  test("no dark mode toggle in header", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const toggle = page.locator(
      'button[aria-label*="Switch to light mode"], button[aria-label*="Switch to dark mode"]'
    );
    await expect(toggle).toHaveCount(0);
  });

  test("html element does not have dark class", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").not.toContain("dark");
  });
});

test.describe("Our Story page content", () => {
  test("shows the Bengaluru headline and real brand copy", async ({
    page,
  }) => {
    await page.goto("/our-story", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1", { hasText: "Born in Bengaluru" })
    ).toBeAttached();
    const narrative = page.locator(
      "text=Why let beautiful sarees fade away in dark trunks"
    );
    await expect(narrative).toBeAttached();
    const text = await narrative.textContent();
    expect(text).toContain("Why let beautiful sarees fade away in dark trunks");
  });

  test("shows Sourcing, Quality Control, Eco-Restoration cards", async ({
    page,
  }) => {
    await page.goto("/our-story", { waitUntil: "domcontentloaded" });
    const sourcing = page.locator("h3", { hasText: "Sourcing" });
    await sourcing.scrollIntoViewIfNeeded();
    await expect(sourcing).toBeVisible();
    await expect(
      page.locator("h3", { hasText: "Quality Control" })
    ).toBeVisible();
    await expect(
      page.locator("h3", { hasText: "Eco-Restoration" })
    ).toBeVisible();
  });
});

test.describe("How It Works page content", () => {
  test("shows the 5-step process", async ({ page }) => {
    await page.goto("/how-it-works", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1", { hasText: "Give your saree a second story" })
    ).toBeVisible();
    await expect(page.locator("h2", { hasText: "Sourcing" })).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Quality Control" })
    ).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Eco-Restoration" })
    ).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Sustainable Packaging" })
    ).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Doorstep Magic" })
    ).toBeVisible();
  });
});

test.describe("Product gallery UX", () => {
  test("gallery has responsive sticky and aspect classes", async ({
    page,
  }) => {
    await page.goto("/collection", { waitUntil: "domcontentloaded" });
    const firstProductLink = page.locator('a[href^="/collection/"]').first();
    await firstProductLink.scrollIntoViewIfNeeded();
    await firstProductLink.click({ timeout: 15_000 });
    await page.waitForLoadState("domcontentloaded");
    const gallery = page.locator('[class*="lg\\:sticky"]').first();
    await expect(gallery).toBeAttached({ timeout: 10_000 });
  });
});

test.describe("Mobile PDP responsiveness", () => {
  test.use({ viewport: { width: 402, height: 874 } });

  test("shows title and purchase CTA within the first viewport", async ({
    page,
  }) => {
    await page.goto("/collection/Kempu-Pachai-and-bandhani", {
      waitUntil: "domcontentloaded",
    });

    const title = page.locator("h1", { hasText: "Kempu Pachai" });
    const button = page.getByRole("button", { name: "Add to Bag" });

    await expect(title).toBeVisible();
    await expect(button).toBeVisible();

    const metrics = await page.evaluate(() => {
      const titleEl = [...document.querySelectorAll("h1")].find((element) =>
        element.textContent?.includes("Kempu Pachai")
      );
      const buttonEl = [...document.querySelectorAll("button")].find((element) =>
        element.textContent?.includes("Add to Bag")
      );

      return {
        viewportHeight: window.innerHeight,
        titleTop: titleEl?.getBoundingClientRect().top ?? null,
        buttonBottom: buttonEl?.getBoundingClientRect().bottom ?? null,
      };
    });

    expect(metrics.titleTop).not.toBeNull();
    expect(metrics.buttonBottom).not.toBeNull();
    expect(metrics.titleTop!).toBeLessThan(metrics.viewportHeight);
    expect(metrics.buttonBottom!).toBeLessThanOrEqual(metrics.viewportHeight);
  });
});

test.describe("Homepage brand teaser", () => {
  test("shows the real brand story copy", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const teaser = page.locator("h2", {
      hasText: "Born in Bengaluru, rooted in heritage",
    });
    await teaser.scrollIntoViewIfNeeded();
    await expect(teaser).toBeVisible();
  });
});
