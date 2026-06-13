import { describe, expect, it } from "vitest";

import { formatINR } from "@/db/money";
import { orderConfirmationEmail } from "@/lib/email/templates";

describe("formatINR (canonical, takes paise)", () => {
  it("formats 1750000 paise as ₹17,500 — guards against 100× bug", () => {
    const result = formatINR(1750000);
    expect(result).toContain("17,500");
    expect(result).toContain("₹");
  });

  it("formats 0 paise as ₹0", () => {
    const result = formatINR(0);
    expect(result).toContain("0");
    expect(result).toContain("₹");
  });
});

describe("orderConfirmationEmail renders correct INR amounts", () => {
  it("renders ₹17,500 for an order with totalPaise 1750000", () => {
    // toEmailOrder in complete-paid-order.ts divides paise by 100 before
    // passing to EmailOrder. So total: 17500 represents 1750000 paise.
    const { html } = orderConfirmationEmail({
      id: "order-abc-12345678",
      items: [{ name: "Silk Saree", price: 17500, quantity: 1 }],
      subtotal: 17500,
      total: 17500,
    });

    // Must show ₹17,500 (not ₹17,500,00 which would be 100× wrong, not ₹175)
    expect(html).toContain("17,500");
    expect(html).not.toMatch(/17,500,00/);
    expect(html).not.toMatch(/₹175[^,0]/);
  });
});
