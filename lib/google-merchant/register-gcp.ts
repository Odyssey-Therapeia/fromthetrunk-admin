/**
 * One-time Google Merchant API developer registration (`registerGcp`).
 *
 * SERVER ONLY. Never import from a client component.
 *
 * The Merchant API requires each GCP project that calls it to be registered
 * once against the Merchant Center account:
 *
 *   POST https://merchantapi.googleapis.com/accounts/v1/accounts/{account}/developerRegistration:registerGcp
 *
 * This module performs THAT CALL ONLY. It does not read or write the database,
 * and it does not create, update or delete products — product synchronisation
 * (which will reuse `lib/channels/feed-mapping.ts`) is a later change.
 *
 * Everything returned from here is safe to hand to the route: no tokens, no
 * credential configuration, no upstream response bodies.
 */

import {
  GoogleMerchantError,
  assertServerRuntime,
  getGoogleMerchantConfig,
} from "@/lib/google-merchant/config";
import { getGoogleMerchantAccessToken } from "@/lib/google-merchant/auth";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:register-gcp");

const MERCHANT_API_BASE_URL = "https://merchantapi.googleapis.com";

export type GoogleMerchantRegistrationResult = {
  registered: true;
  /** `accounts/{account}/developerRegistration` */
  name: string;
  /** GCP project IDs registered against the Merchant Center account. */
  gcpIds: string[];
  /** True when Google reported the project as already registered. */
  alreadyRegistered: boolean;
};

/** Shape of the Merchant API success payload, loosely typed then narrowed. */
type RegisterGcpPayload = {
  name?: unknown;
  gcpIds?: unknown;
  error?: { code?: unknown; status?: unknown; message?: unknown };
};

/** Read a JSON body without ever throwing (Google may return HTML on 5xx). */
async function readJsonSafely(response: Response): Promise<RegisterGcpPayload> {
  try {
    const parsed: unknown = await response.json();
    return typeof parsed === "object" && parsed !== null
      ? (parsed as RegisterGcpPayload)
      : {};
  } catch {
    return {};
  }
}

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

/**
 * True when Google is telling us the registration already exists.
 *
 * Google surfaces this as 409/ALREADY_EXISTS, but has also been observed to
 * return 400 with `error.status = "ALREADY_EXISTS"`, so both are treated as an
 * idempotent success — re-running the one-time registration must not fail.
 */
function isAlreadyRegistered(
  status: number,
  payload: RegisterGcpPayload,
): boolean {
  if (status === 409) return true;
  return payload.error?.status === "ALREADY_EXISTS";
}

/**
 * Map an upstream failure onto a sanitised error.
 *
 * The upstream body is deliberately NOT included: it can echo the request and
 * account context, and it is not needed by the caller.
 */
function mapGoogleFailure(status: number): GoogleMerchantError {
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
      "The service account is not permitted to register this Merchant Center account.",
      502,
      status,
    );
  }

  if (status === 429) {
    return new GoogleMerchantError(
      "GOOGLE_RATE_LIMITED",
      "Google rate-limited the registration request. Retry later.",
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
    "The Google Merchant API rejected the registration request.",
    502,
    status,
  );
}

/**
 * Perform the mandatory one-time `registerGcp` call.
 *
 * @throws {GoogleMerchantError} with a sanitised, static message.
 */
export async function registerGoogleMerchantGcpProject(): Promise<GoogleMerchantRegistrationResult> {
  assertServerRuntime();

  const config = getGoogleMerchantConfig();
  const registrationName = `accounts/${config.accountId}/developerRegistration`;
  const accessToken = await getGoogleMerchantAccessToken();

  const url = `${MERCHANT_API_BASE_URL}/accounts/v1/${registrationName}:registerGcp`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ developerEmail: config.developerEmail }),
    });
  } catch {
    // A fetch rejection can carry the request (and therefore the bearer token)
    // on some runtimes — never surface or log it.
    throw new GoogleMerchantError(
      "GOOGLE_REQUEST_FAILED",
      "The Google Merchant API could not be reached.",
      502,
    );
  }

  const payload = await readJsonSafely(response);

  if (response.ok) {
    return {
      registered: true,
      name: typeof payload.name === "string" ? payload.name : registrationName,
      gcpIds: toStringArray(payload.gcpIds),
      alreadyRegistered: false,
    };
  }

  if (isAlreadyRegistered(response.status, payload)) {
    log.info("GCP project already registered with Merchant Center", {
      status: response.status,
    });

    return {
      registered: true,
      name: registrationName,
      gcpIds: toStringArray(payload.gcpIds),
      alreadyRegistered: true,
    };
  }

  const error = mapGoogleFailure(response.status);
  log.error("Merchant API registerGcp failed", {
    code: error.code,
    status: response.status,
  });

  throw error;
}
