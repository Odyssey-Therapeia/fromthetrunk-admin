/**
 * Vercel OIDC → Google Workload Identity Federation authentication.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Flow (no long-lived Google credential exists anywhere in this repo):
 *
 *   1. Vercel mints a short-lived OIDC token for the running function whose
 *      subject is `owner:<team>:project:<project>:environment:production`.
 *   2. Google's Security Token Service exchanges that token for a federated
 *      token (the Workload Identity Provider only trusts the production
 *      subject above).
 *   3. IAM Credentials impersonates
 *      `ftt-merchant-sync@ftt-merchant-integration.iam.gserviceaccount.com`
 *      and returns a short-lived access token scoped to
 *      `https://www.googleapis.com/auth/content`.
 *
 * `google-auth-library`'s external-account client reads the raw OIDC token
 * from a file (`credential_source.file`), so this module writes the token to
 * `/tmp/vercel-oidc-token` with mode 0600 for the duration of the exchange and
 * shreds it in a `finally` block.
 *
 * Secret handling rules enforced here:
 *   - The OIDC token and the resulting access token are NEVER logged, never
 *     put into an error message, never persisted beyond the temp file.
 *   - `GOOGLE_WIF_CREDENTIALS_JSON` is NEVER logged, not even on parse failure
 *     (`JSON.parse` error messages echo a slice of the input).
 *   - The credential configuration is validated before use: an attacker who
 *     could swap the env var must not be able to point the exchange at a
 *     non-Google STS endpoint or make the client read an arbitrary file.
 */

import { chmod, rm, writeFile } from "node:fs/promises";

import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";
import type { ExternalAccountClientOptions } from "google-auth-library";

import {
  GOOGLE_IAM_CREDENTIALS_HOST,
  GOOGLE_MERCHANT_SCOPE,
  GOOGLE_STS_HOST,
  GoogleMerchantError,
  VERCEL_OIDC_TOKEN_FILE,
  assertServerRuntime,
} from "@/lib/google-merchant/config";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:auth");

/** Mode 0600 — owner read/write only. */
const TOKEN_FILE_MODE = 0o600;

type CredentialConfiguration = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Assert that `value` is an `https://` URL served by exactly `expectedHost`.
 *
 * Host equality is exact (no suffix matching) so `sts.googleapis.com.evil.tld`
 * is rejected.
 */
