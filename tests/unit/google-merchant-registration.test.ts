/**
 * One-time Merchant API developer registration — service + admin route.
 *
 * SERVICE (lib/google-merchant/register-gcp.ts):
 *   - Calls exactly POST .../accounts/v1/accounts/{id}/developerRegistration:registerGcp
 *     with a bearer token and the configured developerEmail.
 *   - 409 / ALREADY_EXISTS is an idempotent success, not a failure.
 *   - 401 / 403 / 429 / 5xx map to sanitised errors that quote no token,
 *     no credential configuration and no upstream body.
 *   - Never reads or writes the database, never touches products.
 *
 * ROUTE (POST /api/v2/integrations/google-merchant/register):
 *   - Kill switch and production gate return an indistinguishable 404 and run
 *     BEFORE authentication, so the endpoint is invisible while disabled.
 *   - Admin-only; wrong confirmation phrase is rejected without calling the
 *     service; the success body carries only the whitelisted fields.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — auth module (no real OIDC/WIF work) and logger
// ---------------------------------------------------------------------------

const getAccessTokenMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/google-merchant/auth", () => ({
  getGoogleMerchantAccessToken: getAccessTokenMock,
}));

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ createLogger: () => logMock }));

import { registerGoogleMerchantRoutes } from "@/api/hono/routes/google-merchant";
import { GoogleMerchantError } from "@/lib/google-merchant/config";
import { registerGoogleMerchantGcpProject } from "@/lib/google-merchant/register-gcp";
import type { GoogleMerchantRegistrationResult } from "@/lib/google-merchant/register-gcp";
import { createRouteHarness } from "../helpers/route-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DEVELOPER_EMAIL = "partner-access@odysseytherapeia.com";
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";
const GCP_PROJECT_ID = "ftt-merchant-integration";
const REGISTRATION_NAME = `accounts/${ACCOUNT_ID}/developerRegistration`;
const EXPECTED_URL = `https://merchantapi.googleapis.com/accounts/v1/${REGISTRATION_NAME}:registerGcp`;

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const fetchMock = vi.fn();

const loggedText = (): string =>
  [logMock.debug, logMock.error, logMock.info, logMock.warn]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("|");

const stubServiceEnv = (overrides: Record<string, string | undefined> = {}) => {
  const env: Record<string, string | undefined> = {
    GOOGLE_MERCHANT_ACCOUNT_ID: ACCOUNT_ID,
    GOOGLE_MERCHANT_DEVELOPER_EMAIL: DEVELOPER_EMAIL,
    ...overrides,
  };

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
};

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
  expect(merchantError.message).not.toContain(ACCESS_TOKEN);
  return merchantError;
};

beforeEach(() => {
  getAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  fetchMock.mockResolvedValue(
    jsonResponse(200, {
      gcpIds: [GCP_PROJECT_ID],
      name: REGISTRATION_NAME,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  stubServiceEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Service — request shape
// ---------------------------------------------------------------------------

describe("registerGoogleMerchantGcpProject — successful registration", () => {
  it("returns the registration name and gcpIds", async () => {
    await expect(registerGoogleMerchantGcpProject()).resolves.toEqual({
      alreadyRegistered: false,
      gcpIds: [GCP_PROJECT_ID],
      name: REGISTRATION_NAME,
      registered: true,
    });
  });

  it("POSTs registerGcp with the bearer token and developer email", async () => {
    await registerGoogleMerchantGcpProject();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(EXPECTED_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      developerEmail: DEVELOPER_EMAIL,
    });
  });

  it("uses the configured account ID in the resource path", async () => {
    stubServiceEnv({ GOOGLE_MERCHANT_ACCOUNT_ID: "9999999999" });

    await registerGoogleMerchantGcpProject();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("accounts/9999999999/developerRegistration");
  });

  it("falls back to the derived name when Google omits it", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { gcpIds: [GCP_PROJECT_ID] }));

    const result = await registerGoogleMerchantGcpProject();
    expect(result.name).toBe(REGISTRATION_NAME);
  });

  it("drops non-string gcpIds", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        gcpIds: [GCP_PROJECT_ID, 42, null],
        name: REGISTRATION_NAME,
      }),
    );

    const result = await registerGoogleMerchantGcpProject();
    expect(result.gcpIds).toEqual([GCP_PROJECT_ID]);
  });

  it("never logs the access token", async () => {
    await registerGoogleMerchantGcpProject();
    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Service — idempotency
// ---------------------------------------------------------------------------

describe("registerGoogleMerchantGcpProject — already registered", () => {
  it("treats HTTP 409 as an idempotent success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: { code: 409, message: "Already exists.", status: "ALREADY_EXISTS" },
      }),
    );

    await expect(registerGoogleMerchantGcpProject()).resolves.toEqual({
      alreadyRegistered: true,
      gcpIds: [],
      name: REGISTRATION_NAME,
      registered: true,
    });
  });

  it("treats an ALREADY_EXISTS status on a 400 as an idempotent success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: { code: 400, message: "Already registered.", status: "ALREADY_EXISTS" },
      }),
    );

    const result = await registerGoogleMerchantGcpProject();
    expect(result.registered).toBe(true);
    expect(result.alreadyRegistered).toBe(true);
  });

  it("is safe to call twice", async () => {
    const first = await registerGoogleMerchantGcpProject();

    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { status: "ALREADY_EXISTS" } }),
    );
    const second = await registerGoogleMerchantGcpProject();

    expect(first.registered).toBe(true);
    expect(second.registered).toBe(true);
    expect(second.name).toBe(first.name);
  });
});

// ---------------------------------------------------------------------------
// Service — upstream failures
// ---------------------------------------------------------------------------

describe("registerGoogleMerchantGcpProject — Google failures", () => {
  const failureCases: Array<{
    code: string;
    status: number;
    upstream: number;
  }> = [
    { code: "GOOGLE_UNAUTHENTICATED", status: 502, upstream: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 502, upstream: 403 },
    { code: "GOOGLE_RATE_LIMITED", status: 429, upstream: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 502, upstream: 500 },
    { code: "GOOGLE_UNAVAILABLE", status: 502, upstream: 503 },
    { code: "GOOGLE_REQUEST_FAILED", status: 502, upstream: 400 },
  ];

  for (const { code, status, upstream } of failureCases) {
    it(`maps HTTP ${upstream} to ${code}`, async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(upstream, {
          error: {
            code: upstream,
            message: `Request had invalid authentication credentials: ${ACCESS_TOKEN}`,
            status: "UNAUTHENTICATED",
          },
        }),
      );

      const error = await expectGoogleMerchantError(
        registerGoogleMerchantGcpProject(),
        code,
      );

      expect(error.status).toBe(status);
      expect(error.upstreamStatus).toBe(upstream);
      // The upstream body (which quoted the token) must not be echoed.
      expect(error.message).not.toContain(ACCESS_TOKEN);
      expect(loggedText()).not.toContain(ACCESS_TOKEN);
    });
  }

  it("maps a network failure to GOOGLE_REQUEST_FAILED", async () => {
    fetchMock.mockRejectedValue(new Error(`socket hang up ${ACCESS_TOKEN}`));

    const error = await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );

    expect(error.message).not.toContain(ACCESS_TOKEN);
    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });

  it("survives a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_UNAVAILABLE",
    );
  });

  it("fails closed — without calling Google — when the account ID is missing", async () => {
    stubServiceEnv({ GOOGLE_MERCHANT_ACCOUNT_ID: undefined });

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "CONFIG_MISSING",
    );
    expect(getAccessTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed — without calling Google — when the developer email is missing", async () => {
    stubServiceEnv({ GOOGLE_MERCHANT_DEVELOPER_EMAIL: undefined });

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "CONFIG_MISSING",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates an authentication failure without calling Google", async () => {
    getAccessTokenMock.mockRejectedValue(
      new GoogleMerchantError(
        "OIDC_TOKEN_UNAVAILABLE",
        "No Vercel OIDC token is available for this runtime.",
        500,
      ),
    );

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "OIDC_TOKEN_UNAVAILABLE",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type ErrorBody = { code: string; message: string };

const ADMIN = { email: "admin@example.com", id: "admin-1", role: "admin" };
const CUSTOMER = { email: "user@example.com", id: "user-1", role: "customer" };

const SUCCESS: GoogleMerchantRegistrationResult = {
  alreadyRegistered: false,
  gcpIds: [GCP_PROJECT_ID],
  name: REGISTRATION_NAME,
  registered: true,
};

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  registerGcpProject = vi.fn().mockResolvedValue(SUCCESS),
) => ({
  harness: createRouteHarness({
    authUser,
    register: (app) => registerGoogleMerchantRoutes(app, { registerGcpProject }),
  }),
  registerGcpProject,
});

const post = (
  harness: ReturnType<typeof createRouteHarness>,
  body: unknown = { confirm: "REGISTER_FTT_MERCHANT_GCP" },
  headers: Record<string, string> = { "Content-Type": "application/json" },
) =>
  harness.request("/register", {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });

const enableProductionRegistration = () => {
  vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("ADMIN_API_SECRET", undefined);
};

describe("POST /register — availability gates", () => {
  it("404s when GOOGLE_MERCHANT_REGISTRATION_ENABLED is not \"true\"", async () => {
    enableProductionRegistration();
    vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", "false");

    const { harness, registerGcpProject } = makeHarness(ADMIN);
    const response = await post(harness);

    expect(response.status).toBe(404);
    expect(registerGcpProject).not.toHaveBeenCalled();
  });

  it("404s when the flag is unset", async () => {
    enableProductionRegistration();
    vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", undefined);

    const { harness } = makeHarness(ADMIN);
    expect((await post(harness)).status).toBe(404);
  });

  it("404s outside production even when the flag is on", async () => {
    enableProductionRegistration();
    vi.stubEnv("VERCEL_ENV", "preview");

    const { harness, registerGcpProject } = makeHarness(ADMIN);
    const response = await post(harness);

    expect(response.status).toBe(404);
    expect(registerGcpProject).not.toHaveBeenCalled();
  });

  it("returns an identical body whether disabled or non-production (no oracle)", async () => {
    enableProductionRegistration();
    vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", "false");
    const disabled = await post(makeHarness(ADMIN).harness);

    enableProductionRegistration();
    vi.stubEnv("VERCEL_ENV", "development");
    const nonProduction = await post(makeHarness(ADMIN).harness);

    expect(await disabled.json()).toEqual(await nonProduction.json());
  });

  it("gates before authentication — an anonymous probe cannot detect the flag", async () => {
    enableProductionRegistration();
    vi.stubEnv("GOOGLE_MERCHANT_REGISTRATION_ENABLED", "false");

    const { harness } = makeHarness(null);
    expect((await post(harness)).status).toBe(404);
  });
});

describe("POST /register — authentication", () => {
  beforeEach(() => {
    enableProductionRegistration();
  });

  it("401s for an unauthenticated request", async () => {
    const { harness, registerGcpProject } = makeHarness(null);
    const response = await post(harness);

    expect(response.status).toBe(401);
    expect(registerGcpProject).not.toHaveBeenCalled();
  });

  it("403s for a signed-in non-admin", async () => {
    const { harness, registerGcpProject } = makeHarness(CUSTOMER);
    const response = await post(harness);

    expect(response.status).toBe(403);
    expect(registerGcpProject).not.toHaveBeenCalled();
  });
});

describe("POST /register — confirmation phrase", () => {
  beforeEach(() => {
    enableProductionRegistration();
  });

  it("400s on a wrong confirmation value", async () => {
    const { harness, registerGcpProject } = makeHarness(ADMIN);
    const response = await post(harness, { confirm: "register" });

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).code).toBe(
      "INVALID_CONFIRMATION",
    );
    expect(registerGcpProject).not.toHaveBeenCalled();
  });

  it("400s on an empty body", async () => {
    const { harness, registerGcpProject } = makeHarness(ADMIN);
    // Sent directly rather than through `post` — a default parameter would
    // substitute the valid body for an explicit `undefined`.
    const response = await harness.request("/register", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(registerGcpProject).not.toHaveBeenCalled();
  });

  it("400s on unexpected extra keys", async () => {
    const { harness, registerGcpProject } = makeHarness(ADMIN);
    const response = await post(harness, {
      accountId: "1",
      confirm: "REGISTER_FTT_MERCHANT_GCP",
    });

    expect(response.status).toBe(400);
    expect(registerGcpProject).not.toHaveBeenCalled();
  });

  it("400s on a non-JSON body", async () => {
    const { harness, registerGcpProject } = makeHarness(ADMIN);
    const response = await harness.request("/register", {
      body: "not json",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(registerGcpProject).not.toHaveBeenCalled();
  });
});

describe("POST /register — success", () => {
  beforeEach(() => {
    enableProductionRegistration();
  });

  it("returns only registered, name, gcpIds and alreadyRegistered", async () => {
    const { harness, registerGcpProject } = makeHarness(ADMIN);
    const response = await post(harness);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      alreadyRegistered: false,
      gcpIds: [GCP_PROJECT_ID],
      name: REGISTRATION_NAME,
      registered: true,
    });
    expect(registerGcpProject).toHaveBeenCalledTimes(1);
  });

  it("strips any extra field the service might return", async () => {
    const leaky = vi.fn().mockResolvedValue({
      ...SUCCESS,
      accessToken: ACCESS_TOKEN,
      credentialConfiguration: { type: "external_account" },
    });

    const { harness } = makeHarness(ADMIN, leaky);
    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(Object.keys(JSON.parse(body)).sort()).toEqual([
      "alreadyRegistered",
      "gcpIds",
      "name",
      "registered",
    ]);
    expect(body).not.toContain(ACCESS_TOKEN);
  });

  it("reports an already-registered project idempotently", async () => {
    const { harness } = makeHarness(
      ADMIN,
      vi.fn().mockResolvedValue({ ...SUCCESS, alreadyRegistered: true }),
    );

    const response = await post(harness);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      alreadyRegistered: true,
      registered: true,
    });
  });
});

describe("POST /register — failure handling", () => {
  beforeEach(() => {
    enableProductionRegistration();
  });

  it("surfaces the sanitised status and code of a GoogleMerchantError", async () => {
    const { harness } = makeHarness(
      ADMIN,
      vi
        .fn()
        .mockRejectedValue(
          new GoogleMerchantError(
            "GOOGLE_RATE_LIMITED",
            "Google rate-limited the registration request. Retry later.",
            429,
            429,
          ),
        ),
    );

    const response = await post(harness);
    expect(response.status).toBe(429);
    expect((await response.json()) as ErrorBody).toEqual({
      code: "GOOGLE_RATE_LIMITED",
      message: "Google rate-limited the registration request. Retry later.",
    });
  });

  it("never leaks a token, credential configuration or stack trace", async () => {
    const leaky = new Error(
      `boom: token=${ACCESS_TOKEN} config={"type":"external_account"}`,
    );

    const { harness } = makeHarness(ADMIN, vi.fn().mockRejectedValue(leaky));
    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain(ACCESS_TOKEN);
    expect(body).not.toContain("external_account");
    expect(body).not.toContain("at Object");
    expect(JSON.parse(body)).toEqual({
      code: "REGISTRATION_FAILED",
      message: "The registration request could not be completed.",
    });
    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});
