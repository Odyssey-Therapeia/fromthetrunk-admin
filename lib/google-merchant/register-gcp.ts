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
 * A conflict from that call is NOT self-evidently good news. "Already exists"
 * only means the calling GCP project is registered *somewhere* — it may be
 * registered to a different Merchant Center account entirely, in which case
 * this deployment cannot use the Merchant API and must fail loudly. So a
 * conflict is treated as a *candidate* for idempotency and is verified against
 * live Google state before it is ever reported as success:
 *
 *   GET .../accounts/v1/accounts:getAccountForGcpRegistration
 *       → must be exactly `accounts/{GOOGLE_MERCHANT_ACCOUNT_ID}`
 *   GET .../accounts/v1/accounts/{GOOGLE_MERCHANT_ACCOUNT_ID}/developerRegistration
 *       → strictly validated DeveloperRegistration
 *
 * Anything else — a different account, a malformed body, an unexpected name
 * format, an upstream error, a network failure — fails closed.
 *
 * This module performs THOSE CALLS ONLY. It does not read or write the
 * database, and it does not create, update or delete products — product
 * synchronisation (which will reuse `lib/channels/feed-mapping.ts`) is a later
 * change.
 *
 * Everything returned from here is safe to hand to the route: no tokens, no
 * credential configuration, no upstream response bodies, and no indication of
 * whether the registration was fresh or pre-existing.
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
};

/** Loosely typed Merchant API payload, narrowed by the validators below. */
type MerchantApiPayload = {
  name?: unknown;
  gcpIds?: unknown;
  error?: { code?: unknown; status?: unknown; message?: unknown };
};

/** `accounts/{digits}` — the shape `getAccountForGcpRegistration` returns. */
const ACCOUNT_NAME_PATTERN = /^accounts\/\d+$/;

