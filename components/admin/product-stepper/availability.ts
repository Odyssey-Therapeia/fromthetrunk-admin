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

export function getAvailabilitySaveFields(
  values: ProductAvailabilityFields
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
      soldAt: values.soldAt,
      stockStatus: "sold",
    };
  }

  return {
    reservedUntil: values.reservedUntil,
    soldAt: null,
    stockStatus: "reserved",
  };
}
