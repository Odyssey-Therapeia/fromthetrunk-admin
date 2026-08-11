/**
 * Bounded, SSRF-guarded remote image metadata probe.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Answers width / height / filesize / mimeType for a stored media asset WITHOUT
 * downloading it. Production media is 10–40 MB per file and there are hundreds
 * of them; a naive `fetch(url).arrayBuffer()` backfill would move gigabytes and
 * blow the function's memory. Instead:
 *
 *   1. HEAD            → content-length and content-type (cheap, no body)
 *   2. Range GET 0..64KB-1 → parse the header for dimensions
 *   3. one widening    → Range GET 0..256KB-1 when a JPEG's SOF marker sits
 *                        past the first window (long EXIF/ICC segments)
 *
 * Hard ceiling: MAX_PROBE_BYTES. The body is read incrementally and the stream
 * is cancelled the moment the cap is hit, so a server that ignores `Range` and
 * starts streaming 40 MB cannot make us buffer it.
 *
 * SSRF: the prober does NOT fetch arbitrary URLs. Only https, only hosts under
 * `.public.blob.vercel-storage.com`, no credentials, and every redirect hop is
 * re-validated against the same allowlist. Everything else fails closed.
 */

import { parseImageDimensions } from "@/lib/media/image-dimensions";

/** Only Vercel Blob public hosts may be probed. */
export const ALLOWED_PROBE_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** First Range window — enough for PNG/WebP and most JPEGs. */
export const INITIAL_PROBE_BYTES = 64 * 1024;

/** Absolute ceiling on bytes read from one asset, across all attempts. */
export const MAX_PROBE_BYTES = 256 * 1024;

/** Per-request network timeout. */
export const PROBE_TIMEOUT_MS = 8_000;

/** Maximum redirect hops, each re-validated. */
export const MAX_PROBE_REDIRECTS = 3;

export const IMAGE_PROBE_ERROR_CODES = [
  "URL_NOT_ALLOWED",
  "REQUEST_FAILED",
  "TIMEOUT",
  "TOO_MANY_REDIRECTS",
  "HTTP_ERROR",
  "RESPONSE_TOO_LARGE",
  "UNSUPPORTED_IMAGE",
  "MALFORMED_IMAGE",
] as const;

export type ImageProbeErrorCode = (typeof IMAGE_PROBE_ERROR_CODES)[number];

export type ImageProbeResult =
  | {
      ok: true;
      width: number;
      height: number;
      mimeType: string;
      /** From content-length; null when the server did not report one. */
      filesize: null | number;
    }
  | { ok: false; code: ImageProbeErrorCode; message: string };

const failure = (
  code: ImageProbeErrorCode,
  message: string,
): ImageProbeResult => ({ code, message, ok: false });

/**
 * Is this URL safe to probe?
 *
 * Fails closed on anything that is not an https Vercel Blob public URL:
 * other hosts, http, credentials in the URL, localhost, IP literals, and
 * lookalikes such as `evil.com/x.public.blob.vercel-storage.com`.
 */
export function isProbeAllowedUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;

  const hostname = url.hostname.toLowerCase();
  if (!hostname.endsWith(ALLOWED_PROBE_HOST_SUFFIX)) return false;

  // Require an actual store subdomain in front of the suffix.
  const store = hostname.slice(0, -ALLOWED_PROBE_HOST_SUFFIX.length);
  return store.length > 0 && !store.includes("/");
}

type FetchLike = typeof fetch;

