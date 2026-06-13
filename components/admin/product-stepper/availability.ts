export type ProductStockStatus = "available" | "reserved" | "sold";

export type ProductAvailabilityFields = {
  reservedUntil: null | string;
  soldAt: null | string;
  stockStatus: ProductStockStatus;
};

export const productStockStatusLabels: Record<ProductStockStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

export const productStockStatusOptions: Array<{
  description: string;
  label: string;
  value: ProductStockStatus;
}> = [
  {
    description: "Ready for shoppers to buy.",
    label: productStockStatusLabels.available,
    value: "available",
  },
  {
    description: "Temporarily held for a buyer.",
    label: productStockStatusLabels.reserved,
    value: "reserved",
  },
  {
    description: "Already purchased and no longer buyable.",
    label: productStockStatusLabels.sold,
    value: "sold",
  },
];

const currentIsoTimestamp = (now: Date) => now.toISOString();

/**
 * Validates an optional reservation expiry timestamp.
 *
 * @param value - ISO timestamp string or null for an open-ended manual hold.
 * @param now - Reference time used for deterministic tests. Defaults to the current time.
 * @returns An admin-facing error string for invalid or past timestamps, otherwise undefined.
 *
 * Core invariant: a reservation expiry is optional, but if present it must parse
 * as a date and it must be strictly in the future.
 */
export const validateReservedUntil = (
  value: null | string,
  now = new Date()
) => {
  if (!value) return undefined;

  const reservedUntil = new Date(value).getTime();

  if (Number.isNaN(reservedUntil)) {
    return "Choose a valid reservation expiry.";
  }

  if (reservedUntil <= now.getTime()) {
    return "Choose a future reservation expiry.";
  }

  return undefined;
};

/**
 * Computes the timestamp changes required when an admin changes stock status.
 *
 * @param current - Current product availability fields from the form state.
 * @param stockStatus - Target availability selected by the admin.
 * @param now - Reference time used when marking a product sold. Defaults to the current time.
 * @returns A side-effect-free availability snapshot for the new status.
 *
 * Core invariants:
 * - available clears both reservation and sold timestamps.
 * - sold clears reservation data and preserves or creates soldAt.
 * - reserved clears soldAt and preserves the current reservation expiry when present.
 */
export function applyStockStatusChange(
  current: ProductAvailabilityFields,
  stockStatus: ProductStockStatus,
  now = new Date()
): ProductAvailabilityFields {
  if (stockStatus === "available") {
    return {
      reservedUntil: null,
      soldAt: null,
      stockStatus,
    };
  }

  if (stockStatus === "sold") {
    return {
      reservedUntil: null,
      soldAt: current.soldAt || currentIsoTimestamp(now),
      stockStatus,
    };
  }

  return {
    reservedUntil: current.reservedUntil ?? null,
    soldAt: null,
    stockStatus,
  };
}

/**
 * Normalizes availability fields before saving a product.
 *
 * @param values - Product availability values from the admin form.
 * @param now - Reference time used when sold stock has no soldAt timestamp.
 * Defaults to the current time.
 * @returns A normalized availability payload with impossible timestamp
 * combinations removed.
 *
 * Core invariants:
 * - available products cannot keep reservedUntil or soldAt.
 * - sold products cannot keep reservedUntil and must have soldAt.
 * - reserved products cannot keep soldAt.
 */
export function getAvailabilitySaveFields(
  values: ProductAvailabilityFields,
  now = new Date()
): ProductAvailabilityFields {
  if (values.stockStatus === "available") {
    return {
      reservedUntil: null,
      soldAt: null,
      stockStatus: "available",
    };
  }

  if (values.stockStatus === "sold") {
    return {
      reservedUntil: null,
      soldAt: values.soldAt || currentIsoTimestamp(now),
      stockStatus: "sold",
    };
  }

  return {
    reservedUntil: values.reservedUntil,
    soldAt: null,
    stockStatus: "reserved",
  };
}
