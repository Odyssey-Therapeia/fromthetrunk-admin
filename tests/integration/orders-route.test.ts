import { describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/orders/route";

describe("/api/orders (deprecated)", () => {
  it("GET returns 301 directing to /api/account/orders", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(301);
    expect(body.code).toBe("ENDPOINT_MOVED");
  });

  it("POST returns 410 directing to /api/payments/create-order", async () => {
    const response = await POST();
    const body = await response.json();
    expect(response.status).toBe(410);
    expect(body.code).toBe("ENDPOINT_MOVED");
  });
});