/** Fetch with a timeout and manual redirect handling, re-validating each hop. */
async function guardedFetch(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<{ ok: true; response: Response } | { ok: false; result: ImageProbeResult }> {
  let target = url;

  for (let hop = 0; hop <= MAX_PROBE_REDIRECTS; hop += 1) {
    if (!isProbeAllowedUrl(target)) {
      return {
        ok: false,
        result: failure("URL_NOT_ALLOWED", "The URL is not an allowed media host."),
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetchImpl(target, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");

      return {
        ok: false,
        result: aborted
          ? failure("TIMEOUT", "The media host did not respond in time.")
          : failure("REQUEST_FAILED", "The media host could not be reached."),
      };
    } finally {
      clearTimeout(timer);
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) return { ok: true, response };

    const location = response.headers.get("location");
    if (!location) {
      return {
        ok: false,
        result: failure("HTTP_ERROR", "The media host returned an invalid redirect."),
      };
    }

    try {
      target = new URL(location, target).toString();
    } catch {
      return {
        ok: false,
        result: failure("URL_NOT_ALLOWED", "The redirect target is not a valid URL."),
      };
    }
  }

  return {
    ok: false,
    result: failure("TOO_MANY_REDIRECTS", "The media host redirected too many times."),
  };
}

/**
 * Read at most `limit` bytes of a response body, cancelling the stream after.
 *
 * A server that ignores `Range` streams the whole object; this makes that
 * harmless instead of a 40 MB allocation.
 */
async function readBounded(
  response: Response,
  limit: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; result: ImageProbeResult }> {
  const body = response.body;

  if (!body) {
    // No stream available (some runtimes/tests): fall back, but only when the
    // declared length is within the cap.
    const declared = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declared) && declared > limit) {
      return {
        ok: false,
        result: failure("RESPONSE_TOO_LARGE", "The media host returned too much data."),
      };
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > limit) {
      return {
        ok: false,
        result: failure("RESPONSE_TOO_LARGE", "The media host returned too much data."),
      };
    }

    return { bytes: buffer, ok: true };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      chunks.push(value);
      received += value.byteLength;

      if (received >= limit) break;
    }
  } catch {
    return {
      ok: false,
      result: failure("REQUEST_FAILED", "The media host stream failed."),
    };
  } finally {
    // Stop the transfer — nothing beyond `limit` is ever pulled.
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(Math.min(received, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= bytes.length) break;
    const slice = chunk.subarray(0, bytes.length - offset);
    bytes.set(slice, offset);
    offset += slice.byteLength;
  }

  return { bytes, ok: true };
}

/**
 * Probe one media URL for its dimensions, size and MIME type.
 *
 * @param options.fetchImpl injected in tests; defaults to global fetch.
 */
export async function probeImageMetadata(
  rawUrl: string,
  options: { fetchImpl?: FetchLike } = {},
): Promise<ImageProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!isProbeAllowedUrl(rawUrl)) {
    return failure("URL_NOT_ALLOWED", "The URL is not an allowed media host.");
  }

  // 1. HEAD — authoritative content-length and content-type, no body at all.
  let filesize: null | number = null;
  let headerMimeType: null | string = null;

  const head = await guardedFetch(rawUrl, { method: "HEAD" }, fetchImpl);
  if (head.ok) {
    if (head.response.ok) {
      const length = Number(head.response.headers.get("content-length"));
      if (Number.isSafeInteger(length) && length > 0) filesize = length;

      headerMimeType =
        head.response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
    }
    // A HEAD that 4xx/5xx is not fatal — some hosts disallow it. The Range GET
    // below decides.
  }

  // 2 + 3. Range GET, widened once if the header needs more bytes.
  let windowSize = INITIAL_PROBE_BYTES;

  for (;;) {
    const ranged = await guardedFetch(
      rawUrl,
      { headers: { Range: `bytes=0-${windowSize - 1}` }, method: "GET" },
      fetchImpl,
    );

    if (!ranged.ok) return ranged.result;
    if (!ranged.response.ok && ranged.response.status !== 206) {
      return failure("HTTP_ERROR", "The media host rejected the request.");
    }

    if (filesize === null) {
      // content-range: "bytes 0-65535/12345678" — the total is authoritative.
      const contentRange = ranged.response.headers.get("content-range");
      const total = contentRange?.split("/")[1];
      const parsed = Number(total);
      if (Number.isSafeInteger(parsed) && parsed > 0) filesize = parsed;
    }

    if (headerMimeType === null) {
      headerMimeType =
        ranged.response.headers.get("content-type")?.split(";")[0]?.trim() ??
        null;
    }

    const read = await readBounded(ranged.response, windowSize);
    if (!read.ok) return read.result;

    const parsed = parseImageDimensions(read.bytes);

    if (parsed.status === "ok") {
      return {
        filesize,
        height: parsed.height,
        // The parsed container wins over a header a host may have guessed.
        mimeType: parsed.mimeType,
        ok: true,
        width: parsed.width,
      };
    }

    if (parsed.status === "unsupported") {
      return failure(
        "UNSUPPORTED_IMAGE",
        "The media is not a JPEG, PNG or WebP image.",
      );
    }

    if (parsed.status === "invalid") {
      return failure("MALFORMED_IMAGE", "The media header could not be parsed.");
    }

    // "incomplete" — widen once, then give up.
    if (windowSize >= MAX_PROBE_BYTES) {
      return failure(
        "MALFORMED_IMAGE",
        "The media dimensions were not found within the probe limit.",
      );
    }

    // If we already know the file is smaller than the window, more bytes will
    // never arrive: the header really is malformed.
    if (filesize !== null && read.bytes.byteLength >= filesize) {
      return failure("MALFORMED_IMAGE", "The media header could not be parsed.");
    }

    windowSize = MAX_PROBE_BYTES;
  }
}
