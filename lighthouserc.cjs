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
  "categories:performance": ["warn", { minScore: 0.5 }],
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
              args: ["--no-sandbox", "--disable-gpu"],
            },
          }
        : {}),
      settings: {
        ...(formFactor === "desktop" ? { preset: "desktop" } : {}),
        ...(requiresAuth
          ? {}
          : { chromeFlags: "--headless=new --no-sandbox --disable-gpu" }),
      },
    },
    assert: {
      assertions: {
        ...categoryAssertions,
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
