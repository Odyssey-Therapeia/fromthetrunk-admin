import path from "path";

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

import { createMediaRecord } from "@/db/queries/media";
import { probeImageMetadata } from "@/lib/media/image-metadata";
import type { ImageProbeErrorCode } from "@/lib/media/image-metadata";

type UploadUrlInput = {
  contentType: string;
  filename: string;
};

export type CreateMediaFromUploadInput = {
  /** Alt text is REQUIRED — uploads without alt are rejected. */
  alt: string;
  filename: string;
  mimeType?: string;
  pathname: string;
  size?: number;
  url: string;
};

/**
 * Metadata for the uploaded blob could not be established.
 *
 * Thrown INSTEAD of writing a media row. The blob itself is left in place, so
 * the client may retry completion with the same URL and pathname.
 */
export class MediaMetadataUnavailableError extends Error {
  readonly code: ImageProbeErrorCode;
  readonly attempts: number;

  constructor(code: ImageProbeErrorCode, attempts: number) {
    super(
      "Image metadata could not be determined for the uploaded file. The upload was not saved; retry completion.",
    );
    this.name = "MediaMetadataUnavailableError";
    this.attempts = attempts;
    this.code = code;
  }
}

/** Maximum probe attempts before completion is refused. */
export const MEDIA_PROBE_MAX_ATTEMPTS = 3;

/** Bounded backoff between attempts, in milliseconds. */
export const MEDIA_PROBE_BACKOFF_MS = [200, 400] as const;

/**
 * Failures worth retrying. A malformed or unsupported image, or a URL outside
 * the allowlist, will fail identically on every attempt — retrying those only
 * burns the request budget.
 */
const TRANSIENT_PROBE_CODES: ReadonlySet<ImageProbeErrorCode> = new Set([
  "HTTP_ERROR",
  "REQUEST_FAILED",
  "TIMEOUT",
]);

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const toSafeBasename = (filename: string) => {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "upload"}${ext.toLowerCase()}`;
};

export const generateUploadUrl = async (input: UploadUrlInput) => {
  const safeFilename = toSafeBasename(input.filename);
  const pathname = `media/${Date.now()}-${safeFilename}`;

  const clientToken = await generateClientTokenFromReadWriteToken({
    addRandomSuffix: false,
    allowedContentTypes: [input.contentType],
    pathname,
  });

  return {
    clientToken,
    pathname,
  };
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/**
 * Probe the uploaded blob, retrying transient failures with bounded backoff.
 *
 * @throws {MediaMetadataUnavailableError} when metadata cannot be established.
 */
async function probeUploadedBlob(url: string) {
  let lastCode: ImageProbeErrorCode = "REQUEST_FAILED";

  for (let attempt = 1; attempt <= MEDIA_PROBE_MAX_ATTEMPTS; attempt += 1) {
    const probe = await probeImageMetadata(url).catch(() => null);

    if (probe?.ok === true) {
      // Validate before trusting it: a row must never be created with unusable
      // dimensions, which is the exact failure this whole phase exists to fix.
      if (isPositiveInteger(probe.width) && isPositiveInteger(probe.height)) {
        return probe;
      }

      throw new MediaMetadataUnavailableError("MALFORMED_IMAGE", attempt);
    }

    lastCode = probe?.code ?? "REQUEST_FAILED";

    // Deterministic failures will not change on a retry.
    if (!TRANSIENT_PROBE_CODES.has(lastCode)) {
      throw new MediaMetadataUnavailableError(lastCode, attempt);
    }

    const backoff = MEDIA_PROBE_BACKOFF_MS[attempt - 1];
    if (attempt < MEDIA_PROBE_MAX_ATTEMPTS && backoff !== undefined) {
      await sleep(backoff);
    }
  }

  throw new MediaMetadataUnavailableError(lastCode, MEDIA_PROBE_MAX_ATTEMPTS);
}

/**
 * Creates a media record after enforcing alt text AND real image metadata.
 *
 * Important:
 * The browser has already uploaded the original file directly to Vercel Blob.
 * This function only persists that uploaded Blob URL into the media table.
 *
 * We intentionally do not compress/re-upload here, because that created a second
 * WebP file and made the DB point to the compressed copy while leaving the
 * original upload orphaned in Blob storage.
 *
 * Phase 2A.2 — FAIL CLOSED ON METADATA. This path used to store
 * `width: null, height: null`, which is precisely why the existing catalogue
 * needs a metadata backfill and why Merchant rejected oversized images. It now
 * probes the uploaded blob (a HEAD plus a bounded ~64 KB Range read — kilobytes,
 * not the tens of megabytes the file weighs), retries transient failures, and
 * writes the row ONLY once width, height, filesize and mimeType are known.
 *
 * If the probe cannot establish metadata the row is NOT created and
 * `MediaMetadataUnavailableError` is thrown. The already-uploaded blob is left
 * untouched — never deleted, never replaced, never duplicated — so the client
 * can retry completion with the same URL and pathname and succeed.
 */
export const createMediaFromUpload = async (
  input: CreateMediaFromUploadInput,
) => {
  if (!input.alt || input.alt.trim().length === 0) {
    throw new Error(
      "Alt text is required for accessibility. Provide a descriptive alt for every media upload.",
    );
  }

  const probed = await probeUploadedBlob(input.url);

  const record = await createMediaRecord({
    alt: input.alt,
    blurDataUrl: null,
    filename: input.filename,
    filesize: probed.filesize ?? input.size ?? null,
    height: probed.height,
    key: input.pathname,
    metadata: {
      source: "vercel-blob",
    },
    // The parsed container beats the client-reported type, which comes from the
    // filename extension and can be wrong.
    mimeType: probed.mimeType,
    url: input.url,
    width: probed.width,
  });

  return record;
};
