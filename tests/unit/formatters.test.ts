import { describe, expect, it } from "vitest";

import { formatCurrency } from "@/lib/formatters";

describe("formatCurrency", () => {
  it("formats INR amount correctly", () => {
    const result = formatCurrency(28500);
    expect(result).toContain("28,500");
  });

  it("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });

  it("formats large amounts with Indian grouping", () => {
    const result = formatCurrency(125000);
    expect(result).toContain("1,25,000");
  });

  it("returns a string", () => {
    expect(typeof formatCurrency(100)).toBe("string");
  });
});
