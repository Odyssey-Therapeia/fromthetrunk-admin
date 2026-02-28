import { describe, expect, it } from "vitest";

import {
  addressCreateSchema,
  addressUpdateSchema,
  profilePatchSchema,
} from "@/lib/validation/account";
import { createOrderSchema } from "@/lib/validation/order";

const shippingAddress = {
  city: "Mumbai",
  country: "India",
  email: "buyer@example.com",
  line1: "12 Heritage Lane",
  name: "A Buyer",
  phone: "+91 99999 00000",
  postalCode: "400001",
  state: "MH",
};

describe("account validation schemas", () => {
  it("requires at least one field in profile patch", () => {
    const result = profilePatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects blank required create fields in address payload", () => {
    const result = addressCreateSchema.safeParse({
      city: "Mumbai",
      country: "India",
      line1: "   ",
      postalCode: "400001",
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one field for address updates", () => {
    const result = addressUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("order validation schema", () => {
  it("accepts a valid payload and strips tampered fields", () => {
    const parsed = createOrderSchema.parse({
      items: [
        {
          productId: "prod_1",
          quantity: 2,
          price: 1,
        },
      ],
      shippingAddress,
      subtotal: 2,
    });

    expect(parsed.items[0]).toEqual({
      productId: "prod_1",
      quantity: 2,
    });
  });

  it("rejects quantity below 1", () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: "prod_1", quantity: 0 }],
      shippingAddress,
    });
    expect(result.success).toBe(false);
  });
});
