/**
 * P6-01: Customer accounts v2 — mutation-proof tests (route-level).
 *
 * Tests:
 *  1. Email-change verification token (lib/users/email-verification-token.ts)
 *  2. Orders/addresses API route auth-gating (via route-harness)
 *  3. Email-change route behavior (mutation-proven via mock of db/queries/*)
 *
 * NOTE: listOrders WHERE-clause mutation-proof tests are in
 * customer-accounts-p6-01-query.test.ts which mocks @/db at the builder level.
 *
 * TEST DISCIPLINE: we mock @/db/queries/* for route-level tests;
 * we assert behavior rather than internals at this level.
 */

import { describe, it, expect, vi } from "vitest";

// ── Mock @/db to avoid DATABASE_URL requirement ───────────────────────────────
// Route-level tests use @/db/queries/* mocks; we still need @/db mocked to
// prevent the neon client from throwing on import.
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  withRetry: (fn: () => unknown) => fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Email-change verification token
// ─────────────────────────────────────────────────────────────────────────────

describe("createEmailVerificationToken / verifyEmailVerificationToken", () => {
  it("valid token: create then verify returns { valid: true, userId, newEmail }", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { createEmailVerificationToken, verifyEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    const token = createEmailVerificationToken("user-abc", "new@example.com");
    const result = verifyEmailVerificationToken(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.userId).toBe("user-abc");
      expect(result.newEmail).toBe("new@example.com");
    }
  });

  it("expired token returns { valid: false }", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { createEmailVerificationToken, verifyEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    const token = createEmailVerificationToken("user-abc", "new@example.com", Date.now() - 1000);
    const result = verifyEmailVerificationToken(token);
    expect(result.valid).toBe(false);
  });

  it("forged HMAC returns { valid: false }", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { createEmailVerificationToken, verifyEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    const token = createEmailVerificationToken("user-abc", "new@example.com");
    const forged = "zzzz" + token.slice(4);
    const result = verifyEmailVerificationToken(forged);
    expect(result.valid).toBe(false);
  });

  it("token for a different userId carries that userId — caller must compare", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { createEmailVerificationToken, verifyEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    const tokenForXyz = createEmailVerificationToken("user-xyz", "new@example.com");
    const result = verifyEmailVerificationToken(tokenForXyz);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.userId).toBe("user-xyz");
    }
  });

  it("missing or empty token returns { valid: false }", async () => {
    const { verifyEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    expect(verifyEmailVerificationToken(undefined)).toEqual({ valid: false });
    expect(verifyEmailVerificationToken("")).toEqual({ valid: false });
  });

  it("token with no pipe separator returns { valid: false }", async () => {
    const { verifyEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    expect(verifyEmailVerificationToken("aabbcc")).toEqual({ valid: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Route-level tests — mock @/db/queries/* so route code doesn't hit the DB
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/db/queries/orders", () => ({
  listOrders: vi.fn().mockResolvedValue([]),
  getOrder: vi.fn().mockResolvedValue(null),
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  addOrderEvent: vi.fn(),
  deleteOrder: vi.fn(),
}));

vi.mock("@/db/queries/users", () => ({
  getUserById: vi.fn().mockResolvedValue(null),
  getUserByEmail: vi.fn().mockResolvedValue(null),
  updateUser: vi.fn().mockResolvedValue(null),
  listUsers: vi.fn().mockResolvedValue([]),
  claimCheckoutShell: vi.fn().mockResolvedValue(null),
  getOrCreateCheckoutCustomer: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/config/site", () => ({
  getSiteOrigin: () => "https://fromthetrunk.com",
}));

// Default: rate limit is NOT triggered (returns null).
// Individual tests can override via vi.mocked(rateLimitResponse).mockResolvedValueOnce(...)
vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: vi.fn().mockResolvedValue(null),
}));

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Orders route — auth gate
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /orders — auth gate", () => {
  it("returns 401 when no session", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      authUser: null,
    });

    const response = await request("/");
    expect(response.status).toBe(401);
  });

  it("returns 200 for authenticated customer", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      authUser: { id: "cust-1", email: "cust@example.com", role: "customer" },
    });

    const response = await request("/");
    expect(response.status).toBe(200);
  });

  it("passes userId and userEmail to listOrders for a customer", async () => {
    const { listOrders } = await import("@/db/queries/orders");
    const mockListOrders = vi.mocked(listOrders);
    mockListOrders.mockClear();

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      authUser: { id: "cust-99", email: "cust99@example.com", role: "customer" },
    });

    await request("/");

    expect(mockListOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "cust-99",
        userEmail: "cust99@example.com",
      })
    );
  });

  it("MUTATION-PROOF: admin call does NOT pass userId (sees all orders)", async () => {
    const { listOrders } = await import("@/db/queries/orders");
    const mockListOrders = vi.mocked(listOrders);
    mockListOrders.mockClear();

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      authUser: { id: "admin-1", email: "admin@fromthetrunk.com", role: "admin" },
    });

    await request("/");

    const call = mockListOrders.mock.calls[0]?.[0];
    expect(call?.userId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Addresses route — auth gate
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /addresses — auth gate", () => {
  it("returns 401 when no session", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");

    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: null,
    });

    const response = await request("/");
    expect(response.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Email-change routes — behavior (mutation-proven)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /users/me/email — email change initiation", () => {
  it("returns 401 when unauthenticated", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: null,
    });

    const response = await request("/me/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "new@example.com" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 409 when the new email belongs to another account", async () => {
    const { getUserByEmail, getUserById } = await import("@/db/queries/users");
    const mockGetUserById = vi.mocked(getUserById);
    const mockGetUserByEmail = vi.mocked(getUserByEmail);
    mockGetUserById.mockClear();
    mockGetUserByEmail.mockClear();

    // Current user
    mockGetUserById.mockResolvedValueOnce({
      id: "user-1",
      email: "current@example.com",
      name: null,
      phone: null,
      role: "customer",
      image: null,
      passwordHash: "hash",
      emailVerified: null,
      defaultAddressId: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      defaultAddress: null,
    });

    // Collision: another account has the new email
    mockGetUserByEmail.mockResolvedValueOnce({
      id: "user-2",
      email: "taken@example.com",
      name: null,
      phone: null,
      role: "customer",
      image: null,
      passwordHash: "hash",
      emailVerified: null,
      defaultAddressId: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      defaultAddress: null,
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    const response = await request("/me/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "taken@example.com" }),
    });
    expect(response.status).toBe(409);
    const json = await response.json() as { code: string };
    expect(json.code).toBe("EMAIL_ALREADY_IN_USE");
  });

  it("sends a verification email and returns 200 when everything is valid", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { getUserByEmail, getUserById } = await import("@/db/queries/users");
    const { sendEmail } = await import("@/lib/email/send");
    const mockGetUserById = vi.mocked(getUserById);
    const mockGetUserByEmail = vi.mocked(getUserByEmail);
    const mockSendEmail = vi.mocked(sendEmail);
    mockGetUserById.mockClear();
    mockGetUserByEmail.mockClear();
    mockSendEmail.mockClear();

    mockGetUserById.mockResolvedValueOnce({
      id: "user-1",
      email: "current@example.com",
      name: null, phone: null, role: "customer", image: null,
      passwordHash: "hash", emailVerified: null, defaultAddressId: null,
      metadata: null, createdAt: new Date(), updatedAt: new Date(),
      defaultAddress: null,
    });
    // No collision
    mockGetUserByEmail.mockResolvedValueOnce(null);

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    const response = await request("/me/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "new@example.com" }),
    });
    expect(response.status).toBe(200);

    // sendEmail should have been called with the new address
    // Give the fire-and-forget a tick to run
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new@example.com" })
    );
  });
});

describe("GET /users/me/verify-email — email change confirmation (mutation-proven)", () => {
  it("returns 401 when unauthenticated", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: null,
    });

    const response = await request("/me/verify-email?token=sometoken");
    expect(response.status).toBe(401);
  });

  it("rejects a missing token — updateUser NOT called (email not changed)", async () => {
    const { updateUser } = await import("@/db/queries/users");
    const mockUpdateUser = vi.mocked(updateUser);
    mockUpdateUser.mockClear();

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    const response = await request("/me/verify-email");
    expect(response.status).toBe(400);

    // MUTATION-PROOF: updateUser must NOT have been called (email unchanged)
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects a forged token — updateUser NOT called (email not changed)", async () => {
    const { updateUser } = await import("@/db/queries/users");
    const mockUpdateUser = vi.mocked(updateUser);
    mockUpdateUser.mockClear();

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    const response = await request("/me/verify-email?token=zzzz-forged-token-xyz");
    expect(response.status).toBe(400);

    // MUTATION-PROOF: updateUser must NOT have been called
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects an expired token — updateUser NOT called (email not changed)", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { createEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    const { updateUser } = await import("@/db/queries/users");
    const mockUpdateUser = vi.mocked(updateUser);
    mockUpdateUser.mockClear();

    const expiredToken = createEmailVerificationToken(
      "user-1",
      "new@example.com",
      Date.now() - 5000
    );

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    const response = await request(
      `/me/verify-email?token=${encodeURIComponent(expiredToken)}`
    );
    expect(response.status).toBe(400);

    // MUTATION-PROOF: updateUser must NOT have been called
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects a valid token issued for a DIFFERENT userId — prevents email takeover", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { createEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    const { updateUser } = await import("@/db/queries/users");
    const mockUpdateUser = vi.mocked(updateUser);
    mockUpdateUser.mockClear();

    // Token is for user-ATTACKER, not the logged-in user-VICTIM
    const attackerToken = createEmailVerificationToken(
      "user-ATTACKER",
      "attacker@evil.com"
    );

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-VICTIM", email: "victim@example.com", role: "customer" },
    });

    const response = await request(
      `/me/verify-email?token=${encodeURIComponent(attackerToken)}`
    );
    expect(response.status).toBe(400);

    // MUTATION-PROOF: victim's email must NOT have been changed
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("accepts a valid token for the correct user and calls updateUser with the new email", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-email-change";
    const { createEmailVerificationToken } = await import(
      "@/lib/users/email-verification-token"
    );
    const { updateUser, getUserByEmail } = await import("@/db/queries/users");
    const mockUpdateUser = vi.mocked(updateUser);
    const mockGetUserByEmail = vi.mocked(getUserByEmail);
    mockUpdateUser.mockClear();
    mockGetUserByEmail.mockClear();

    // No collision on the new email
    mockGetUserByEmail.mockResolvedValueOnce(null);
    mockUpdateUser.mockResolvedValueOnce({
      id: "user-1",
      email: "new@example.com",
      name: null, phone: null, role: "customer", image: null,
      passwordHash: "hash", emailVerified: new Date(), defaultAddressId: null,
      metadata: null, createdAt: new Date(), updatedAt: new Date(),
      defaultAddress: null,
    });

    const validToken = createEmailVerificationToken("user-1", "new@example.com");

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    const response = await request(
      `/me/verify-email?token=${encodeURIComponent(validToken)}`
    );
    expect(response.status).toBe(200);

    // updateUser MUST have been called with the new email
    expect(mockUpdateUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ email: "new@example.com" })
    );
  });

  it("MUTATION-PROOF: PATCH /me does not accept an email field (strict schema rejects it)", async () => {
    // Proves that the only path to change email is via /me/email + verify-email.
    const { updateUser } = await import("@/db/queries/users");
    const mockUpdateUser = vi.mocked(updateUser);
    mockUpdateUser.mockClear();

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "original@example.com", role: "customer" },
    });

    // Attempt to inject email via PATCH /me
    const response = await request("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "hacker@evil.com", name: "Legit Name" }),
    });

    // strict() schema rejects unknown keys
    expect(response.status).not.toBe(200);

    // updateUser must NOT have been called with the evil email
    for (const call of mockUpdateUser.mock.calls) {
      const input = call[1] as Record<string, unknown>;
      expect(input.email).not.toBe("hacker@evil.com");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: GET /orders/{id} — guest-order shippingEmail claim (mutation-proof)
//
// The order LIST route surfaces guest orders (userId=null) that match the
// session user's email via shippingEmail. The DETAIL route must grant access
// with the same visibility rule so listed orders are openable.
//
// Mutation-proof: a non-matching session email still gets 403 (email predicate
// is load-bearing — it cannot over-grant).
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /orders/{id} — guest order access by shippingEmail (mutation-proof)", () => {
  /** A guest order: userId is null, shippingEmail matches the session user. */
  const guestOrder = {
    id: "d4f8e1a2-0001-4000-8000-000000000001",
    userId: null,
    shippingEmail: "customer@example.com",
    shippingName: "Jane Doe",
    shippingLine1: "123 Main St",
    shippingLine2: null,
    shippingCity: "Mumbai",
    shippingState: "MH",
    shippingPostalCode: "400001",
    shippingCountry: "India",
    shippingPhone: null,
    shippingMethod: "standard",
    shippingCostPaise: 0,
    subtotalPaise: 10000,
    totalPaise: 10000,
    taxAmountPaise: 0,
    taxRate: "0.00",
    status: "pending" as const,
    paymentStatus: "pending" as const,
    paymentGateway: null,
    paymentMethod: null,
    paymentId: null,
    razorpayOrderId: null,
    reminderSentAt: null,
    discountId: null,
    discountCode: null,
    // P6-05: new nullable columns
    refundedAt: null,
    refundId: null,
    refundedAmountPaise: null,
    trackingNumber: null,
    trackingCarrier: null,
    internalNote: null,
    placedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    items: [],
    events: [],
  };

  it("returns 200 when session.email matches shippingEmail of a guest order (userId null)", async () => {
    const { getOrder } = await import("@/db/queries/orders");
    const mockGetOrder = vi.mocked(getOrder);
    mockGetOrder.mockClear();
    mockGetOrder.mockResolvedValueOnce(guestOrder);

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      authUser: { id: "user-cust-1", email: "customer@example.com", role: "customer" },
    });

    const response = await request(`/${guestOrder.id}`);
    // MUTATION-PROOF: must be 200 (not 403) when email matches
    expect(response.status).toBe(200);
  });

  it("returns 403 when session.email does NOT match shippingEmail of a guest order (email predicate is load-bearing)", async () => {
    const { getOrder } = await import("@/db/queries/orders");
    const mockGetOrder = vi.mocked(getOrder);
    mockGetOrder.mockClear();
    mockGetOrder.mockResolvedValueOnce(guestOrder);

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      // Different user, different email — must not see this guest order
      authUser: { id: "user-other-99", email: "other@example.com", role: "customer" },
    });

    const response = await request(`/${guestOrder.id}`);
    // MUTATION-PROOF: must be 403 — email did NOT match
    expect(response.status).toBe(403);
  });

  it("admin always gets 200 regardless of userId or shippingEmail", async () => {
    const { getOrder } = await import("@/db/queries/orders");
    const mockGetOrder = vi.mocked(getOrder);
    mockGetOrder.mockClear();
    mockGetOrder.mockResolvedValueOnce(guestOrder);

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      authUser: { id: "admin-1", email: "admin@fromthetrunk.com", role: "admin" },
    });

    const response = await request(`/${guestOrder.id}`);
    expect(response.status).toBe(200);
  });

  it("authenticated user gets 200 for their OWN order (userId matches session.id)", async () => {
    const { getOrder } = await import("@/db/queries/orders");
    const mockGetOrder = vi.mocked(getOrder);
    mockGetOrder.mockClear();
    // Order belongs to user-cust-2 (userId is set)
    mockGetOrder.mockResolvedValueOnce({
      ...guestOrder,
      userId: "user-cust-2",
      shippingEmail: "cust2@example.com",
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerOrderRoutes } = await import("@/api/hono/routes/orders");

    const { request } = createRouteHarness({
      register: registerOrderRoutes,
      authUser: { id: "user-cust-2", email: "cust2@example.com", role: "customer" },
    });

    const response = await request(`/${guestOrder.id}`);
    expect(response.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: POST /users/me/email — rate-limit guard (P6-01 security fix)
//
// Without a rate limit, an authenticated user can email-bomb arbitrary
// addresses through the brand's transactional sender (domain-reputation abuse).
// The handler must apply rateLimitResponse before processing the request.
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /users/me/email — rate-limit guard (P6-01 security fix, mutation-proof)", () => {
  it("returns 429 when the rate limiter triggers (second-within-window request is blocked)", async () => {
    const { rateLimitResponse } = await import("@/lib/http/rate-limit");
    const mockRateLimit = vi.mocked(rateLimitResponse);
    mockRateLimit.mockClear();

    // First call: within limit (returns null — not rate-limited)
    mockRateLimit.mockResolvedValueOnce(null);

    // Second call: over the limit (returns a 429 Response)
    mockRateLimit.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "RATE_LIMITED", message: "Too many requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      )
    );

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    const payload = JSON.stringify({ newEmail: "target@example.com" });
    const headers = { "Content-Type": "application/json" };

    // First request — not rate-limited
    const first = await request("/me/email", { method: "POST", headers, body: payload });
    // The first request hits getUserById (returns null in mock) → 404 is fine here;
    // what matters is the rate limiter was called and did NOT block.
    expect(first.status).not.toBe(429);

    // Second request — rate limiter returns a 429 Response
    const second = await request("/me/email", { method: "POST", headers, body: payload });
    expect(second.status).toBe(429);

    const json = await second.json() as { code: string };
    expect(json.code).toBe("RATE_LIMITED");
  });

  it("MUTATION-PROOF: rateLimitResponse is called on POST /me/email (guard is load-bearing)", async () => {
    const { rateLimitResponse } = await import("@/lib/http/rate-limit");
    const mockRateLimit = vi.mocked(rateLimitResponse);
    mockRateLimit.mockClear();
    mockRateLimit.mockResolvedValue(null); // default: not rate-limited

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerUserRoutes } = await import("@/api/hono/routes/users");

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { id: "user-1", email: "current@example.com", role: "customer" },
    });

    await request("/me/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail: "someone@example.com" }),
    });

    // If the rate-limit guard is removed from the handler, this assertion fails.
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "email-change:request",
      expect.objectContaining({ limit: expect.any(Number), windowSeconds: expect.any(Number) })
    );
  });
});
