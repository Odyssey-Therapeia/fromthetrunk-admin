const baseUrl = process.env.FTT_LHCI_BASE_URL || "http://127.0.0.1:3000";

const defaultPaths = [
  "/",
  "/collection",
  "/cart",
  "/checkout",
  "/our-story",
  "/how-it-works",
  "/privacy-policy",
  "/shipping-policy",
  "/return-policy",
  "/packing",
];

const adminPaths = [
  "/admin",
  "/admin/products",
  "/admin/products/new",
  "/admin/products/import",
  "/admin/collections",
  "/admin/orders",
  "/admin/customers",
  "/admin/media",
  "/admin/globals",
  "/admin/settings",
  "/admin/changelog",
];

const scope =
  process.env.FTT_LHCI_SCOPE === "admin" || process.env.FTT_LHCI_SCOPE === "all"
    ? process.env.FTT_LHCI_SCOPE
    : "public";
const scopePaths =
  scope === "admin"
    ? adminPaths
    : scope === "all"
    ? [...defaultPaths, ...adminPaths]
    : defaultPaths;
const urlPaths = (process.env.FTT_LHCI_URL_PATHS || scopePaths.join(","))
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

const formFactor =
  process.env.FTT_LHCI_FORM_FACTOR === "desktop" ? "desktop" : "mobile";
const requiresAuth = scope !== "public" || process.env.FTT_LHCI_AUTH === "true";
const chromePath = requiresAuth
  ? process.env.CHROME_PATH ||
    require("chrome-launcher").Launcher.getFirstInstallation()
  : undefined;
const outputDir =
  process.env.FTT_LHCI_OUTPUT_DIR ||
  `./test-results/lighthouse/${
    scope === "public" ? formFactor : `${scope}-${formFactor}`
  }`;
const parsedRuns = Number.parseInt(process.env.FTT_LHCI_RUNS || "1", 10);
const numberOfRuns = Number.isFinite(parsedRuns) && parsedRuns > 0 ? parsedRuns : 1;
const categoryAssertions = {
  "categories:accessibility": ["error", { minScore: 0.9 }],
  "categories:best-practices": ["warn", { minScore: 0.85 }],
  ...(scope === "public"
    ? { "categories:seo": ["warn", { minScore: 0.85 }] }
    : {}),
  // P6-06: performance budget — BLOCKING (error), not advisory (warn).
  // p75 LCP ≤ 2.5s and CLS ≤ 0.1 are enforced as hard CI failures.
  "categories:performance": ["error", { minScore: 0.7 }],
};

module.exports = {
  ci: {
    collect: {
      url: urlPaths.map((path) => new URL(path, baseUrl).toString()),
      startServerCommand: "npm run serve:lhci",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 60_000,
      numberOfRuns,
      ...(chromePath ? { chromePath } : {}),
      ...(requiresAuth
        ? {
            puppeteerScript: "./scripts/lhci-auth.cjs",
            puppeteerLaunchOptions: {
              args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
            },
          }
        : {}),
      settings: {
        ...(formFactor === "desktop" ? { preset: "desktop" } : {}),
        ...(requiresAuth
          ? {}
          : {
              // --disable-dev-shm-usage is REQUIRED on GitHub ubuntu runners:
              // the container's /dev/shm is too small, so Chrome crashes on
              // startup (launcher hangs "Waiting for browser..." → ECONNREFUSED).
              chromeFlags:
                "--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
            }),
      },
    },
    assert: {
      assertions: {
        ...categoryAssertions,
        // P6-06: Core Web Vital budgets — BLOCKING (error level).
        // largest-contentful-paint numericValue is in milliseconds.
        // aggregationMethod "optimistic" selects the best (lowest) run, giving
        // the pipeline a fair chance while still enforcing the p75 budget.
        "largest-contentful-paint": [
          "error",
          { maxNumericValue: 2500, aggregationMethod: "optimistic" },
        ],
        // cumulative-layout-shift numericValue is unitless (0–∞).
        "cumulative-layout-shift": [
          "error",
          { maxNumericValue: 0.1, aggregationMethod: "optimistic" },
        ],
        "aria-allowed-attr": "error",
        "aria-required-attr": "error",
        "aria-valid-attr": "error",
        "aria-valid-attr-value": "error",
        "button-name": "error",
        "color-contrast": "error",
        "document-title": "error",
        "form-field-multiple-labels": "error",
        "heading-order": "error",
        "html-has-lang": "error",
        "image-alt": "error",
        "input-image-alt": "error",
        "label": "error",
        "link-name": "error",
        "meta-viewport": "error",
        "tabindex": "error",
      },
    },
    upload: {
      target: "filesystem",
      outputDir,
      reportFilenamePattern:
        "%%HOSTNAME%%-%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%",
    },
  },
};
