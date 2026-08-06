/**
 * Shared Merchant API HTTP plumbing.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Every Merchant API call in this integration goes through `merchantApiFetch`
 * so that authentication, network-failure handling and upstream-status mapping
 * are implemented exactly once. Callers never see a raw upstream body: Google's
 * error payloads echo the request (and on some runtimes a fetch rejection
 * carries the request object, and therefore the bearer token), so responses and
 * caught errors are converted into sanitised, static-message errors here.
 */

import { GoogleMerchantError } from "@/lib/google-merchant/config";

export const MERCHANT_API_BASE_URL = "https://merchantapi.googleapis.com";

/** Loosely typed Merchant API payload, narrowed by each caller's validator. */
export type MerchantApiPayload = {
  name?: unknown;
  gcpIds?: unknown;
  product?: unknown;
  offerId?: unknown;
  contentLanguage?: unknown;
  feedLabel?: unknown;
  dataSource?: unknown;
  error?: { code?: unknown; status?: unknown; message?: unknown };
};

/** Read a JSON body without ever throwing (Google may return HTML on 5xx). */
export async function readJsonSafely(
  response: Response,
): Promise<MerchantApiPayload> {
  try {
    const parsed: unknown = await response.json();
    return typeof parsed === "object" && parsed !== null
      ? (parsed as MerchantApiPayload)
      : {};
  } catch {
    return {};
  }
}

/**
 * Map an upstream failure onto a sanitised error.
 *
 * The upstream body is deliberately NOT included: it can echo the request, the
 * bearer token and the account context, and it is not needed by the caller.
 */
export function mapGoogleFailure(status: number): GoogleMerchantError {
  if (status === 401) {
    return new GoogleMerchantError(
      "GOOGLE_UNAUTHENTICATED",
      "Google rejected the workload identity credentials.",
      502,
      status,
    );
  }

  if (status === 403) {
    return new GoogleMerchantError(
      "GOOGLE_PERMISSION_DENIED",
      "The service account is not permitted to perform this Merchant Center operation.",
      502,
      status,
    );
  }

  if (status === 429) {
    return new GoogleMerchantError(
      "GOOGLE_RATE_LIMITED",
      "Google rate-limited the request. Retry later.",
      429,
      status,
    );
  }

  if (status >= 500) {
    return new GoogleMerchantError(
      "GOOGLE_UNAVAILABLE",
      "Google Merchant API is temporarily unavailable.",
      502,
      status,
    );
  }

  return new GoogleMerchantError(
    "GOOGLE_REQUEST_FAILED",
    "The Google Merchant API rejected the request.",
    502,
    status,
  );
}

/** A response Google returned successfully but whose body we cannot trust. */
export const unexpectedResponse = (
  upstreamStatus?: number,
): GoogleMerchantError =>
  new GoogleMerchantError(
    "GOOGLE_REQUEST_FAILED",
    "The Google Merchant API returned an unexpected response.",
    502,
    upstreamStatus,
  );

/** A request that never reached Google (DNS, TLS, socket, abort). */
export const unreachable = (): GoogleMerchantError =>
  new GoogleMerchantError(
    "GOOGLE_REQUEST_FAILED",
    "The Google Merchant API could not be reached.",
    502,
  );

/**
 * Issue a Merchant API request, converting a network failure into a sanitised
 * error. A fetch rejection can carry the request — and therefore the bearer
 * token — on some runtimes, so the caught error is never surfaced or logged.
 */
export async function merchantApiFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw unreachable();
  }
}
