/**
 * One-time Merchant API developer registration — service + admin route.
 *
 * SERVICE (lib/google-merchant/register-gcp.ts):
 *   - Calls exactly POST .../accounts/v1/accounts/{id}/developerRegistration:registerGcp
 *     with a bearer token and the configured developerEmail.
 *   - A 409 / ALREADY_EXISTS is only a CANDIDATE for idempotency: it is
 *     verified against live Google state via
 *       GET .../accounts/v1/accounts:getAccountForGcpRegistration
 *       GET .../accounts/v1/accounts/{id}/developerRegistration
 *     and is reported as success ONLY when the GCP project is registered to
 *     this deployment's Merchant Center account.
 *   - A confirmed different account is a sanitised 409 that never names the
 *     other account; unverifiable conflicts and upstream/network failures fail
 *     closed through the existing sanitised mapping.
 *   - Every DeveloperRegistration payload is strictly validated.
 *   - Never reads or writes the database, never touches products.
 *
 * ROUTE (POST /api/v2/integrations/google-merchant/register):
 *   - Kill switch and production gate return an indistinguishable 404 and run
 *     BEFORE authentication, so the endpoint is invisible while disabled.
 *   - Admin-only; wrong confirmation phrase is rejected without calling the
 *     service; the success body carries exactly registered, name and gcpIds —
 *     a fresh and a verified pre-existing registration are indistinguishable.
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
const OTHER_ACCOUNT_ID = "9999999999";
const DEVELOPER_EMAIL = "partner-access@odysseytherapeia.com";
const ACCESS_TOKEN = "ya29.ACCESS-TOKEN-SUPER-SECRET";
const GCP_PROJECT_ID = "ftt-merchant-integration";

const ACCOUNT_NAME = `accounts/${ACCOUNT_ID}`;
const REGISTRATION_NAME = `accounts/${ACCOUNT_ID}/developerRegistration`;

const BASE_URL = "https://merchantapi.googleapis.com/accounts/v1";
const REGISTER_URL = `${BASE_URL}/${REGISTRATION_NAME}:registerGcp`;
const GET_ACCOUNT_URL = `${BASE_URL}/accounts:getAccountForGcpRegistration`;
const GET_REGISTRATION_URL = `${BASE_URL}/${REGISTRATION_NAME}`;

/** The public success payload — identical for fresh and verified-existing. */
const PUBLIC_SUCCESS: GoogleMerchantRegistrationResult = {
  gcpIds: [GCP_PROJECT_ID],
  name: REGISTRATION_NAME,
  registered: true,
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

const textResponse = (status: number, body: string): Response =>
  new Response(body, { status });

const developerRegistrationBody = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  gcpIds: [GCP_PROJECT_ID],
  name: REGISTRATION_NAME,
  ...overrides,
});

const conflictBody = (status = "ALREADY_EXISTS") => ({
  error: {
    code: 409,
    message: `Developer registration already exists for ${ACCESS_TOKEN}`,
    status,
  },
});

const fetchMock = vi.fn();

/** Queue responses in call order; anything beyond the queue is an error. */
const queueResponses = (...responses: Array<Response | Error>) => {
  fetchMock.mockReset();
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else {
      fetchMock.mockResolvedValueOnce(response);
    }
  }
  fetchMock.mockRejectedValue(new Error("unexpected extra fetch call"));
};

const fetchUrls = (): string[] =>
  fetchMock.mock.calls.map((call) => String(call[0]));

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

/**
 * Assert the failure is the expected sanitised GoogleMerchantError and that it
 * leaks neither the bearer token, the credential configuration, a stack trace
 * nor another Merchant account ID.
 */
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
  expect(merchantError.message).not.toContain(OTHER_ACCOUNT_ID);
  expect(merchantError.message).not.toContain("external_account");

  const logged = loggedText();
  expect(logged).not.toContain(ACCESS_TOKEN);
  expect(logged).not.toContain(OTHER_ACCOUNT_ID);
  expect(logged).not.toContain("external_account");

  return merchantError;
};

