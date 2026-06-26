import { createLogger } from "@/lib/log";

const log = createLogger("google:oauth-access-token");

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

let cachedAccessToken: string | null = null;
let cachedExpiresAtMs = 0;

export function hasGoogleOAuthCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

/**
 * Returns a short-lived Google OAuth access token using the configured refresh token.
 *
 * Required env:
 * - GOOGLE_OAUTH_CLIENT_ID
 * - GOOGLE_OAUTH_CLIENT_SECRET
 * - GOOGLE_OAUTH_REFRESH_TOKEN
 *
 * The refresh token must have been authorised with the scopes needed by the API
 * being called, e.g.:
 * - https://www.googleapis.com/auth/webmasters.readonly
 * - https://www.googleapis.com/auth/analytics.readonly
 */
export async function getGoogleAccessToken(): Promise<string> {
  const now = Date.now();

  // Reuse token until one minute before expiry.
  if (cachedAccessToken && cachedExpiresAtMs - now > 60_000) {
    return cachedAccessToken;
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth env vars are not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    log.error("[google-oauth] token refresh failed", {
      status: response.status,
      error: data.error,
      error_description: data.error_description,
    });

    throw new Error(
      data.error_description ||
        data.error ||
        `Google token refresh failed with ${response.status}`,
    );
  }

  cachedAccessToken = data.access_token;
  cachedExpiresAtMs = now + (data.expires_in ?? 3600) * 1000;

  return cachedAccessToken;
}
