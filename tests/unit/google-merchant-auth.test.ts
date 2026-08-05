/**
 * Vercel OIDC → Google Workload Identity Federation authentication.
 *
 * What these tests prove:
 *   - The credential configuration is validated BEFORE any token is fetched:
 *     missing / malformed JSON, a non-Google STS or impersonation endpoint, and
 *     a credential source pointing anywhere other than /tmp/vercel-oidc-token
 *     all fail closed and never call getVercelOidcToken().
 *   - The OIDC token is written to /tmp/vercel-oidc-token with mode 0600 and is
 *     ALWAYS shredded afterwards — on success and on every failure path.
 *   - The impersonated token is minted with the content scope only.
 *   - No thrown error and no log line ever contains the OIDC token, the access
 *     token or the raw credential configuration.
 *
 * Mutation checks: swapping the token_url host, the impersonation host or the
 * credential-source path each flips a passing case to a failing one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — @vercel/oidc, node:fs/promises, google-auth-library, logger
// ---------------------------------------------------------------------------

const getVercelOidcTokenMock = vi.hoisted(() => vi.fn());
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: getVercelOidcTokenMock,
}));

const writeFileMock = vi.hoisted(() => vi.fn());
const chmodMock = vi.hoisted(() => vi.fn());
const rmMock = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({
  chmod: chmodMock,
  rm: rmMock,
  writeFile: writeFileMock,
}));

const fromJSONMock = vi.hoisted(() => vi.fn());
vi.mock("google-auth-library", () => ({
  ExternalAccountClient: { fromJSON: fromJSONMock },
}));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

import {
  getGoogleMerchantAccessToken,
  parseWifCredentialConfiguration,
} from "@/lib/google-merchant/auth";
import {
  GOOGLE_MERCHANT_SCOPE,
  GoogleMerchantError,
  VERCEL_OIDC_TOKEN_FILE,
  getGoogleMerchantConfig,
  isGoogleMerchantRegistrationEnabled,
  isProductionRuntime,
} from "@/lib/google-merchant/config";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OIDC_TOKEN = "oidc.header.payload.signature-SUPER-SECRET";
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";

const validCredentialConfiguration = () => ({
  audience:
    "//iam.googleapis.com/projects/962160413242/locations/global/workloadIdentityPools/vercel/providers/ftt-admin-production",
  credential_source: {
    file: "/tmp/vercel-oidc-token",
    format: { type: "text" },
  },
  service_account_impersonation_url:
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/ftt-merchant-sync@ftt-merchant-integration.iam.gserviceaccount.com:generateAccessToken",
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
  token_url: "https://sts.googleapis.com/v1/token",
  type: "external_account",
});

const stubCredentials = (config: unknown) => {
  vi.stubEnv(
    "GOOGLE_WIF_CREDENTIALS_JSON",
    typeof config === "string" ? config : JSON.stringify(config),
  );
};

/** Every argument passed to every logger method, flattened to one string. */
const loggedText = (): string =>
  [logMock.debug, logMock.error, logMock.info, logMock.warn]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("|");

const expectGoogleMerchantError = async (
  promise: Promise<unknown>,
  code: string,
): Promise<GoogleMerchantError> => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(GoogleMerchantError);
  const merchantError = error as GoogleMerchantError;
  expect(merchantError.code).toBe(code);
  return merchantError;
};