beforeEach(() => {
  getAccessTokenMock.mockResolvedValue(ACCESS_TOKEN);
  queueResponses(jsonResponse(200, developerRegistrationBody()));
  vi.stubGlobal("fetch", fetchMock);
  stubServiceEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Service — fresh registration
// ---------------------------------------------------------------------------

describe("registerGoogleMerchantGcpProject — fresh registration", () => {
  it("returns the registration name and gcpIds", async () => {
    await expect(registerGoogleMerchantGcpProject()).resolves.toEqual(
      PUBLIC_SUCCESS,
    );
  });

  it("POSTs registerGcp with the bearer token and developer email", async () => {
    await registerGoogleMerchantGcpProject();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(REGISTER_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      developerEmail: DEVELOPER_EMAIL,
    });
  });

  it("does not call the verification endpoints on success", async () => {
    await registerGoogleMerchantGcpProject();

    expect(fetchUrls()).toEqual([REGISTER_URL]);
  });

  it("uses the configured account ID in the resource path", async () => {
    stubServiceEnv({ GOOGLE_MERCHANT_ACCOUNT_ID: OTHER_ACCOUNT_ID });
    queueResponses(
      jsonResponse(200, {
        gcpIds: [GCP_PROJECT_ID],
        name: `accounts/${OTHER_ACCOUNT_ID}/developerRegistration`,
      }),
    );

    const result = await registerGoogleMerchantGcpProject();

    expect(fetchUrls()[0]).toContain(
      `accounts/${OTHER_ACCOUNT_ID}/developerRegistration:registerGcp`,
    );
    expect(result.name).toBe(
      `accounts/${OTHER_ACCOUNT_ID}/developerRegistration`,
    );
  });

  it("never logs the access token", async () => {
    await registerGoogleMerchantGcpProject();
    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});

describe("registerGoogleMerchantGcpProject — strict success validation", () => {
  const invalidBodies: Array<{ body: unknown; label: string }> = [
    { body: { gcpIds: [GCP_PROJECT_ID] }, label: "no name" },
    {
      body: developerRegistrationBody({ name: 42 }),
      label: "a non-string name",
    },
    {
      body: developerRegistrationBody({
        name: `accounts/${OTHER_ACCOUNT_ID}/developerRegistration`,
      }),
      label: "another account's registration name",
    },
    { body: { name: REGISTRATION_NAME }, label: "no gcpIds" },
    {
      body: developerRegistrationBody({ gcpIds: GCP_PROJECT_ID }),
      label: "a non-array gcpIds",
    },
    {
      body: developerRegistrationBody({ gcpIds: [GCP_PROJECT_ID, 42] }),
      label: "a non-string gcpId",
    },
  ];

  for (const { body, label } of invalidBodies) {
    it(`rejects a 200 with ${label}`, async () => {
      queueResponses(jsonResponse(200, body));

      await expectGoogleMerchantError(
        registerGoogleMerchantGcpProject(),
        "GOOGLE_REQUEST_FAILED",
      );
    });
  }

  it("rejects a non-JSON 200", async () => {
    queueResponses(textResponse(200, "<html>ok</html>"));

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );
  });
});

// ---------------------------------------------------------------------------
// Service — conflict verification (same Merchant account)
// ---------------------------------------------------------------------------

describe("registerGoogleMerchantGcpProject — verified duplicate", () => {
  it("verifies a 409 against the same Merchant account and returns the registration", async () => {
    queueResponses(
      jsonResponse(409, conflictBody()),
      jsonResponse(200, { name: ACCOUNT_NAME }),
      jsonResponse(200, developerRegistrationBody()),
    );

    await expect(registerGoogleMerchantGcpProject()).resolves.toEqual(
      PUBLIC_SUCCESS,
    );
    expect(fetchUrls()).toEqual([
      REGISTER_URL,
      GET_ACCOUNT_URL,
      GET_REGISTRATION_URL,
    ]);
  });

  it("verifies a 400/ALREADY_EXISTS the same way", async () => {
    queueResponses(
      jsonResponse(400, {
        error: { code: 400, message: "Already registered.", status: "ALREADY_EXISTS" },
      }),
      jsonResponse(200, { name: ACCOUNT_NAME }),
      jsonResponse(200, developerRegistrationBody()),
    );

    await expect(registerGoogleMerchantGcpProject()).resolves.toEqual(
      PUBLIC_SUCCESS,
    );
    expect(fetchUrls()).toEqual([
      REGISTER_URL,
      GET_ACCOUNT_URL,
      GET_REGISTRATION_URL,
    ]);
  });

  it("is indistinguishable from a fresh registration", async () => {
    const fresh = await registerGoogleMerchantGcpProject();

    queueResponses(
      jsonResponse(409, conflictBody()),
      jsonResponse(200, { name: ACCOUNT_NAME }),
      jsonResponse(200, developerRegistrationBody()),
    );
    const verified = await registerGoogleMerchantGcpProject();

    expect(verified).toEqual(fresh);
    expect(Object.keys(verified).sort()).toEqual([
      "gcpIds",
      "name",
      "registered",
    ]);
  });

  it("sends both verification requests as authenticated GETs with no body", async () => {
    queueResponses(
      jsonResponse(409, conflictBody()),
      jsonResponse(200, { name: ACCOUNT_NAME }),
      jsonResponse(200, developerRegistrationBody()),
    );

    await registerGoogleMerchantGcpProject();

    for (const index of [1, 2]) {
      const [, init] = fetchMock.mock.calls[index] as [string, RequestInit];
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.headers).toEqual({
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Service — conflict verification failures (fail closed)
// ---------------------------------------------------------------------------

describe("registerGoogleMerchantGcpProject — different Merchant account", () => {
  it("returns a sanitised 409 that does not name the other account", async () => {
    queueResponses(
      jsonResponse(409, conflictBody()),
      jsonResponse(200, { name: `accounts/${OTHER_ACCOUNT_ID}` }),
    );

    const error = await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_ACCOUNT_MISMATCH",
    );

    expect(error.status).toBe(409);
    // The developerRegistration lookup is never reached.
    expect(fetchUrls()).toEqual([REGISTER_URL, GET_ACCOUNT_URL]);
  });
});

describe("registerGoogleMerchantGcpProject — unverifiable conflict", () => {
  it("fails closed on an arbitrary 409 whose registration cannot be verified", async () => {
    // No ALREADY_EXISTS marker, and the project is registered nowhere.
    queueResponses(
      jsonResponse(409, { error: { code: 409, message: "Conflict." } }),
      jsonResponse(404, { error: { code: 404, status: "NOT_FOUND" } }),
    );

    const error = await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );

    expect(error.status).toBe(502);
  });

  const malformedAccountBodies: Array<{ body: unknown; label: string }> = [
    { body: {}, label: "a missing name" },
    { body: { name: 5833526164 }, label: "a non-string name" },
    { body: { name: "" }, label: "an empty name" },
    { body: { name: ACCOUNT_ID }, label: "a bare account ID" },
    {
      body: { name: "merchantAccounts/5833526164" },
      label: "an unexpected name format",
    },
    { body: { name: "accounts/5833526164/x" }, label: "a trailing segment" },
    { body: { name: "accounts/not-a-number" }, label: "a non-numeric account" },
    { body: [ACCOUNT_NAME], label: "a JSON array" },
  ];

  for (const { body, label } of malformedAccountBodies) {
    it(`fails closed when getAccountForGcpRegistration returns ${label}`, async () => {
      queueResponses(
        jsonResponse(409, conflictBody()),
        jsonResponse(200, body),
      );

      await expectGoogleMerchantError(
        registerGoogleMerchantGcpProject(),
        "GOOGLE_REQUEST_FAILED",
      );
      expect(fetchUrls()).toEqual([REGISTER_URL, GET_ACCOUNT_URL]);
    });
  }

  it("fails closed when getAccountForGcpRegistration returns malformed JSON", async () => {
    queueResponses(
      jsonResponse(409, conflictBody()),
      textResponse(200, "{not json"),
    );

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  const upstreamFailures: Array<{
    code: string;
    status: number;
    upstream: number;
  }> = [
    { code: "GOOGLE_UNAUTHENTICATED", status: 502, upstream: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", status: 502, upstream: 403 },
    { code: "GOOGLE_REQUEST_FAILED", status: 502, upstream: 404 },
    { code: "GOOGLE_RATE_LIMITED", status: 429, upstream: 429 },
    { code: "GOOGLE_UNAVAILABLE", status: 502, upstream: 500 },
    { code: "GOOGLE_UNAVAILABLE", status: 502, upstream: 503 },
  ];

  for (const { code, status, upstream } of upstreamFailures) {
    it(`maps getAccountForGcpRegistration HTTP ${upstream} to ${code}`, async () => {
      queueResponses(
        jsonResponse(409, conflictBody()),
        jsonResponse(upstream, {
          error: {
            code: upstream,
            message: `Verification failed for ${ACCESS_TOKEN} on accounts/${OTHER_ACCOUNT_ID}`,
          },
        }),
      );

      const error = await expectGoogleMerchantError(
        registerGoogleMerchantGcpProject(),
        code,
      );

      expect(error.status).toBe(status);
      expect(error.upstreamStatus).toBe(upstream);
    });
  }

  it("fails closed when getAccountForGcpRegistration throws a network error", async () => {
    queueResponses(
      jsonResponse(409, conflictBody()),
      new Error(`socket hang up ${ACCESS_TOKEN}`),
    );

    const error = await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );

    expect(error.status).toBe(502);
  });
});

describe("registerGoogleMerchantGcpProject — developerRegistration lookup", () => {
  const malformedRegistrationBodies: Array<{ body: unknown; label: string }> = [
    { body: {}, label: "an empty object" },
    { body: { gcpIds: [GCP_PROJECT_ID] }, label: "no name" },
    { body: { name: REGISTRATION_NAME }, label: "no gcpIds" },
    {
      body: developerRegistrationBody({ gcpIds: [GCP_PROJECT_ID, null] }),
      label: "a non-string gcpId",
    },
    {
      body: developerRegistrationBody({
        name: `accounts/${OTHER_ACCOUNT_ID}/developerRegistration`,
      }),
      label: "another account's registration",
    },
  ];

  for (const { body, label } of malformedRegistrationBodies) {
    it(`fails closed when getDeveloperRegistration returns ${label}`, async () => {
      queueResponses(
        jsonResponse(409, conflictBody()),
        jsonResponse(200, { name: ACCOUNT_NAME }),
        jsonResponse(200, body),
      );

      await expectGoogleMerchantError(
        registerGoogleMerchantGcpProject(),
        "GOOGLE_REQUEST_FAILED",
      );
    });
  }

  it("fails closed when getDeveloperRegistration returns malformed JSON", async () => {
    queueResponses(
      jsonResponse(409, conflictBody()),
      jsonResponse(200, { name: ACCOUNT_NAME }),
      textResponse(200, "<html>500</html>"),
    );

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  const upstreamFailures: Array<{ code: string; upstream: number }> = [
    { code: "GOOGLE_UNAUTHENTICATED", upstream: 401 },
    { code: "GOOGLE_PERMISSION_DENIED", upstream: 403 },
    { code: "GOOGLE_REQUEST_FAILED", upstream: 404 },
    { code: "GOOGLE_RATE_LIMITED", upstream: 429 },
    { code: "GOOGLE_UNAVAILABLE", upstream: 500 },
  ];

  for (const { code, upstream } of upstreamFailures) {
    it(`maps getDeveloperRegistration HTTP ${upstream} to ${code}`, async () => {
      queueResponses(
        jsonResponse(409, conflictBody()),
        jsonResponse(200, { name: ACCOUNT_NAME }),
        jsonResponse(upstream, {
          error: { code: upstream, message: `Denied ${ACCESS_TOKEN}` },
        }),
      );

      const error = await expectGoogleMerchantError(
        registerGoogleMerchantGcpProject(),
        code,
      );

      expect(error.upstreamStatus).toBe(upstream);
    });
  }

  it("fails closed when getDeveloperRegistration throws a network error", async () => {
    queueResponses(
      jsonResponse(409, conflictBody()),
      jsonResponse(200, { name: ACCOUNT_NAME }),
      new Error("ECONNRESET"),
    );

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );
  });
});

// ---------------------------------------------------------------------------
// Service — non-conflict failures and pre-flight guards
// ---------------------------------------------------------------------------

describe("registerGoogleMerchantGcpProject — registerGcp failures", () => {
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
    it(`maps HTTP ${upstream} to ${code} without verifying`, async () => {
      queueResponses(
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
      expect(fetchUrls()).toEqual([REGISTER_URL]);
    });
  }

  it("maps a network failure to GOOGLE_REQUEST_FAILED", async () => {
    queueResponses(new Error(`socket hang up ${ACCESS_TOKEN}`));

    await expectGoogleMerchantError(
      registerGoogleMerchantGcpProject(),
      "GOOGLE_REQUEST_FAILED",
    );
  });

  it("survives a non-JSON error body", async () => {
    queueResponses(textResponse(502, "<html>502 Bad Gateway</html>"));

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

const makeHarness = (
  authUser: { email: string; id: string; role: string } | null,
  registerGcpProject = vi.fn().mockResolvedValue(PUBLIC_SUCCESS),
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

  it("returns exactly registered, name and gcpIds", async () => {
    const { harness, registerGcpProject } = makeHarness(ADMIN);
    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      gcpIds: [GCP_PROJECT_ID],
      name: REGISTRATION_NAME,
      registered: true,
    });
    expect(Object.keys(JSON.parse(body)).sort()).toEqual([
      "gcpIds",
      "name",
      "registered",
    ]);
    expect(registerGcpProject).toHaveBeenCalledTimes(1);
  });

  it("strips any extra field the service might return", async () => {
    const leaky = vi.fn().mockResolvedValue({
      ...PUBLIC_SUCCESS,
      accessToken: ACCESS_TOKEN,
      alreadyRegistered: true,
      credentialConfiguration: { type: "external_account" },
    });

    const { harness } = makeHarness(ADMIN, leaky);
    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(Object.keys(JSON.parse(body)).sort()).toEqual([
      "gcpIds",
      "name",
      "registered",
    ]);
    expect(body).not.toContain("alreadyRegistered");
    expect(body).not.toContain(ACCESS_TOKEN);
  });
});

describe("POST /register — failure handling", () => {
  beforeEach(() => {
    enableProductionRegistration();
  });

  it("surfaces a verified account mismatch as a sanitised 409", async () => {
    const { harness } = makeHarness(
      ADMIN,
      vi
        .fn()
        .mockRejectedValue(
          new GoogleMerchantError(
            "GOOGLE_ACCOUNT_MISMATCH",
            "The GCP project is already registered to a different Merchant Center account.",
            409,
            409,
          ),
        ),
    );

    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(409);
    expect(JSON.parse(body) as ErrorBody).toEqual({
      code: "GOOGLE_ACCOUNT_MISMATCH",
      message:
        "The GCP project is already registered to a different Merchant Center account.",
    });
    expect(body).not.toContain(OTHER_ACCOUNT_ID);
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
      `boom: token=${ACCESS_TOKEN} config={"type":"external_account"} account=accounts/${OTHER_ACCOUNT_ID}`,
    );

    const { harness } = makeHarness(ADMIN, vi.fn().mockRejectedValue(leaky));
    const response = await post(harness);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain(ACCESS_TOKEN);
    expect(body).not.toContain("external_account");
    expect(body).not.toContain(OTHER_ACCOUNT_ID);
    expect(body).not.toContain("at Object");
    expect(JSON.parse(body)).toEqual({
      code: "REGISTRATION_FAILED",
      message: "The registration request could not be completed.",
    });
    expect(loggedText()).not.toContain(ACCESS_TOKEN);
  });
});
