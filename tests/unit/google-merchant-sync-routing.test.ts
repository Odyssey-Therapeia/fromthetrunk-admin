/**
 * Phase 2B.1 — routing wiring, exercised through the REAL top-level Hono app.
 *
 * These tests import `@/api/hono/app` — the very object
 * `app/api/v2/[...route]/route.ts` wraps with `handle()` — and dispatch full
 * `/api/v2/...` URLs through it. That is the only way to prove the catalogue-
 * sync endpoints are reachable in production routing rather than merely
 * registerable in isolation: importing the route module directly would pass
 * even if `api/hono/app.ts` never called its register function.
 *
 * Everything below the router is mocked: the database client, next-auth, and
 * the sync services. No Google call and no database query happens here.
 *
 * Reading the 404s: the apply endpoint answers 404 while its kill switch is
 * off, which is indistinguishable from "not mounted". So the mounting proof for
 * apply is taken with the switch ON and production simulated, where an
 * unauthenticated request must yield 401 — a response only a mounted route can
 * produce. A deliberately misspelled sibling path is asserted to 404, so the
 * discrimination is meaningful.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — everything the router pulls in
// ---------------------------------------------------------------------------

vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("no database access is permitted in a routing test");
      },
    },
  ),
  rawSql: vi.fn(),
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

/** No session — the admin path below uses the ADMIN_API_SECRET bearer. */
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }));

const previewSyncMock = vi.hoisted(() => vi.fn());
const applySyncMock = vi.hoisted(() => vi.fn());
const syncStatusMock = vi.hoisted(() => vi.fn());

const resyncMock = vi.hoisted(() => vi.fn());
const deleteUnsupportedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/google-merchant/sync-catalogue", () => ({
  MAX_SYNC_BATCH_SIZE: 5,
  applyMerchantCatalogueSyncBatch: applySyncMock,
  deleteUnsupportedMerchantProduct: deleteUnsupportedMock,
  getMerchantCatalogueSyncStatus: syncStatusMock,
  previewMerchantCatalogueSync: previewSyncMock,
  resyncMerchantProduct: resyncMock,
}));

const metadataPreviewMock = vi.hoisted(() => vi.fn());
const metadataApplyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/google-merchant/image-metadata-backfill", () => ({
  MAX_METADATA_BATCH_SIZE: 25,
  applyMerchantImageMetadataBackfill: metadataApplyMock,
  previewMerchantImageMetadata: metadataPreviewMock,
}));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_SECRET = "admin-secret-for-routing-test";
const BASE = "http://localhost/api/v2/integrations/google-merchant";

const PREVIEW_PATH = `${BASE}/catalogue-sync/preview`;
const STATUS_PATH = `${BASE}/catalogue-sync/status`;
const APPLY_PATH = `${BASE}/catalogue-sync/apply`;
const DELETE_PATH = `${BASE}/catalogue-sync/delete`;

const BLOUSE_ID = "1bf63a12-c29a-4b18-a9fc-2c9ee41fc22e";

const emptyPlan = {
  actions: [],
  summary: {
    alreadyPresent: 0,
    conflicts: 0,
    deleteCandidates: 0,
    googleManaged: 0,
    insert: 0,
    localPublished: 0,
    localReady: 0,
    update: 0,
  },
};

const loadApp = async () => (await import("@/api/hono/app")).default;

const asAdmin = { headers: { Authorization: `Bearer ${ADMIN_SECRET}` } };