beforeEach(() => {
  getVercelOidcTokenMock.mockResolvedValue(OIDC_TOKEN);
  writeFileMock.mockResolvedValue(undefined);
  chmodMock.mockResolvedValue(undefined);
  rmMock.mockResolvedValue(undefined);
  fromJSONMock.mockReturnValue({
    getAccessToken: vi.fn().mockResolvedValue({ token: ACCESS_TOKEN }),
    scopes: [] as string[],
  });
  stubCredentials(validCredentialConfiguration());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("getGoogleMerchantAccessToken — successful exchange", () => {
  it("returns the impersonated access token", async () => {
    await expect(getGoogleMerchantAccessToken()).resolves.toBe(ACCESS_TOKEN);
  });

  it("writes the raw OIDC token to /tmp/vercel-oidc-token with mode 0600", async () => {
    await getGoogleMerchantAccessToken();

    expect(writeFileMock).toHaveBeenCalledWith(
      VERCEL_OIDC_TOKEN_FILE,
      OIDC_TOKEN,
      { encoding: "utf8", mode: 0o600 },
    );
    expect(chmodMock).toHaveBeenCalledWith(VERCEL_OIDC_TOKEN_FILE, 0o600);
  });

  it("shreds the token file after a successful exchange", async () => {
    await getGoogleMerchantAccessToken();

    // Overwritten with an empty string, then removed.
    expect(writeFileMock).toHaveBeenCalledWith(VERCEL_OIDC_TOKEN_FILE, "", {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(rmMock).toHaveBeenCalledWith(VERCEL_OIDC_TOKEN_FILE, {
      force: true,
    });
  });

  it("requests only the Merchant content scope", async () => {
    const client = {
      getAccessToken: vi.fn().mockResolvedValue({ token: ACCESS_TOKEN }),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    };
    fromJSONMock.mockReturnValue(client);

    await getGoogleMerchantAccessToken();

    expect(fromJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [GOOGLE_MERCHANT_SCOPE] }),
    );
    expect(client.scopes).toEqual([GOOGLE_MERCHANT_SCOPE]);
    expect(GOOGLE_MERCHANT_SCOPE).toBe(
      "https://www.googleapis.com/auth/content",
    );
  });

  it("passes the parsed credential configuration through to fromJSON", async () => {
    await getGoogleMerchantAccessToken();

    expect(fromJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        credential_source: { file: VERCEL_OIDC_TOKEN_FILE, format: { type: "text" } },
        token_url: "https://sts.googleapis.com/v1/token",
        type: "external_account",
      }),
    );
  });

  it("never logs the OIDC token, the access token or the credential configuration", async () => {
    await getGoogleMerchantAccessToken();

    const logged = loggedText();
    expect(logged).not.toContain(OIDC_TOKEN);
    expect(logged).not.toContain(ACCESS_TOKEN);
    expect(logged).not.toContain("external_account");
  });
});

// ---------------------------------------------------------------------------
// Credential-configuration validation — fail closed
// ---------------------------------------------------------------------------

