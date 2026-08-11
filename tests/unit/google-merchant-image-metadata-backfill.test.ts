/**
 * Phase 2A.2 — media metadata backfill service + admin routes.
 *
 * What these tests prove:
 *   - Preview is READ-ONLY: one SELECT, no probing, no write, no Merchant call.
 *   - Apply probes DISTINCT media once each, writes only machine-derived
 *     metadata through the narrow query, and never touches url/key/filename/alt.
 *   - One corrupt asset does not stop the rest of the page.
 *   - The cursor is deterministic and lets a run progress past failures.
 *   - Re-running after a complete page is idempotent (nothing left to write).
 *   - Apply is admin-only, production-only and kill-switched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const listReferencedMediaMock = vi.hoisted(() => vi.fn());
const updateMachineMetadataMock = vi.hoisted(() => vi.fn());
const forbiddenMediaWrites = vi.hoisted(() => ({
  deleteMedia: vi.fn(),
  updateMediaRecord: vi.fn(),
}));
vi.mock("@/db/queries/media", () => ({
  createMediaRecord: vi.fn(),
  getMediaById: vi.fn(),
  listMedia: vi.fn(),
  listProductReferencedMedia: listReferencedMediaMock,
  updateMediaMachineMetadata: updateMachineMetadataMock,
  ...forbiddenMediaWrites,
}));

const probeMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/media/image-metadata", () => ({ probeImageMetadata: probeMock }));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

import { registerGoogleMerchantImageMetadataRoutes } from "@/api/hono/routes/google-merchant-image-metadata";
import { GoogleMerchantError } from "@/lib/google-merchant/config";
import {
  MAX_METADATA_BATCH_SIZE,
  METADATA_PROBE_CONCURRENCY,
  applyMerchantImageMetadataBackfill,
  previewMerchantImageMetadata,
} from "@/lib/google-merchant/image-metadata-backfill";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BLOB = "https://store.public.blob.vercel-storage.com";

const mkMedia = (id: string, overrides: Record<string, unknown> = {}) => ({
  alt: "A saree",
  blurDataUrl: null,
  filename: `${id}.jpg`,
  filesize: null,
  height: null,
  id,
  key: `media/${id}.jpg`,
  metadata: { source: "vercel-blob" },
  mimeType: "image/jpeg",
  url: `${BLOB}/media/${id}.jpg`,
  width: null,
  ...overrides,
});

const okProbe = (overrides: Record<string, unknown> = {}) => ({
  filesize: 2_000_000,
  height: 1600,
  mimeType: "image/jpeg",
  ok: true,
  width: 1200,
  ...overrides,
});

beforeEach(() => {
  listReferencedMediaMock.mockResolvedValue([mkMedia("m1"), mkMedia("m2")]);
  updateMachineMetadataMock.mockImplementation((id: string) =>
    Promise.resolve(mkMedia(id)),
  );
  probeMock.mockResolvedValue(okProbe());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

describe("previewMerchantImageMetadata", () => {
  it("counts referenced media, missing dimensions and oversized files", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1"),
      mkMedia("m2", { filesize: 22_480_000 }),
      mkMedia("m3", { filesize: 2_000_000, height: 1600, width: 1200 }),
      mkMedia("m4", { mimeType: "image/gif" }),
    ]);

    const preview = await previewMerchantImageMetadata();

    expect(preview.summary).toEqual({
      alreadyComplete: 1,
      knownOversizedFiles: 1,
      missingDimensions: 3,
      referencedMedia: 4,
      unsupportedMimeTypes: 1,
    });
  });

  it("performs no probing and no write", async () => {
    await previewMerchantImageMetadata();

    expect(probeMock).not.toHaveBeenCalled();
    expect(updateMachineMetadataMock).not.toHaveBeenCalled();
    for (const write of Object.values(forbiddenMediaWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("returns at most ten examples, never the whole catalogue", async () => {
    listReferencedMediaMock.mockResolvedValue(
      Array.from({ length: 300 }, (_, index) => mkMedia(`m${index}`)),
    );

    const preview = await previewMerchantImageMetadata();

    expect(preview.summary.referencedMedia).toBe(300);
    expect(preview.examples).toHaveLength(10);
  });

  it("reads media once even when reused across products (query dedupes)", async () => {
    await previewMerchantImageMetadata();

    expect(listReferencedMediaMock).toHaveBeenCalledTimes(1);
    expect(listReferencedMediaMock).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

describe("applyMerchantImageMetadataBackfill", () => {
  it("probes each media once and persists the dimensions", async () => {
    const result = await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(probeMock).toHaveBeenCalledTimes(2);
    expect(updateMachineMetadataMock).toHaveBeenNthCalledWith(1, "m1", {
      filesize: 2_000_000,
      height: 1600,
      width: 1200,
    });
    expect(result).toMatchObject({
      applied: true,
      attempted: 2,
      failed: 0,
      hasMore: false,
      updated: 2,
    });
  });

  it("requests one extra row to detect another page", async () => {
    await applyMerchantImageMetadataBackfill({ afterMediaId: "m0", limit: 5 });

    expect(listReferencedMediaMock).toHaveBeenCalledWith({
      afterMediaId: "m0",
      limit: 6,
    });
  });

  it("reports hasMore and the next cursor", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1"),
      mkMedia("m2"),
      mkMedia("m3"),
    ]);

    const result = await applyMerchantImageMetadataBackfill({ limit: 2 });

    expect(result.attempted).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextAfterMediaId).toBe("m2");
  });

  it("writes only machine-derived fields", async () => {
    await applyMerchantImageMetadataBackfill({ limit: 10 });

    for (const [, patch] of updateMachineMetadataMock.mock.calls) {
      expect(Object.keys(patch as Record<string, unknown>).sort()).toEqual([
        "filesize",
        "height",
        "width",
      ]);
    }
    for (const write of Object.values(forbiddenMediaWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("corrects a stale filesize but leaves correct metadata alone", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1", { filesize: 999, height: 1600, width: 1200 }),
      mkMedia("m2", {
        filesize: 2_000_000,
        height: 1600,
        mimeType: "image/jpeg",
        width: 1200,
      }),
    ]);

    const result = await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(updateMachineMetadataMock).toHaveBeenCalledTimes(1);
    expect(updateMachineMetadataMock).toHaveBeenCalledWith("m1", {
      filesize: 2_000_000,
    });
    expect(result.updated).toBe(1);
  });

  it("corrects a mime type the parsed container disagrees with", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1", { filesize: 2_000_000, height: 1600, mimeType: "image/png", width: 1200 }),
    ]);

    await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(updateMachineMetadataMock).toHaveBeenCalledWith("m1", {
      mimeType: "image/jpeg",
    });
  });

  it("continues past a failed probe and records it safely", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1"),
      mkMedia("m2"),
      mkMedia("m3"),
    ]);
    probeMock.mockImplementation((url: string) =>
      url.includes("m2")
        ? Promise.resolve({
            code: "MALFORMED_IMAGE",
            message: "The media header could not be parsed.",
            ok: false,
          })
        : Promise.resolve(okProbe()),
    );

    const result = await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(result.attempted).toBe(3);
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      {
        code: "MALFORMED_IMAGE",
        mediaId: "m2",
        message: "The media header could not be parsed.",
      },
    ]);
    // m3 was still processed after m2 failed.
    expect(updateMachineMetadataMock).toHaveBeenCalledWith("m3", expect.anything());
  });

  it("records a write failure without aborting the page", async () => {
    updateMachineMetadataMock.mockImplementation((id: string) =>
      id === "m1"
        ? Promise.reject(new Error("connection reset"))
        : Promise.resolve(mkMedia(id)),
    );

    const result = await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(result.failures[0]).toEqual({
      code: "WRITE_FAILED",
      mediaId: "m1",
      message: "The media metadata could not be saved.",
    });
    expect(result.updated).toBe(1);
  });

  it("is idempotent — a completed page writes nothing on a rerun", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1", { filesize: 2_000_000, height: 1600, width: 1200 }),
      mkMedia("m2", { filesize: 2_000_000, height: 1600, width: 1200 }),
    ]);

    const result = await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(result.updated).toBe(0);
    expect(updateMachineMetadataMock).not.toHaveBeenCalled();
  });

  it("probes with bounded concurrency, never all at once", async () => {
    listReferencedMediaMock.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => mkMedia(`m${index}`)),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    probeMock.mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          resolve(okProbe());
        }, 2);
      });
    });

    const result = await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(maxInFlight).toBe(METADATA_PROBE_CONCURRENCY);
    expect(maxInFlight).toBeLessThan(10);
    expect(probeMock).toHaveBeenCalledTimes(10);
    expect(result.updated).toBe(10);
  });

  it("keeps the batch ceiling at a wall-clock-bounded value", () => {
    // 3 requests x 8 s timeout = 24 s worst case per asset;
    // ceil(10 / 5) = 2 waves => ~48 s, inside a 60 s function.
    expect(MAX_METADATA_BATCH_SIZE).toBe(10);
    expect(METADATA_PROBE_CONCURRENCY).toBe(5);
    expect(
      Math.ceil(MAX_METADATA_BATCH_SIZE / METADATA_PROBE_CONCURRENCY) * 24,
    ).toBeLessThanOrEqual(48);
  });

  it("keeps results deterministic by media id under concurrency", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1"),
      mkMedia("m2"),
      mkMedia("m3"),
      mkMedia("m4"),
    ]);
    // Finish out of order: m1 slowest, m4 fastest.
    probeMock.mockImplementation((url: string) => {
      const delay = url.includes("m1") ? 8 : url.includes("m2") ? 6 : 1;
      return new Promise((resolve) => {
        setTimeout(
          () =>
            resolve(
              url.includes("m2")
                ? { code: "TIMEOUT", message: "slow", ok: false }
                : okProbe(),
            ),
          delay,
        );
      });
    });

    const first = await applyMerchantImageMetadataBackfill({ limit: 10 });
    const second = await applyMerchantImageMetadataBackfill({ limit: 10 });

    expect(first.failures.map((failure) => failure.mediaId)).toEqual(["m2"]);
    expect(second.failures).toEqual(first.failures);
    expect(first.nextAfterMediaId).toBe("m4");
  });

  it("probes each media id exactly once per batch", async () => {
    listReferencedMediaMock.mockResolvedValue([
      mkMedia("m1"),
      mkMedia("m2"),
      mkMedia("m3"),
    ]);

    await applyMerchantImageMetadataBackfill({ limit: 10 });

    const probed = probeMock.mock.calls.map(([url]) => String(url));
    expect(new Set(probed).size).toBe(probed.length);
  });

  const badLimits = [0, -1, 11, 26, 100, 2.5, Number.NaN];

  for (const limit of badLimits) {
    it(`refuses limit ${limit}`, async () => {
      const error = await applyMerchantImageMetadataBackfill({ limit }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(GoogleMerchantError);
      expect(probeMock).not.toHaveBeenCalled();
      expect(updateMachineMetadataMock).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

type ErrorBody = { code: string; message: string };

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  deps: Parameters<typeof registerGoogleMerchantImageMetadataRoutes>[1] = {},
) =>
  createRouteHarness({
    authUser,
    register: (app) => registerGoogleMerchantImageMetadataRoutes(app, deps),
  });

const APPLY_BODY = {
  afterMediaId: null,
  confirm: "BACKFILL_FTT_MERCHANT_IMAGE_METADATA",
  limit: 10,
};

const postApply = (
  harness: ReturnType<typeof createRouteHarness>,
  body: unknown = APPLY_BODY,
) =>
  harness.request("/image-metadata/apply", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

const enableProductionBackfill = () => {
  vi.stubEnv("GOOGLE_MERCHANT_IMAGE_METADATA_BACKFILL_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ADMIN_API_SECRET", undefined);
};

describe("GET /image-metadata/preview", () => {
  it("401s unauthenticated and 403s a non-admin", async () => {
    vi.stubEnv("ADMIN_API_SECRET", undefined);

    expect(
      (await makeHarness(null).request("/image-metadata/preview")).status,
    ).toBe(401);
    expect(
      (await makeHarness(CUSTOMER).request("/image-metadata/preview")).status,
    ).toBe(403);
    expect(listReferencedMediaMock).not.toHaveBeenCalled();
  });

  it("serves an admin outside production with the switch off", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("GOOGLE_MERCHANT_IMAGE_METADATA_BACKFILL_ENABLED", "false");

    const response = await makeHarness(ADMIN).request(
      "/image-metadata/preview",
    );
    const body = (await response.json()) as { summary: Record<string, number> };

    expect(response.status).toBe(200);
    expect(Object.keys(body.summary).sort()).toEqual([
      "alreadyComplete",
      "knownOversizedFiles",
      "missingDimensions",
      "referencedMedia",
      "unsupportedMimeTypes",
    ]);
  });

  it("exposes no media URL, key or alt text", async () => {
    const raw = await (
      await makeHarness(ADMIN).request("/image-metadata/preview")
    ).text();

    expect(raw).not.toContain("blob.vercel-storage");
    expect(raw).not.toContain("A saree");
    expect(raw).not.toContain("media/m1.jpg");
  });
});

describe("POST /image-metadata/apply", () => {
  it("404s when the kill switch is off", async () => {
    enableProductionBackfill();
    vi.stubEnv("GOOGLE_MERCHANT_IMAGE_METADATA_BACKFILL_ENABLED", "false");

    expect((await postApply(makeHarness(ADMIN))).status).toBe(404);
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("404s outside production", async () => {
    enableProductionBackfill();
    vi.stubEnv("VERCEL_ENV", "preview");

    expect((await postApply(makeHarness(ADMIN))).status).toBe(404);
  });

  it("401s unauthenticated and 403s a non-admin", async () => {
    enableProductionBackfill();

    expect((await postApply(makeHarness(null))).status).toBe(401);
    expect((await postApply(makeHarness(CUSTOMER))).status).toBe(403);
    expect(probeMock).not.toHaveBeenCalled();
  });

  const badBodies: Array<{ body: unknown; label: string }> = [
    { body: { ...APPLY_BODY, confirm: "BACKFILL" }, label: "a wrong phrase" },
    { body: { limit: 10 }, label: "no confirmation" },
    { body: { ...APPLY_BODY, limit: 0 }, label: "limit 0" },
    { body: { ...APPLY_BODY, limit: 11 }, label: "limit 11" },
    { body: { ...APPLY_BODY, limit: 2.5 }, label: "a fractional limit" },
    { body: { ...APPLY_BODY, force: true }, label: "an extra property" },
  ];

  for (const { body, label } of badBodies) {
    it(`400s on ${label}`, async () => {
      enableProductionBackfill();

      const response = await postApply(makeHarness(ADMIN), body);

      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe(
        "INVALID_REQUEST",
      );
      expect(probeMock).not.toHaveBeenCalled();
    });
  }

  it("returns the agreed result shape", async () => {
    enableProductionBackfill();

    const response = await postApply(makeHarness(ADMIN));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "applied",
      "attempted",
      "failed",
      "failures",
      "hasMore",
      "nextAfterMediaId",
      "updated",
    ]);
  });

  it("passes the cursor through to the service", async () => {
    enableProductionBackfill();

    await postApply(makeHarness(ADMIN), { ...APPLY_BODY, afterMediaId: "m9" });

    expect(listReferencedMediaMock).toHaveBeenCalledWith({
      afterMediaId: "m9",
      limit: 11,
    });
  });

  it("makes no Merchant API request", async () => {
    enableProductionBackfill();
    const fetchMock = vi.fn().mockRejectedValue(new Error("no network"));
    vi.stubGlobal("fetch", fetchMock);

    await postApply(makeHarness(ADMIN));

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