const assertGoogleEndpoint = (
  value: unknown,
  expectedHost: string,
  field: string,
): void => {
  if (typeof value !== "string" || value.length === 0) {
    throw new GoogleMerchantError(
      "WIF_ENDPOINT_INVALID",
      `Workload Identity credential configuration is missing ${field}.`,
      500,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new GoogleMerchantError(
      "WIF_ENDPOINT_INVALID",
      `Workload Identity credential configuration has an invalid ${field}.`,
      500,
    );
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== expectedHost) {
    throw new GoogleMerchantError(
      "WIF_ENDPOINT_INVALID",
      `Workload Identity credential configuration ${field} must be served by ${expectedHost}.`,
      500,
    );
  }
};

/**
 * Read, parse and validate `GOOGLE_WIF_CREDENTIALS_JSON`. Fails closed.
 *
 * Exported for tests and for a future pre-flight/health check — it performs no
 * I/O and touches no secrets beyond the env var it validates.
 */
export function parseWifCredentialConfiguration(): CredentialConfiguration {
  assertServerRuntime();

  const raw = process.env.GOOGLE_WIF_CREDENTIALS_JSON;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new GoogleMerchantError(
      "WIF_CONFIG_MISSING",
      "GOOGLE_WIF_CREDENTIALS_JSON is not configured.",
      500,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The caught error is intentionally discarded: V8's JSON.parse messages
    // include a slice of the input, which is the credential configuration.
    throw new GoogleMerchantError(
      "WIF_CONFIG_INVALID",
      "GOOGLE_WIF_CREDENTIALS_JSON is not valid JSON.",
      500,
    );
  }

  if (!isPlainObject(parsed)) {
    throw new GoogleMerchantError(
      "WIF_CONFIG_INVALID",
      "GOOGLE_WIF_CREDENTIALS_JSON must be a JSON object.",
      500,
    );
  }

  if (parsed.type !== "external_account") {
    throw new GoogleMerchantError(
      "WIF_CONFIG_INVALID",
      'GOOGLE_WIF_CREDENTIALS_JSON must have type "external_account".',
      500,
    );
  }

  if (typeof parsed.audience !== "string" || parsed.audience.length === 0) {
    throw new GoogleMerchantError(
      "WIF_CONFIG_INVALID",
      "GOOGLE_WIF_CREDENTIALS_JSON is missing audience.",
      500,
    );
  }

  assertGoogleEndpoint(parsed.token_url, GOOGLE_STS_HOST, "token_url");
  assertGoogleEndpoint(
    parsed.service_account_impersonation_url,
    GOOGLE_IAM_CREDENTIALS_HOST,
    "service_account_impersonation_url",
  );

  const credentialSource = parsed.credential_source;

  if (!isPlainObject(credentialSource)) {
    throw new GoogleMerchantError(
      "WIF_CREDENTIAL_SOURCE_INVALID",
      "GOOGLE_WIF_CREDENTIALS_JSON is missing credential_source.",
      500,
    );
  }

  if (credentialSource.file !== VERCEL_OIDC_TOKEN_FILE) {
    throw new GoogleMerchantError(
      "WIF_CREDENTIAL_SOURCE_INVALID",
      `credential_source.file must be exactly ${VERCEL_OIDC_TOKEN_FILE}.`,
      500,
    );
  }

  return parsed;
}

/**
 * Overwrite then unlink the temporary OIDC token file.
 *
 * Never throws — cleanup failure must not mask (or replace) the outcome of the
 * exchange. Only the fs error code is logged; the token never is.
 */
async function destroyOidcTokenFile(): Promise<void> {
  try {
    // Overwrite first so the bytes are gone even if the unlink is refused.
    await writeFile(VERCEL_OIDC_TOKEN_FILE, "", {
      encoding: "utf8",
      mode: TOKEN_FILE_MODE,
    });
  } catch (error) {
    log.warn("Could not overwrite temporary OIDC token file", {
      code: (error as NodeJS.ErrnoException)?.code ?? "unknown",
    });
  }

  try {
    await rm(VERCEL_OIDC_TOKEN_FILE, { force: true });
  } catch (error) {
    log.warn("Could not remove temporary OIDC token file", {
      code: (error as NodeJS.ErrnoException)?.code ?? "unknown",
    });
  }
}

async function exchangeOidcTokenForAccessToken(): Promise<string> {
  assertServerRuntime();

  const credentialConfiguration = parseWifCredentialConfiguration();

  let oidcToken: string;
  try {
    oidcToken = await getVercelOidcToken();
  } catch {
    // The underlying error can embed request details; surface nothing from it.
    throw new GoogleMerchantError(
      "OIDC_TOKEN_UNAVAILABLE",
      "No Vercel OIDC token is available for this runtime.",
      500,
    );
  }

  if (typeof oidcToken !== "string" || oidcToken.length === 0) {
    throw new GoogleMerchantError(
      "OIDC_TOKEN_UNAVAILABLE",
      "No Vercel OIDC token is available for this runtime.",
      500,
    );
  }

  let tokenFileWritten = false;

  try {
    try {
      await writeFile(VERCEL_OIDC_TOKEN_FILE, oidcToken, {
        encoding: "utf8",
        mode: TOKEN_FILE_MODE,
      });
      tokenFileWritten = true;
      // `mode` only applies when the file is created; chmod covers the case
      // where a previous invocation left the file behind with a wider mode.
      await chmod(VERCEL_OIDC_TOKEN_FILE, TOKEN_FILE_MODE);
    } catch (error) {
      log.error("Could not stage the OIDC token for Google exchange", {
        code: (error as NodeJS.ErrnoException)?.code ?? "unknown",
      });
      throw new GoogleMerchantError(
        "OIDC_TOKEN_FILE_FAILED",
        "Could not stage the OIDC token for the Google token exchange.",
        500,
      );
    }

    const client = ExternalAccountClient.fromJSON({
      ...credentialConfiguration,
      scopes: [GOOGLE_MERCHANT_SCOPE],
    } as unknown as ExternalAccountClientOptions);

    if (!client) {
      throw new GoogleMerchantError(
        "WIF_CLIENT_INIT_FAILED",
        "The Workload Identity credential configuration was rejected by google-auth-library.",
        500,
      );
    }

    // Belt and braces: `fromJSON` honours `scopes`, but the impersonated token
    // must never be minted with the default cloud-platform scope.
    client.scopes = [GOOGLE_MERCHANT_SCOPE];

    let accessToken: string | null | undefined;
    try {
      const response = await client.getAccessToken();
      accessToken = response?.token;
    } catch {
      // google-auth-library errors can quote the STS response body.
      throw new GoogleMerchantError(
        "TOKEN_EXCHANGE_FAILED",
        "Google rejected the workload identity token exchange.",
        502,
      );
    }

    if (!accessToken) {
      throw new GoogleMerchantError(
        "TOKEN_EXCHANGE_FAILED",
        "Google returned no access token for the workload identity exchange.",
        502,
      );
    }

    return accessToken;
  } finally {
    if (tokenFileWritten) {
      await destroyOidcTokenFile();
    }
  }
}

/**
 * Serialises exchanges within this process.
 *
 * `/tmp/vercel-oidc-token` is a single shared path, so two concurrent exchanges
 * in the same function instance could otherwise shred each other's token file
 * mid-flight. Rejections are absorbed from the chain (and re-thrown to the
 * caller) so one failure cannot poison the queue.
 */
let exchangeQueue: Promise<unknown> = Promise.resolve();

/**
 * Exchange the Vercel OIDC token for a short-lived Google access token scoped
 * to the Merchant API.
 *
 * @returns a bearer access token valid for ~1 hour. Callers must treat it as a
 *   secret: do not log it, do not return it in an HTTP response, do not cache
 *   it anywhere durable.
 * @throws {GoogleMerchantError} with a sanitised, static message.
 */
export function getGoogleMerchantAccessToken(): Promise<string> {
  const run = exchangeQueue.then(
    exchangeOidcTokenForAccessToken,
    exchangeOidcTokenForAccessToken,
  );

  exchangeQueue = run.catch(() => undefined);

  return run;
}