beforeEach(() => {
  vi.stubEnv("ADMIN_API_SECRET", ADMIN_SECRET);
  vi.stubEnv("NEXTAUTH_SECRET", "nextauth-secret-for-routing-test");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/test");

  previewSyncMock.mockResolvedValue(emptyPlan);
  syncStatusMock.mockResolvedValue([]);
  resyncMock.mockResolvedValue({
    merchantImages: { additionalCount: 2, primary: "https://x.test/a.jpg" },
    offerId: "0768b66c-4a38-4135-801d-87bbc95a096b",
    processedProductName: "accounts/5833526164/products/en~IN~x",
    productId: "0768b66c-4a38-4135-801d-87bbc95a096b",
    productInputName: "accounts/5833526164/productInputs/en~IN~x",
    resynced: true,
  });
  metadataPreviewMock.mockResolvedValue({
    examples: [],
    summary: {
      alreadyComplete: 0,
      knownOversizedFiles: 0,
      missingDimensions: 0,
      referencedMedia: 0,
      unsupportedMimeTypes: 0,
    },
  });
  metadataApplyMock.mockResolvedValue({
    applied: true,
    attempted: 0,
    failed: 0,
    failures: [],
    hasMore: false,
    nextAfterMediaId: null,
    updated: 0,
  });
  applySyncMock.mockResolvedValue({
    applied: true,
    attempted: 0,
    products: [],
    remainingInsertCandidates: 0,
    requestedLimit: 5,
    succeeded: 0,
  });
  deleteUnsupportedMock.mockResolvedValue({
    deleted: true,
    offerId: BLOUSE_ID,
    productId: BLOUSE_ID,
    productInputName: `accounts/5833526164/productInputs/en~IN~${BLOUSE_ID}`,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Preview — reachable through the production routing tree
// ---------------------------------------------------------------------------

describe("GET /api/v2/integrations/google-merchant/catalogue-sync/preview", () => {
  it("is reachable through the real app and served to an admin", async () => {
    const app = await loadApp();

    const response = await app.fetch(new Request(PREVIEW_PATH, asAdmin));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(emptyPlan);
    expect(previewSyncMock).toHaveBeenCalledTimes(1);
  });

  it("is mounted but gated — unauthenticated is 401, not 404", async () => {
    const app = await loadApp();

    const response = await app.fetch(new Request(PREVIEW_PATH));

    expect(response.status).toBe(401);
    expect(previewSyncMock).not.toHaveBeenCalled();
  });

  it("404s on a near-miss path, so 401/200 above really prove mounting", async () => {
    const app = await loadApp();

    const response = await app.fetch(
      new Request(`${BASE}/catalogue-sync/preveiw`, asAdmin),
    );

    expect(response.status).toBe(404);
  });

  it("is not mounted under the products sub-app", async () => {
    const app = await loadApp();

    const response = await app.fetch(
      new Request(`${BASE}/products/catalogue-sync/preview`, asAdmin),
    );

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

describe("GET /api/v2/integrations/google-merchant/catalogue-sync/status", () => {
  it("is reachable through the real app and served to an admin", async () => {
    const app = await loadApp();

    const response = await app.fetch(new Request(STATUS_PATH, asAdmin));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      products: [],
      summary: {
        byStatus: {
          APPROVED: 0,
          DISAPPROVED: 0,
          LIMITED: 0,
          PENDING: 0,
          UNKNOWN: 0,
        },
        managedProducts: 0,
      },
    });
    expect(syncStatusMock).toHaveBeenCalledTimes(1);
  });

  it("401s when unauthenticated", async () => {
    const app = await loadApp();

    expect((await app.fetch(new Request(STATUS_PATH))).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Apply — mounted at the exact expected path
// ---------------------------------------------------------------------------

describe("POST /api/v2/integrations/google-merchant/catalogue-sync/apply", () => {
  const postApply = (init: RequestInit = {}) =>
    new Request(APPLY_PATH, {
      body: JSON.stringify({
        confirm: "SYNC_FTT_GOOGLE_MERCHANT_BATCH",
        limit: 5,
      }),
      method: "POST",
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });

  const enableProductionSync = () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
  };

  it("is mounted at the exact path — 401 unauthenticated once the gates pass", async () => {
    enableProductionSync();
    const app = await loadApp();

    const response = await app.fetch(postApply());

    // 401 (not 404) can only come from a mounted route whose gates were passed.
    expect(response.status).toBe(401);
    expect(applySyncMock).not.toHaveBeenCalled();
  });

  it("serves an admin through the real app", async () => {
    enableProductionSync();
    const app = await loadApp();

    const response = await app.fetch(postApply(asAdmin));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: true });
    expect(applySyncMock).toHaveBeenCalledWith(5);
  });

  it("404s through the real app while the kill switch is off", async () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");
    vi.stubEnv("VERCEL_ENV", "production");
    const app = await loadApp();

    const response = await app.fetch(postApply(asAdmin));

    expect(response.status).toBe(404);
    expect(applySyncMock).not.toHaveBeenCalled();
  });

  it("404s through the real app outside production", async () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    const app = await loadApp();

    expect((await app.fetch(postApply(asAdmin))).status).toBe(404);
    expect(applySyncMock).not.toHaveBeenCalled();
  });

  it("does not answer GET on the apply path", async () => {
    enableProductionSync();
    const app = await loadApp();

    const response = await app.fetch(new Request(APPLY_PATH, asAdmin));

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Delete — the one deletion entry point, mounted at the exact expected path
// ---------------------------------------------------------------------------

describe("POST /api/v2/integrations/google-merchant/catalogue-sync/delete", () => {
  const postDelete = (init: RequestInit = {}) =>
    new Request(DELETE_PATH, {
      body: JSON.stringify({
        confirm: "DELETE_FTT_UNSUPPORTED_GOOGLE_MERCHANT_PRODUCT",
        productId: BLOUSE_ID,
      }),
      method: "POST",
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });

  const enableProductionSync = () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
  };

  it("is mounted at the exact path — 401 unauthenticated once the gates pass", async () => {
    enableProductionSync();
    const app = await loadApp();

    const response = await app.fetch(postDelete());

    expect(response.status).toBe(401);
    expect(deleteUnsupportedMock).not.toHaveBeenCalled();
  });

  it("serves an admin through the real app", async () => {
    enableProductionSync();
    const app = await loadApp();

    const response = await app.fetch(postDelete(asAdmin));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deleted: true });
    expect(deleteUnsupportedMock).toHaveBeenCalledWith(BLOUSE_ID);
  });

  it("404s through the real app while the shared kill switch is off", async () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "false");
    vi.stubEnv("VERCEL_ENV", "production");
    const app = await loadApp();

    expect((await app.fetch(postDelete(asAdmin))).status).toBe(404);
    expect(deleteUnsupportedMock).not.toHaveBeenCalled();
  });

  it("404s through the real app outside production", async () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    const app = await loadApp();

    expect((await app.fetch(postDelete(asAdmin))).status).toBe(404);
    expect(deleteUnsupportedMock).not.toHaveBeenCalled();
  });

  it("does not answer an HTTP DELETE on the delete path", async () => {
    // Our boundary is POST-with-confirmation; only the upstream Google call is
    // an HTTP DELETE.
    enableProductionSync();
    const app = await loadApp();

    const response = await app.fetch(
      new Request(DELETE_PATH, { ...asAdmin, method: "DELETE" }),
    );

    expect(response.status).toBe(404);
    expect(deleteUnsupportedMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The router's own view of the mounted tree
// ---------------------------------------------------------------------------

describe("OpenAPI document", () => {
  it("publishes all three catalogue-sync paths under the shared sub-app", async () => {
    const app = await loadApp();

    const response = await app.fetch(
      new Request("http://localhost/api/v2/openapi.json"),
    );
    const document = (await response.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };

    expect(response.status).toBe(200);

    const preview =
      "/api/v2/integrations/google-merchant/catalogue-sync/preview";
    const status = "/api/v2/integrations/google-merchant/catalogue-sync/status";
    const apply = "/api/v2/integrations/google-merchant/catalogue-sync/apply";

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([preview, status, apply]),
    );
    expect(Object.keys(document.paths[preview])).toEqual(["get"]);
    expect(Object.keys(document.paths[status])).toEqual(["get"]);
    expect(Object.keys(document.paths[apply])).toEqual(["post"]);
  });

  it("publishes the Phase 2A.2 endpoints too", async () => {
    const app = await loadApp();

    const document = (await (
      await app.fetch(new Request("http://localhost/api/v2/openapi.json"))
    ).json()) as { paths: Record<string, Record<string, unknown>> };

    const remove = "/api/v2/integrations/google-merchant/catalogue-sync/delete";
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([remove]),
    );
    expect(Object.keys(document.paths[remove])).toEqual(["post"]);

    const resync = "/api/v2/integrations/google-merchant/catalogue-sync/resync";
    const metadataPreview =
      "/api/v2/integrations/google-merchant/image-metadata/preview";
    const metadataApply =
      "/api/v2/integrations/google-merchant/image-metadata/apply";

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([resync, metadataPreview, metadataApply]),
    );
    expect(Object.keys(document.paths[resync])).toEqual(["post"]);
    expect(Object.keys(document.paths[metadataPreview])).toEqual(["get"]);
    expect(Object.keys(document.paths[metadataApply])).toEqual(["post"]);
  });

  it("serves the Phase 2A.2 endpoints through the real router", async () => {
    vi.stubEnv("GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    const app = await loadApp();

    const metadata = await app.fetch(
      new Request(
        "http://localhost/api/v2/integrations/google-merchant/image-metadata/preview",
        asAdmin,
      ),
    );
    expect(metadata.status).toBe(200);
    expect(metadataPreviewMock).toHaveBeenCalled();

    const resync = await app.fetch(
      new Request(
        "http://localhost/api/v2/integrations/google-merchant/catalogue-sync/resync",
        {
          ...asAdmin,
          body: JSON.stringify({
            confirm: "RESYNC_FTT_GOOGLE_MERCHANT_PRODUCT",
            productId: "0768b66c-4a38-4135-801d-87bbc95a096b",
          }),
          headers: { ...asAdmin.headers, "Content-Type": "application/json" },
          method: "POST",
        },
      ),
    );
    expect(resync.status).toBe(200);
    expect(resyncMock).toHaveBeenCalledWith(
      "0768b66c-4a38-4135-801d-87bbc95a096b",
    );
  });

  it("keeps the earlier Google Merchant endpoints mounted alongside them", async () => {
    const app = await loadApp();

    const document = (await (
      await app.fetch(new Request("http://localhost/api/v2/openapi.json"))
    ).json()) as { paths: Record<string, unknown> };

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/api/v2/integrations/google-merchant/register",
        "/api/v2/integrations/google-merchant/catalogue-readiness",
        "/api/v2/integrations/google-merchant/catalogue-backfill/preview",
        "/api/v2/integrations/google-merchant/catalogue-backfill/apply",
        "/api/v2/integrations/google-merchant/products/test-insert",
      ]),
    );
  });
});
