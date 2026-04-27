import { describe, expect, it } from "vitest";

import {
  applyStockStatusChange,
  getAvailabilitySaveFields,
  validateReservedUntil,
} from "@/components/admin/product-stepper/availability";
import { mapProductToStepperValues } from "@/components/admin/product-stepper/types";

describe("product stepper availability", () => {
  it("hydrates stock status and timestamps from an existing product", () => {
    const soldAt = new Date("2026-04-20T10:30:00.000Z");
    const reservedUntil = new Date("2026-04-21T10:30:00.000Z");

    const values = mapProductToStepperValues({
      reservedUntil,
      soldAt,
      stockStatus: "sold",
    });

    expect(values.stockStatus).toBe("sold");
    expect(values.soldAt).toBe("2026-04-20T10:30:00.000Z");
    expect(values.reservedUntil).toBe("2026-04-21T10:30:00.000Z");
  });

  it("defaults new products to available without timestamps", () => {
    const values = mapProductToStepperValues({});

    expect(values.stockStatus).toBe("available");
    expect(values.soldAt).toBeNull();
    expect(values.reservedUntil).toBeNull();
  });

  it("marks a product sold with a soldAt timestamp and clears reservations", () => {
    const now = new Date("2026-04-25T08:00:00.000Z");

    const values = applyStockStatusChange(
      {
        reservedUntil: "2026-04-25T09:00:00.000Z",
        soldAt: null,
        stockStatus: "available",
      },
      "sold",
      now
    );

    expect(values).toEqual({
      reservedUntil: null,
      soldAt: "2026-04-25T08:00:00.000Z",
      stockStatus: "sold",
    });
  });

  it("marks a product reserved with an expiry and clears sold timestamps", () => {
    const values = applyStockStatusChange(
      {
        reservedUntil: "2026-04-29T09:00:00.000Z",
        soldAt: "2026-04-20T10:30:00.000Z",
        stockStatus: "sold",
      },
      "reserved",
      new Date("2026-04-25T08:00:00.000Z")
    );

    expect(values).toEqual({
      reservedUntil: "2026-04-29T09:00:00.000Z",
      soldAt: null,
      stockStatus: "reserved",
    });
  });

  it("preserves sold availability during autosave payload normalization", () => {
    const values = getAvailabilitySaveFields(
      {
        reservedUntil: null,
        soldAt: "2026-04-20T10:30:00.000Z",
        stockStatus: "sold",
      }
    );

    expect(values).toEqual({
      reservedUntil: null,
      soldAt: "2026-04-20T10:30:00.000Z",
      stockStatus: "sold",
    });
  });

  it("adds a sold timestamp during save normalization when one is missing", () => {
    const values = getAvailabilitySaveFields(
      {
        reservedUntil: "2026-04-25T09:00:00.000Z",
        soldAt: null,
        stockStatus: "sold",
      },
      new Date("2026-04-27T10:00:00.000Z")
    );

    expect(values).toEqual({
      reservedUntil: null,
      soldAt: "2026-04-27T10:00:00.000Z",
      stockStatus: "sold",
    });
  });

  it("clears sold and reserved timestamps when returning to available", () => {
    const values = applyStockStatusChange(
      {
        reservedUntil: "2026-04-25T09:00:00.000Z",
        soldAt: "2026-04-20T10:30:00.000Z",
        stockStatus: "sold",
      },
      "available"
    );

    expect(values).toEqual({
      reservedUntil: null,
      soldAt: null,
      stockStatus: "available",
    });
  });

  it("allows reservation expiry only when the value is blank or in the future", () => {
    const now = new Date("2026-04-27T10:00:00.000Z");

    expect(validateReservedUntil(null, now)).toBeUndefined();
    expect(validateReservedUntil("2026-04-27T10:01:00.000Z", now)).toBeUndefined();
    expect(validateReservedUntil("2026-04-27T09:59:00.000Z", now)).toBe(
      "Choose a future reservation expiry."
    );
    expect(validateReservedUntil("not-a-date", now)).toBe(
      "Choose a valid reservation expiry."
    );
  });
});
