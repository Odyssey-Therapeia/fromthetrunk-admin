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
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_NOT_PUBLISHED"
  | "PRODUCT_SLUG_MISMATCH"
  | "PRODUCT_NOT_PURCHASABLE"
  | "PRODUCT_PRICE_INVALID"
  | "PRODUCT_IMAGE_MISSING"
  | "PRODUCT_IMAGE_INVALID"
  | "PRODUCT_LINK_INVALID"
  | "MERCHANT_PRODUCT_DATA_INCOMPLETE"
  | "MERCHANT_NO_SAFE_IMAGE"
  | "CATALOGUE_BACKFILL_REFUSED"
  | "CATALOGUE_BACKFILL_WRITE_FAILED"
  | "SYNC_LIMIT_INVALID"
  | "MERCHANT_DELETE_NOT_PERMITTED"
  | "MERCHANT_DELETE_INVARIANT_VIOLATED"
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
 * The product is missing attributes Google requires for an apparel offer.
 *
 * `missingFields` is a list of OUR field names (color, gender, …) — never a
 * database column, a row value, a credential or a stack frame. The route
 * surfaces it verbatim in a 422 so an admin knows what to fill in.
 */
export class GoogleMerchantProductDataError extends GoogleMerchantError {
  readonly missingFields: string[];

  constructor(missingFields: string[]) {
    super(
      "MERCHANT_PRODUCT_DATA_INCOMPLETE",
      "The product is missing required Google Merchant attributes.",
      422,
    );
    this.name = "GoogleMerchantProductDataError";
    this.missingFields = [...missingFields];
  }
}

/**
 * The product has images, but none of them satisfy Merchant's limits.
 *
 * `imageReasons` are the distinct `MerchantImageSafetyReason` values across the
 * discarded assets — policy codes only, never a media row, a URL or a storage
 * key. Kept as a subclass (like GoogleMerchantProductDataError) so the readiness
 * audit can map them to detailed reason codes without re-running the selector.
 */
export class GoogleMerchantImageError extends GoogleMerchantError {
  readonly imageReasons: string[];

  constructor(imageReasons: string[]) {
    super(
      "MERCHANT_NO_SAFE_IMAGE",
      "The product has no image that satisfies Google Merchant's limits.",
      422,
    );
    this.name = "GoogleMerchantImageError";
    this.imageReasons = [...imageReasons];
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

/**
 * Kill switch for the single controlled product-insert endpoint.
 *
 * Same contract as the registration switch: the route 404s unless this is the
 * exact string "true", and it must be turned off again once the one controlled
 * insertion has been made. There is no catalogue sync behind this flag.
 */
export function isGoogleMerchantTestInsertEnabled(): boolean {
  return process.env.GOOGLE_MERCHANT_TEST_INSERT_ENABLED === "true";
}

/**
 * Kill switch for the catalogue attribute backfill APPLY endpoint.
 *
 * The preview needs no switch — it cannot write. Apply mutates
 * `products.attributes`, so it stays 404 unless this is the exact string
 * "true", and must be turned off again once the backfill has run.
 */
export function isGoogleMerchantCatalogueBackfillEnabled(): boolean {
  return process.env.GOOGLE_MERCHANT_CATALOGUE_BACKFILL_ENABLED === "true";
}

/**
 * Kill switch for the catalogue synchronisation APPLY endpoint.
 *
 * The preview and status endpoints need no switch — they only read. Apply
 * writes product inputs into Merchant Center, so it stays 404 unless this is
 * the exact string "true", and must be turned off again between batches.
 */
export function isGoogleMerchantCatalogueSyncEnabled(): boolean {
  return process.env.GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED === "true";
}

/**
 * Kill switch for the AUTOMATIC inventory reconciliation worker.
 *
 * Deliberately separate from `GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED`: that one
 * gates the manual, human-triggered bootstrap endpoints and is expected to stay
 * "false" in normal production. This one gates the unattended cron worker that
 * keeps Merchant availability following Neon inventory, and is the switch that
 * stays "true" once the rollout is complete.
 *
 * When false the cron still answers 200 but performs ZERO Google writes.
 */
export function isGoogleMerchantInventorySyncEnabled(): boolean {
  return process.env.GOOGLE_MERCHANT_INVENTORY_SYNC_ENABLED === "true";
}

/**
 * Kill switch for the media metadata backfill APPLY endpoint.
 *
 * The preview needs no switch — it only reads. Apply probes remote media and
 * writes machine-derived metadata onto media rows, so it stays 404 unless this
 * is the exact string "true".
 */
export function isGoogleMerchantImageMetadataBackfillEnabled(): boolean {
  return (
    process.env.GOOGLE_MERCHANT_IMAGE_METADATA_BACKFILL_ENABLED === "true"
  );
}

/**
 * The canonical storefront origin.
 *
 * Landing-page and image links submitted to Google must be served from this
 * origin — a preview deployment URL in a feed would be both wrong and
 * unverifiable for Google's crawler. Mirrors the default in `lib/config/site`.
 */
export const CANONICAL_SITE_ORIGIN = "https://www.fromthetrunk.shop";

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

/**
 * The data source every product input must be written to. Fails closed.
 *
 * Required (unlike for registration) because an insert without a data source —
 * or against a data source belonging to another account — is not something we
 * want to discover from Google's error message.
 */
export function getGoogleMerchantDataSourceName(
  config: GoogleMerchantConfig,
): string {
  if (!config.dataSourceName) {
    throw new GoogleMerchantError(
      "CONFIG_MISSING",
      "GOOGLE_MERCHANT_DATA_SOURCE_NAME is not configured.",
      500,
    );
  }

  const expectedPrefix = `accounts/${config.accountId}/dataSources/`;

  if (
    !config.dataSourceName.startsWith(expectedPrefix) ||
    !/^\d+$/.test(config.dataSourceName.slice(expectedPrefix.length))
  ) {
    throw new GoogleMerchantError(
      "CONFIG_INVALID",
      "GOOGLE_MERCHANT_DATA_SOURCE_NAME must be accounts/{accountId}/dataSources/{dataSourceId}.",
      500,
    );
  }

  if (
    config.dataSourceId &&
    config.dataSourceName !== `${expectedPrefix}${config.dataSourceId}`
  ) {
    throw new GoogleMerchantError(
      "CONFIG_INVALID",
      "GOOGLE_MERCHANT_DATA_SOURCE_NAME and GOOGLE_MERCHANT_DATA_SOURCE_ID disagree.",
      500,
    );
  }

  return config.dataSourceName;
}