describe("credential configuration validation", () => {
  it("fails when GOOGLE_WIF_CREDENTIALS_JSON is missing", async () => {
    vi.stubEnv("GOOGLE_WIF_CREDENTIALS_JSON", undefined);

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CONFIG_MISSING",
    );
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("fails when GOOGLE_WIF_CREDENTIALS_JSON is blank", async () => {
    vi.stubEnv("GOOGLE_WIF_CREDENTIALS_JSON", "   ");

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CONFIG_MISSING",
    );
  });

  it("fails on malformed JSON without echoing the configuration", async () => {
    stubCredentials('{"type":"external_account","secret":"LEAKED-VALUE"');

    const error = await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CONFIG_INVALID",
    );

    expect(error.message).not.toContain("LEAKED-VALUE");
    expect(loggedText()).not.toContain("LEAKED-VALUE");
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
  });

  it("rejects a JSON array", async () => {
    stubCredentials([validCredentialConfiguration()]);

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CONFIG_INVALID",
    );
  });

  it("rejects a configuration whose type is not external_account", async () => {
    stubCredentials({
      ...validCredentialConfiguration(),
      type: "service_account",
    });

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CONFIG_INVALID",
    );
  });

  it("rejects a configuration with no audience", async () => {
    const config: Record<string, unknown> = validCredentialConfiguration();
    delete config.audience;
    stubCredentials(config);

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CONFIG_INVALID",
    );
  });

  it("rejects a token_url that is not on sts.googleapis.com", async () => {
    stubCredentials({
      ...validCredentialConfiguration(),
      token_url: "https://sts.googleapis.com.evil.tld/v1/token",
    });

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_ENDPOINT_INVALID",
    );
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
  });

  it("rejects a non-https token_url", async () => {
    stubCredentials({
      ...validCredentialConfiguration(),
      token_url: "http://sts.googleapis.com/v1/token",
    });

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_ENDPOINT_INVALID",
    );
  });

  it("rejects an impersonation URL that is not on iamcredentials.googleapis.com", async () => {
    stubCredentials({
      ...validCredentialConfiguration(),
      service_account_impersonation_url:
        "https://attacker.example.com/v1/projects/-/serviceAccounts/x:generateAccessToken",
    });

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_ENDPOINT_INVALID",
    );
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
  });

  it("rejects a credential source that reads a different file", async () => {
    stubCredentials({
      ...validCredentialConfiguration(),
      credential_source: { file: "/etc/passwd", format: { type: "text" } },
    });

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CREDENTIAL_SOURCE_INVALID",
    );
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("rejects a URL-based credential source (no file at all)", async () => {
    stubCredentials({
      ...validCredentialConfiguration(),
      credential_source: { url: "https://attacker.example.com/token" },
    });

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CREDENTIAL_SOURCE_INVALID",
    );
  });

  it("accepts the production configuration", () => {
    expect(() => parseWifCredentialConfiguration()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// OIDC token failures
// ---------------------------------------------------------------------------

describe("Vercel OIDC token failures", () => {
  it("fails closed when the OIDC token cannot be minted", async () => {
    getVercelOidcTokenMock.mockRejectedValue(
      new Error(`token refresh failed for ${OIDC_TOKEN}`),
    );

    const error = await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "OIDC_TOKEN_UNAVAILABLE",
    );

    expect(error.message).not.toContain(OIDC_TOKEN);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(OIDC_TOKEN);
  });

  it("fails closed when the OIDC token is empty", async () => {
    getVercelOidcTokenMock.mockResolvedValue("");

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "OIDC_TOKEN_UNAVAILABLE",
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("fails closed when the token file cannot be written", async () => {
    writeFileMock.mockRejectedValueOnce(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "OIDC_TOKEN_FILE_FAILED",
    );
    expect(fromJSONMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Token-exchange failures — the temp file is shredded on every path
// ---------------------------------------------------------------------------

describe("token exchange failures", () => {
  it("fails when google-auth-library rejects the configuration", async () => {
    fromJSONMock.mockReturnValue(null);

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "WIF_CLIENT_INIT_FAILED",
    );
    expect(rmMock).toHaveBeenCalledWith(VERCEL_OIDC_TOKEN_FILE, {
      force: true,
    });
  });

  it("fails — and shreds the token file — when the exchange throws", async () => {
    fromJSONMock.mockReturnValue({
      getAccessToken: vi
        .fn()
        .mockRejectedValue(new Error(`STS rejected ${OIDC_TOKEN}`)),
      scopes: [] as string[],
    });

    const error = await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "TOKEN_EXCHANGE_FAILED",
    );

    expect(error.message).not.toContain(OIDC_TOKEN);
    expect(error.status).toBe(502);
    expect(rmMock).toHaveBeenCalledWith(VERCEL_OIDC_TOKEN_FILE, {
      force: true,
    });
    expect(loggedText()).not.toContain(OIDC_TOKEN);
  });

  it("fails when the exchange returns no token", async () => {
    fromJSONMock.mockReturnValue({
      getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      scopes: [] as string[],
    });

    await expectGoogleMerchantError(
      getGoogleMerchantAccessToken(),
      "TOKEN_EXCHANGE_FAILED",
    );
    expect(rmMock).toHaveBeenCalled();
  });

  it("serialises concurrent exchanges so the shared token file is not clobbered", async () => {
    // Slow exchange: without serialisation the second call would write its own
    // token while the first is still reading /tmp/vercel-oidc-token.
    fromJSONMock.mockReturnValue({
      getAccessToken: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ token: ACCESS_TOKEN }), 5);
          }),
      ),
      scopes: [] as string[],
    });

    await Promise.all([
      getGoogleMerchantAccessToken(),
      getGoogleMerchantAccessToken(),
    ]);

    const tokenWrites = writeFileMock.mock.calls
      .map((args, index) => ({ index, token: args[1] }))
      .filter((entry) => entry.token === OIDC_TOKEN)
      .map((entry) => writeFileMock.mock.invocationCallOrder[entry.index]);
    const removals = rmMock.mock.invocationCallOrder;

    expect(tokenWrites).toHaveLength(2);
    expect(removals).toHaveLength(2);
    // The first exchange finishes its cleanup before the second stages a token.
    expect(removals[0]).toBeLessThan(tokenWrites[1]);
  });

  it("does not mask the exchange result when cleanup itself fails", async () => {
    rmMock.mockRejectedValue(new Error("EBUSY"));

    await expect(getGoogleMerchantAccessToken()).resolves.toBe(ACCESS_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Runtime + configuration guards
// ---------------------------------------------------------------------------

describe("isProductionRuntime", () => {
  it("is true only for VERCEL_ENV=production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isProductionRuntime()).toBe(true);

    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isProductionRuntime()).toBe(false);

    vi.stubEnv("VERCEL_ENV", "development");
    expect(isProductionRuntime()).toBe(false);
  });

  it("falls back to NODE_ENV when VERCEL_ENV is absent", () => {
    vi.stubEnv("VERCEL_ENV", undefined);

    vi.stubEnv("NODE_ENV", "production");
    expect(isProductionRuntime()).toBe(true);

    vi.stubEnv("NODE_ENV", "test");
    expect(isProductionRuntime()).toBe(false);
  });
});

describe("isGoogleMerchantRegistrationEnabled", () => {
  it("requires the exact string true", () => {
    vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", "true");
    expect(isGoogleMerchantRegistrationEnabled()).toBe(true);

    for (const value of ["TRUE", "1", "yes", "false", ""]) {
      vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", value);
      expect(isGoogleMerchantRegistrationEnabled()).toBe(false);
    }

    vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", undefined);
    expect(isGoogleMerchantRegistrationEnabled()).toBe(false);
  });
});

describe("getGoogleMerchantConfig", () => {
  const stubMerchantEnv = (
    overrides: Record<string, string | undefined> = {},
  ) => {
    const env: Record<string, string | undefined> = {
      GOOGLE_MERCHANT_ACCOUNT_ID: "5833526164",
      GOOGLE_MERCHANT_DATA_SOURCE_ID: "10696807524",
      GOOGLE_MERCHANT_DATA_SOURCE_NAME:
        "accounts/5833526164/dataSources/10696807524",
      GOOGLE_MERCHANT_DEVELOPER_EMAIL: "partner-access@odysseytherapeia.com",
      ...overrides,
    };

    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
  };

  it("returns the configured account, developer email and data source", () => {
    stubMerchantEnv();

    expect(getGoogleMerchantConfig()).toEqual({
      accountId: "5833526164",
      dataSourceId: "10696807524",
      dataSourceName: "accounts/5833526164/dataSources/10696807524",
      developerEmail: "partner-access@odysseytherapeia.com",
    });
  });

  it("fails closed when the account ID is missing", () => {
    stubMerchantEnv({ GOOGLE_MERCHANT_ACCOUNT_ID: undefined });

    expect(() => getGoogleMerchantConfig()).toThrow(GoogleMerchantError);
  });

  it("rejects a non-numeric account ID (URL-path safety)", () => {
    stubMerchantEnv({ GOOGLE_MERCHANT_ACCOUNT_ID: "5833526164/../../evil" });

    expect(() => getGoogleMerchantConfig()).toThrow(/numeric/i);
  });

  it("fails closed when the developer email is missing", () => {
    stubMerchantEnv({ GOOGLE_MERCHANT_DEVELOPER_EMAIL: undefined });

    expect(() => getGoogleMerchantConfig()).toThrow(GoogleMerchantError);
  });

  it("rejects a malformed developer email", () => {
    stubMerchantEnv({ GOOGLE_MERCHANT_DEVELOPER_EMAIL: "not-an-email" });

    expect(() => getGoogleMerchantConfig()).toThrow(/email/i);
  });

  it("treats the data source as optional (registration must not depend on it)", () => {
    stubMerchantEnv({
      GOOGLE_MERCHANT_DATA_SOURCE_ID: undefined,
      GOOGLE_MERCHANT_DATA_SOURCE_NAME: undefined,
    });

    const config = getGoogleMerchantConfig();
    expect(config.dataSourceId).toBeNull();
    expect(config.dataSourceName).toBeNull();
  });
});
