/**
 * Google Merchant API integration — configuration, guard rails and error type.
 *
 * SERVER ONLY. Nothing in `lib/google-merchant/**` may be imported from a
 * client component or bundled into the browser: these modules read
 * `GOOGLE_WIF_CREDENTIALS_JSON` (a Workload Identity Federation credential
 * configuration) and touch the filesystem. `assertServerRuntime()` below is the
 * runtime backstop — every public entry point calls it first.
 *
 * Deliberately NOT exposed through any `NEXT_PUBLIC_*` variable.
 *
 * Scope of this module: environment reading + validation only. No network I/O,
 * no filesystem access, no database access.
 */

/** OAuth scope required by the Merchant API (Content API for Shopping). */
export const GOOGLE_MERCHANT_SCOPE = "https://www.googleapis.com/auth/content";

/**
 * The ONLY path the WIF credential configuration is allowed to read the raw
 * Vercel OIDC token from. Pinned so a swapped-in credential configuration
 * cannot make the Google client read an arbitrary file off the function's
 * filesystem.
 */
export const VERCEL_OIDC_TOKEN_FILE = "/tmp/vercel-oidc-token";

/** Google Security Token Service host — the only permitted `token_url` host. */
export const GOOGLE_STS_HOST = "sts.googleapis.com";

/**
 * Google IAM Credentials host — the only permitted
 * `service_account_impersonation_url` host.
 */
export const GOOGLE_IAM_CREDENTIALS_HOST = "iamcredentials.googleapis.com";

export type GoogleMerchantErrorCode =
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "WIF_CONFIG_MISSING"
  | "WIF_CONFIG_INVALID"
  | "WIF_ENDPOINT_INVALID"
  | "WIF_CREDENTIAL_SOURCE_INVALID"
  | "WIF_CLIENT_INIT_FAILED"
  | "OIDC_TOKEN_UNAVAILABLE"
  | "OIDC_TOKEN_FILE_FAILED"
  | "TOKEN_EXCHANGE_FAILED"
  | "GOOGLE_ACCOUNT_MISMATCH"
  | "GOOGLE_UNAUTHENTICATED"
  | "GOOGLE_PERMISSION_DENIED"
  | "GOOGLE_RATE_LIMITED"
  | "GOOGLE_UNAVAILABLE"
  | "GOOGLE_REQUEST_FAILED"
  | "NOT_SERVER_RUNTIME";

/**
 * Error type for the whole Google Merchant integration.
 *
 * INVARIANT: `message` is always a static, human-authored string that is safe
 * to return to an authenticated admin caller. It must NEVER be built from an
 * OIDC token, an access token, the credential configuration, an upstream
 * response body or another error's message/stack. `upstreamStatus` is kept for
 * server-side logging only.
 */
export class GoogleMerchantError extends Error {
  readonly code: GoogleMerchantErrorCode;
  /** HTTP status the admin API should surface for this failure. */
  readonly status: number;
  /** Upstream Google HTTP status, when the failure came from Google. */
  readonly upstreamStatus?: number;

  constructor(
    code: GoogleMerchantErrorCode,
    message: string,
    status = 500,
    upstreamStatus?: number,
  ) {
    super(message);
    this.name = "GoogleMerchantError";
    this.code = code;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Runtime backstop against accidental client-side bundling.
 *
 * The repository does not depend on the `server-only` package, so this is the
 * equivalent guard: if any of these modules ever end up evaluated in a browser
 * bundle, the call fails loudly instead of leaking credential handling code.
 */
export function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new GoogleMerchantError(
      "NOT_SERVER_RUNTIME",
      "Google Merchant modules are server-only.",
      500,
    );
  }
}

/**
 * True only on the production runtime.
 *
 * The Workload Identity Provider only trusts the OIDC subject
 * `owner:odyssey-therapeia:project:fromthetrunk-admin:environment:production`,
 * so any non-production runtime could not authenticate anyway — we fail before
 * ever reading a token rather than surfacing a confusing Google error.
 *
 * `VERCEL_ENV` is authoritative when present (preview deployments build with
 * `NODE_ENV=production`); `NODE_ENV` is the fallback for non-Vercel runtimes.
 */
export function isProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

/**
 * Kill switch for the one-time registration endpoint.
 *
 * The endpoint must NOT stay reachable after the one-time `registerGcp` call —
 * unset `GOOGLE_MERCHANT_REGISTRATION_ENABLED` (or set it to anything other
 * than the exact string "true") to make the route return 404 again.
 */
export function isGoogleMerchantRegistrationEnabled(): boolean {
  return process.env.GOOGLE_MERCHANT_REGISTRATION_ENABLED === "true";
}

export type GoogleMerchantConfig = {
  /** Merchant Center account ID, digits only. */
  accountId: string;
  /** Google account email that owns the developer registration. */
  developerEmail: string;
  /** Merchant API data source ID — reserved for the later product sync. */
  dataSourceId: string | null;
  /** Full `accounts/{id}/dataSources/{id}` resource name, when configured. */
  dataSourceName: string | null;
};

const ACCOUNT_ID_PATTERN = /^\d+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readEnv = (name: string): string | null => {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Read + validate the Merchant Center configuration. Fails closed.
 *
 * `accountId` and `developerEmail` are required (both are needed to build the
 * registration request). The data-source values are optional here because they
 * are only consumed by the future product synchronisation — a missing data
 * source must not block the one-time registration.
 *
 * `accountId` is pattern-checked because it is interpolated into the Merchant
 * API URL path.
 */
export function getGoogleMerchantConfig(): GoogleMerchantConfig {
  const accountId = readEnv("GOOGLE_MERCHANT_ACCOUNT_ID");
  const developerEmail = readEnv("GOOGLE_MERCHANT_DEVELOPER_EMAIL");

  if (!accountId) {
    throw new GoogleMerchantError(
      "CONFIG_MISSING",
      "GOOGLE_MERCHANT_ACCOUNT_ID is not configured.",
      500,
    );
  }

  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new GoogleMerchantError(
      "CONFIG_INVALID",
      "GOOGLE_MERCHANT_ACCOUNT_ID must be numeric.",
      500,
    );
  }

  if (!developerEmail) {
    throw new GoogleMerchantError(
      "CONFIG_MISSING",
      "GOOGLE_MERCHANT_DEVELOPER_EMAIL is not configured.",
      500,
    );
  }

  if (!EMAIL_PATTERN.test(developerEmail)) {
    throw new GoogleMerchantError(
      "CONFIG_INVALID",
      "GOOGLE_MERCHANT_DEVELOPER_EMAIL is not a valid email address.",
      500,
    );
  }

  return {
    accountId,
    developerEmail,
    dataSourceId: readEnv("GOOGLE_MERCHANT_DATA_SOURCE_ID"),
    dataSourceName: readEnv("GOOGLE_MERCHANT_DATA_SOURCE_NAME"),
  };
}
