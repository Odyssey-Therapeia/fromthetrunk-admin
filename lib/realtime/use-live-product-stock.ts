"use client";

import { useCallback, useMemo } from "react";

import { useElectricShapeRows } from "@/lib/realtime/use-electric-shape";

type StockStatus = "available" | "reserved" | "sold";

type LiveProductStockOptions = {
  initialStatus: StockStatus;
  productId: string;
  productSlug: string;
};

type ProductStockRow = {
  id: string;
  reservedUntil: null | string;
  stockStatus: StockStatus;
};

const normalizeStockRow = (
  value: unknown,
  fallbackStatus: StockStatus
): ProductStockRow | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const stockStatus =
    (typeof row.stockStatus === "string" ? row.stockStatus : row.stock_status) ??
    fallbackStatus;

  const normalizedStatus: StockStatus =
    stockStatus === "reserved" || stockStatus === "sold" ? stockStatus : "available";

  return {
    id: String(row.id ?? ""),
    reservedUntil:
      typeof row.reservedUntil === "string"
        ? row.reservedUntil
        : typeof row.reserved_until === "string"
          ? row.reserved_until
          : null,
    stockStatus: normalizedStatus,
  };
};

export const useLiveProductStock = ({
  initialStatus,
  productId,
  productSlug,
}: LiveProductStockOptions) => {
  const fallbackFetch = useCallback(async () => {
    const response = await fetch(`/api/v2/products/${productSlug}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return [
        {
          id: productId,
          reservedUntil: null,
          stockStatus: initialStatus,
        },
      ] satisfies ProductStockRow[];
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const row = normalizeStockRow(payload, initialStatus);
    if (!row) {
      return [
        {
          id: productId,
          reservedUntil: null,
          stockStatus: initialStatus,
        },
      ] satisfies ProductStockRow[];
    }
    return [row];
  }, [initialStatus, productId, productSlug]);

  const shapeParams = useMemo(
    () => ({
      params: [productId],
      replica: "full",
      where: "id = $1",
    }),
    [productId]
  );

  const { mode, rows } = useElectricShapeRows<ProductStockRow>({
    fallbackFetch,
    initialRows: [
      {
        id: productId,
        reservedUntil: null,
        stockStatus: initialStatus,
      },
    ],
    mapRows: (values) =>
      values
        .map((entry) => normalizeStockRow(entry, initialStatus))
        .filter((entry): entry is ProductStockRow => Boolean(entry)),
    pollIntervalMs: 10_000,
    shapeParams,
    table: "products",
  });

  return {
    mode,
    reservedUntil: rows[0]?.reservedUntil ?? null,
    stockStatus: rows[0]?.stockStatus ?? initialStatus,
  };
};
