/**
 * Phase 2A.2 — media metadata backfill (preview + bounded apply).
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Production media rows carry `width: null` and `height: null`, because the
 * upload path persisted nulls. Merchant image safety fails closed on unknown
 * dimensions, so those assets can never be submitted until the columns are
 * filled. This module fills them — and nothing else.
 *
 * `previewMerchantImageMetadata()` is STRICTLY READ-ONLY: one SELECT, no HTTP
 * probing at all, no writes.
 *
 * `applyMerchantImageMetadataBackfill()` probes a BOUNDED page of DISTINCT
 * media assets and writes only machine-derived metadata (width, height,
 * filesize, mimeType) through `updateMediaMachineMetadata`. It never touches
 * url, key, filename, alt, blurDataUrl, metadata, product_images, product rows,
 * attributes, stock or price, and it never calls the Merchant API.
 *
 * FAILURE POLICY: a corrupt or unreachable asset must not block the other
 * hundreds. Each media item is probed independently; a failure is recorded and
 * the batch continues. Because failures stay in the candidate set, the cursor
 * (`nextAfterMediaId`) is what guarantees forward progress past them.
 */

import type { MediaRecord } from "@/db/queries/media";
import {
  listProductReferencedMedia,
  updateMediaMachineMetadata,
} from "@/db/queries/media";
import { GoogleMerchantError, assertServerRuntime } from "@/lib/google-merchant/config";
import {
  MERCHANT_MAX_IMAGE_BYTES,
  isSupportedMerchantMimeType,
} from "@/lib/google-merchant/image-safety";
import { probeImageMetadata } from "@/lib/media/image-metadata";
import type { ImageProbeResult } from "@/lib/media/image-metadata";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:image-metadata-backfill");

/**
 * Bounded so one invocation always fits inside a serverless request.
 *
 * WALL-CLOCK BUDGET. A single probe can make up to three network calls (HEAD,
 * Range GET, one widened Range GET), each with an 8 s timeout, so an asset that
 * times out at every step costs ~24 s. Probing 25 assets sequentially would
 * therefore have a ~600 s worst case — far past any serverless limit.
 *
 * With `METADATA_PROBE_CONCURRENCY` (5) and a ceiling of 10 assets per page the
 * worst case is ceil(10 / 5) = 2 waves × 24 s ≈ 48 s, which fits a 60 s
 * function with margin. Raising either number moves that budget, so change them
 * together and redo the arithmetic.
 */
export const MAX_METADATA_BATCH_SIZE = 10;

/**
 * Simultaneous probes. Deliberately a small explicit constant — never an
 * unbounded `Promise.all` over the catalogue.
 */
export const METADATA_PROBE_CONCURRENCY = 5;

/** How many example rows a preview returns; never the whole catalogue. */
export const METADATA_PREVIEW_EXAMPLES = 10;

export type MediaMetadataExample = {
  mediaId: string;
  filename: string;
  missingDimensions: boolean;
  filesize: null | number;
  mimeType: null | string;
};

export type MediaMetadataPreview = {
  summary: {
    referencedMedia: number;
    missingDimensions: number;
    knownOversizedFiles: number;
    unsupportedMimeTypes: number;
    alreadyComplete: number;
  };
  examples: MediaMetadataExample[];
};

export type MediaMetadataFailure = {
  mediaId: string;
  code: string;
  message: string;
};

export type MediaMetadataApplyResult = {
  applied: true;
  attempted: number;
  updated: number;
  failed: number;
  failures: MediaMetadataFailure[];
  nextAfterMediaId: null | string;
  hasMore: boolean;
};

/**
 * Run `worker` over `items` with at most `concurrency` in flight.
 *
 * Results are returned in INPUT ORDER regardless of completion order, so the
 * page output stays deterministic by media id. Each worker call is independent:
 * the caller catches per-item failures, so one bad asset never cancels another.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;

        results[index] = await worker(items[index], index);
      }
    },
  );

  await Promise.all(runners);

  return results;
}

const hasDimensions = (media: MediaRecord): boolean =>
  typeof media.width === "number" &&
  media.width > 0 &&
  typeof media.height === "number" &&
  media.height > 0;

/**
 * Count what the catalogue's media looks like today. One SELECT, no probing.
 *
 * `knownOversizedFiles` counts assets whose RECORDED filesize already exceeds
 * the Merchant limit — those will never become submittable by backfilling
 * dimensions, and are the population that needs a product-level decision.
 */
