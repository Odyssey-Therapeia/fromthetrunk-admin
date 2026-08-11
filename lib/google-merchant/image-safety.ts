/**
 * Phase 2A.2 — the SINGLE source of truth for Google Merchant image eligibility.
 *
 * PURE. No network, no database, no environment beyond the canonical origin
 * constant. Every Merchant image rule lives here: the mapper, the readiness
 * audit and any future sync code all call into this module rather than
 * re-deriving limits, so a policy change is a one-line change here.
 *
 * DESIGN PRINCIPLE: this never optimises, resizes, re-encodes, replaces or
 * deletes media. The storefront, the admin galleries, the RSS feed and the Meta
 * feed keep using every original high-resolution file. All that happens here is
 * SELECTION: Merchant receives only the subset of existing media that satisfies
 * Merchant's limits.
 *
 *   website images:  1) 26 MB  2) 8 MB  3) 35 MB  4) 6 MB
 *   Merchant gets:   imageLink = #2, additionalImageLinks = [#4]
 *
 * FAIL CLOSED: unknown filesize or unknown dimensions make an image unsafe. A
 * media row whose width/height are still null (the state of production media
 * before the metadata backfill) is therefore not submitted — that is deliberate,
 * and the backfill exists to resolve it.
 */

import type { ProductWithRelations } from "@/db/queries/products";
import { CANONICAL_SITE_ORIGIN } from "@/lib/google-merchant/config";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Maximum file size Merchant accepts.
 *
 * Google states "16 MB". Interpreted as 16,000,000 bytes rather than 16 MiB —
 * the stricter of the two readings, so an image can never be rejected upstream
 * because we assumed the more generous unit.
 */
export const MERCHANT_MAX_IMAGE_BYTES = 16_000_000;

/** Maximum pixel count Merchant accepts (64 megapixels). */
export const MERCHANT_MAX_IMAGE_PIXELS = 64_000_000;

/** Minimum dimensions for apparel imagery. */
export const MERCHANT_MIN_APPAREL_WIDTH = 250;
export const MERCHANT_MIN_APPAREL_HEIGHT = 250;

/** Maximum `additionalImageLinks` entries Merchant accepts. */
export const MERCHANT_MAX_ADDITIONAL_IMAGES = 10;

/**
 * Image types we are willing to submit.
 *
 * An allowlist, not `image/*`: we only submit formats whose dimensions this
 * repository can verify (see lib/media/image-dimensions.ts). Anything else —
 * GIF, AVIF, SVG, HEIC, a missing MIME type — fails closed.
 */
export const MERCHANT_SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type MerchantSupportedImageMimeType =
  (typeof MERCHANT_SUPPORTED_IMAGE_MIME_TYPES)[number];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export const MERCHANT_IMAGE_SAFETY_REASONS = [
  "URL_NOT_PUBLIC_HTTPS",
  "UNSUPPORTED_MIME_TYPE",
  "FILESIZE_MISSING",
  "FILE_TOO_LARGE",
  "DIMENSIONS_MISSING",
  "DIMENSIONS_TOO_SMALL",
  "TOO_MANY_PIXELS",
] as const;

export type MerchantImageSafetyReason =
  (typeof MERCHANT_IMAGE_SAFETY_REASONS)[number];

export type MerchantImageSafetyResult = {
  safe: boolean;
  reasons: MerchantImageSafetyReason[];
};