/** Read a JSON body without ever throwing (Google may return HTML on 5xx). */
async function readJsonSafely(response: Response): Promise<MerchantApiPayload> {
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

/** A response Google returned successfully but whose body we cannot trust. */
const unexpectedResponse = (upstreamStatus?: number): GoogleMerchantError =>
  new GoogleMerchantError(
    "GOOGLE_REQUEST_FAILED",
    "The Google Merchant API returned an unexpected response.",
    502,
    upstreamStatus,
  );

/** A request that never reached Google (DNS, TLS, socket, abort). */
const unreachable = (): GoogleMerchantError =>
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
async function merchantApiFetch(
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

/**
 * Strictly validate a DeveloperRegistration payload.
 *
 * `name` must be exactly the registration resource of the configured account —
 * a registration belonging to any other account is not evidence that THIS
 * deployment is registered. `gcpIds` must be an array of strings; a single
 * non-string entry invalidates the whole payload rather than being silently
 * dropped.
 */
function validateDeveloperRegistration(
  payload: MerchantApiPayload,
  expectedRegistrationName: string,
  upstreamStatus: number,
): GoogleMerchantRegistrationResult {
  if (
    typeof payload.name !== "string" ||
    payload.name !== expectedRegistrationName
  ) {
    throw unexpectedResponse(upstreamStatus);
  }

  if (!Array.isArray(payload.gcpIds)) {
    throw unexpectedResponse(upstreamStatus);
  }

  if (!payload.gcpIds.every((entry): entry is string => typeof entry === "string")) {
    throw unexpectedResponse(upstreamStatus);
  }

  return {
    registered: true,
    name: payload.name,
    gcpIds: [...payload.gcpIds],
  };
}

/**
 * A conflict from `registerGcp` is only a CANDIDATE for idempotency.
 *
 * Google surfaces the duplicate as 409/ALREADY_EXISTS, and has also been
 * observed to return 400 with `error.status = "ALREADY_EXISTS"`. Neither is
 * treated as success here — both merely trigger verification.
 */
function isDuplicateCandidate(
  status: number,
  payload: MerchantApiPayload,
): boolean {
  return status === 409 || payload.error?.status === "ALREADY_EXISTS";
}

/**
 * Confirm that the GCP project's existing registration belongs to THIS
 * Merchant Center account, and return that registration.
 *
 * Step 1 — `accounts:getAccountForGcpRegistration` answers "which Merchant
 * account is the calling GCP project registered to?". Only an exact match on
 * `accounts/{GOOGLE_MERCHANT_ACCOUNT_ID}` is acceptable.
 *
 * Step 2 — the DeveloperRegistration itself, strictly validated, so the caller
 * gets the same payload shape a fresh registration produces.
 *
 * The other account's ID is never logged and never returned.
 */
async function verifyExistingRegistration(
  accessToken: string,
  accountId: string,
  registrationName: string,
): Promise<GoogleMerchantRegistrationResult> {
  const accountResponse = await merchantApiFetch(
    `${MERCHANT_API_BASE_URL}/accounts/v1/accounts:getAccountForGcpRegistration`,
    accessToken,
    { method: "GET" },
  );

  if (!accountResponse.ok) {
    throw mapGoogleFailure(accountResponse.status);
  }

  const accountPayload = await readJsonSafely(accountResponse);

  if (
    typeof accountPayload.name !== "string" ||
    !ACCOUNT_NAME_PATTERN.test(accountPayload.name)
  ) {
    // Malformed body or an unrecognised name format — unverifiable, so unsafe.
    throw unexpectedResponse(accountResponse.status);
  }

  if (accountPayload.name !== `accounts/${accountId}`) {
    // Confirmed: the GCP project belongs to a DIFFERENT Merchant Center
    // account. Neither the message nor the log names that account.
    throw new GoogleMerchantError(
      "GOOGLE_ACCOUNT_MISMATCH",
      "The GCP project is already registered to a different Merchant Center account.",
      409,
      accountResponse.status,
    );
  }

  const registrationResponse = await merchantApiFetch(
    `${MERCHANT_API_BASE_URL}/accounts/v1/${registrationName}`,
    accessToken,
    { method: "GET" },
  );

  if (!registrationResponse.ok) {
    throw mapGoogleFailure(registrationResponse.status);
  }

  return validateDeveloperRegistration(
    await readJsonSafely(registrationResponse),
    registrationName,
    registrationResponse.status,
  );
}

/**
 * Perform the mandatory one-time `registerGcp` call, verifying any conflict
 * against live Google state before reporting success.
 *
 * @throws {GoogleMerchantError} with a sanitised, static message.
 */
export async function registerGoogleMerchantGcpProject(): Promise<GoogleMerchantRegistrationResult> {
  assertServerRuntime();

  const config = getGoogleMerchantConfig();
  const registrationName = `accounts/${config.accountId}/developerRegistration`;
  const accessToken = await getGoogleMerchantAccessToken();

  const response = await merchantApiFetch(
    `${MERCHANT_API_BASE_URL}/accounts/v1/${registrationName}:registerGcp`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ developerEmail: config.developerEmail }),
    },
  );

  const payload = await readJsonSafely(response);

  if (response.ok) {
    return validateDeveloperRegistration(
      payload,
      registrationName,
      response.status,
    );
  }

  if (isDuplicateCandidate(response.status, payload)) {
    log.info("registerGcp reported a conflict — verifying with Google", {
      status: response.status,
    });

    try {
      return await verifyExistingRegistration(
        accessToken,
        config.accountId,
        registrationName,
      );
    } catch (error) {
      if (error instanceof GoogleMerchantError) {
        log.error("Could not verify the existing GCP registration", {
          code: error.code,
          upstreamStatus: error.upstreamStatus,
        });
      }

      throw error;
    }
  }

  const error = mapGoogleFailure(response.status);
  log.error("Merchant API registerGcp failed", {
    code: error.code,
    status: response.status,
  });

  throw error;
}