export async function previewMerchantImageMetadata(): Promise<MediaMetadataPreview> {
  assertServerRuntime();

  const media = await listProductReferencedMedia();

  let missingDimensions = 0;
  let knownOversizedFiles = 0;
  let unsupportedMimeTypes = 0;
  let alreadyComplete = 0;

  for (const asset of media) {
    const complete = hasDimensions(asset);
    if (!complete) missingDimensions += 1;
    else alreadyComplete += 1;

    if (
      typeof asset.filesize === "number" &&
      asset.filesize > MERCHANT_MAX_IMAGE_BYTES
    ) {
      knownOversizedFiles += 1;
    }

    if (!isSupportedMerchantMimeType(asset.mimeType)) {
      unsupportedMimeTypes += 1;
    }
  }

  const examples = media
    .filter((asset) => !hasDimensions(asset))
    .slice(0, METADATA_PREVIEW_EXAMPLES)
    .map((asset) => ({
      filename: asset.filename,
      filesize: asset.filesize ?? null,
      mediaId: asset.id,
      mimeType: asset.mimeType ?? null,
      missingDimensions: true,
    }));

  return {
    examples,
    summary: {
      alreadyComplete,
      knownOversizedFiles,
      missingDimensions,
      referencedMedia: media.length,
      unsupportedMimeTypes,
    },
  };
}

/**
 * Decide what to persist for one probed asset.
 *
 * Dimensions are filled when missing. `filesize` is only corrected when the
 * host's authoritative content-length disagrees with the stored value — the
 * stored number is machine metadata too, but overwriting it on every run would
 * churn `updatedAt` for no reason. `mimeType` is corrected only when the parsed
 * container disagrees with what is recorded.
 */
function buildMetadataPatch(
  media: MediaRecord,
  probe: Extract<ImageProbeResult, { ok: true }>,
): { filesize?: number; height?: number; mimeType?: string; width?: number } {
  const patch: {
    filesize?: number;
    height?: number;
    mimeType?: string;
    width?: number;
  } = {};

  if (!hasDimensions(media)) {
    patch.width = probe.width;
    patch.height = probe.height;
  }

  if (probe.filesize !== null && probe.filesize !== media.filesize) {
    patch.filesize = probe.filesize;
  }

  if (probe.mimeType !== media.mimeType) {
    patch.mimeType = probe.mimeType;
  }

  return patch;
}

/**
 * Probe and persist metadata for one bounded page of referenced media.
 *
 * @param limit 1..MAX_METADATA_BATCH_SIZE.
 * @param afterMediaId cursor from a previous call; pass null to start.
 */
export async function applyMerchantImageMetadataBackfill(options: {
  limit: number;
  afterMediaId?: null | string;
}): Promise<MediaMetadataApplyResult> {
  assertServerRuntime();

  const { afterMediaId = null, limit } = options;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_METADATA_BATCH_SIZE) {
    throw new GoogleMerchantError(
      "SYNC_LIMIT_INVALID",
      `limit must be an integer between 1 and ${MAX_METADATA_BATCH_SIZE}.`,
      400,
    );
  }

  // Fetch one extra row to learn whether another page exists.
  const page = await listProductReferencedMedia({
    afterMediaId,
    limit: limit + 1,
  });

  const batch = page.slice(0, limit);
  const hasMore = page.length > limit;

  // Bounded concurrency, not a sequential walk and not an unbounded Promise.all.
  // Each media asset is handled independently — a rejection is impossible here
  // because every failure mode is caught and turned into a result.
  type Outcome =
    | { status: "failed"; failure: MediaMetadataFailure }
    | { status: "skipped" }
    | { status: "updated" };

  const outcomes = await mapWithConcurrency(
    batch,
    METADATA_PROBE_CONCURRENCY,
    async (media): Promise<Outcome> => {
      const probe = await probeImageMetadata(media.url).catch(() => null);

      if (!probe || !probe.ok) {
        return {
          failure: {
            code: probe?.code ?? "REQUEST_FAILED",
            mediaId: media.id,
            message: probe?.message ?? "The media could not be probed.",
          },
          status: "failed",
        };
      }

      const patch = buildMetadataPatch(media, probe);
      if (Object.keys(patch).length === 0) return { status: "skipped" };

      try {
        await updateMediaMachineMetadata(media.id, patch);
        return { status: "updated" };
      } catch {
        return {
          failure: {
            code: "WRITE_FAILED",
            mediaId: media.id,
            message: "The media metadata could not be saved.",
          },
          status: "failed",
        };
      }
    },
  );

  // Input order == media-id order, so failures and counts are deterministic.
  const failures = outcomes
    .filter(
      (outcome): outcome is { failure: MediaMetadataFailure; status: "failed" } =>
        outcome.status === "failed",
    )
    .map((outcome) => outcome.failure);

  const updated = outcomes.filter(
    (outcome) => outcome.status === "updated",
  ).length;

  log.info("Media metadata backfill page complete", {
    attempted: batch.length,
    failed: failures.length,
    updated,
  });

  return {
    applied: true,
    attempted: batch.length,
    failed: failures.length,
    failures,
    hasMore,
    nextAfterMediaId: batch.at(-1)?.id ?? null,
    updated,
  };
}