/** The media fields this module reads — a subset of MediaRecord. */
export type MerchantImageCandidate = {
  id?: null | string;
  mimeType?: null | string;
  filesize?: null | number;
  width?: null | number;
  height?: null | number;
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Normalise `image/jpeg; charset=binary` → `image/jpeg`. */
const normaliseMimeType = (value: null | string | undefined): null | string => {
  if (typeof value !== "string") return null;

  const normalised = value.split(";")[0]?.trim().toLowerCase();
  return normalised && normalised.length > 0 ? normalised : null;
};

export const isSupportedMerchantMimeType = (
  value: null | string | undefined,
): value is MerchantSupportedImageMimeType =>
  MERCHANT_SUPPORTED_IMAGE_MIME_TYPES.includes(
    normaliseMimeType(value) as MerchantSupportedImageMimeType,
  );

/**
 * Absolutise and validate a media URL for Merchant use.
 *
 * `resolveMediaURL` yields either an absolute URL (Vercel Blob) or a
 * site-relative path, so relative paths resolve against the canonical
 * storefront origin. Only https survives — Google rejects http, and
 * data:/blob:/javascript: URLs are not crawlable.
 */
export function toPublicMerchantImageUrl(raw: string): null | string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let url: URL;
  try {
    url = new URL(trimmed, `${CANONICAL_SITE_ORIGIN}/`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.hostname.length === 0) return null;
  if (url.username !== "" || url.password !== "") return null;

  return url.toString();
}

/**
 * Classify one media asset against Merchant's image limits.
 *
 * Every failing rule is reported, not just the first, so the audit can tell an
 * operator everything that is wrong with an asset in one pass.
 *
 * @param resolvedUrl the already-absolutised public URL, or null when the media
 *   could not be resolved to one.
 */
export function evaluateMerchantImageSafety(
  media: MerchantImageCandidate,
  resolvedUrl: null | string,
): MerchantImageSafetyResult {
  const reasons: MerchantImageSafetyReason[] = [];

  if (!resolvedUrl || toPublicMerchantImageUrl(resolvedUrl) === null) {
    reasons.push("URL_NOT_PUBLIC_HTTPS");
  }

  if (!isSupportedMerchantMimeType(media.mimeType)) {
    reasons.push("UNSUPPORTED_MIME_TYPE");
  }

  if (!isPositiveInteger(media.filesize)) {
    reasons.push("FILESIZE_MISSING");
  } else if (media.filesize > MERCHANT_MAX_IMAGE_BYTES) {
    reasons.push("FILE_TOO_LARGE");
  }

  const width = media.width;
  const height = media.height;

  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    reasons.push("DIMENSIONS_MISSING");
  } else {
    if (
      width < MERCHANT_MIN_APPAREL_WIDTH ||
      height < MERCHANT_MIN_APPAREL_HEIGHT
    ) {
      reasons.push("DIMENSIONS_TOO_SMALL");
    }

    // Both operands are positive safe integers well under 2^26, so the product
    // is exact; the guard keeps that assumption honest if either ever grows.
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || pixels > MERCHANT_MAX_IMAGE_PIXELS) {
      reasons.push("TOO_MANY_PIXELS");
    }
  }

  return { reasons, safe: reasons.length === 0 };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export type IgnoredMerchantImage = {
  mediaId: null | string;
  sortOrder: number;
  reasons: MerchantImageSafetyReason[];
};

export type MerchantImageDiagnostics = {
  totalImages: number;
  safeImages: number;
  ignoredImages: number;
  duplicateImages: number;
  /** INTERNAL detail — never returned wholesale by a public endpoint. */
  ignored: IgnoredMerchantImage[];
};

export type MerchantImageSelection = {
  /** First Merchant-safe image, or null when the product has none. */
  imageLink: null | string;
  /** Up to MERCHANT_MAX_ADDITIONAL_IMAGES further safe, unique images. */
  additionalImageLinks: string[];
  diagnostics: MerchantImageDiagnostics;
};

/**
 * Choose the Merchant-safe subset of a product's images.
 *
 * Original `sortOrder` is preserved among the survivors, so the first SAFE
 * image becomes the primary even when earlier images were discarded:
 *
 *   sort 0 = 18 MB (unsafe)   sort 1 = 8 MB (safe)
 *   sort 2 = 22 MB (unsafe)   sort 3 = 7 MB (safe)
 *   → imageLink = sort 1, additionalImageLinks = [sort 3]
 *
 * An unsafe ADDITIONAL image never disqualifies the product — it is simply left
 * out. Only a product with zero safe images cannot be submitted.
 *
 * Duplicates are removed by final resolved URL, so the same blob appearing at
 * two sort positions is submitted once and can never appear in both
 * `imageLink` and `additionalImageLinks`.
 */
export function selectMerchantImages(
  product: ProductWithRelations,
): MerchantImageSelection {
  const ordered = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);

  const safeUrls: string[] = [];
  const seenUrls = new Set<string>();
  const ignored: IgnoredMerchantImage[] = [];
  let duplicateImages = 0;

  for (const entry of ordered) {
    const media = (entry.media ?? {}) as MerchantImageCandidate;
    const rawUrl = resolveMediaURL(entry);
    const resolvedUrl = rawUrl ? toPublicMerchantImageUrl(rawUrl) : null;
    const safety = evaluateMerchantImageSafety(media, resolvedUrl);

    if (!safety.safe || !resolvedUrl) {
      ignored.push({
        mediaId: typeof media.id === "string" ? media.id : null,
        reasons: safety.reasons,
        sortOrder: entry.sortOrder,
      });
      continue;
    }

    if (seenUrls.has(resolvedUrl)) {
      duplicateImages += 1;
      continue;
    }

    seenUrls.add(resolvedUrl);
    safeUrls.push(resolvedUrl);
  }

  const [imageLink = null, ...rest] = safeUrls;

  return {
    additionalImageLinks: rest.slice(0, MERCHANT_MAX_ADDITIONAL_IMAGES),
    diagnostics: {
      duplicateImages,
      ignored,
      ignoredImages: ignored.length,
      safeImages: safeUrls.length,
      totalImages: ordered.length,
    },
    imageLink,
  };
}

/** The distinct reasons across every ignored image, in policy order. */
export function collectIgnoredImageReasons(
  diagnostics: MerchantImageDiagnostics,
): MerchantImageSafetyReason[] {
  const seen = new Set<MerchantImageSafetyReason>();

  for (const entry of diagnostics.ignored) {
    for (const reason of entry.reasons) seen.add(reason);
  }

  return MERCHANT_IMAGE_SAFETY_REASONS.filter((reason) => seen.has(reason));
}
