import { Shape, ShapeStream } from "@electric-sql/client";
import { useEffect, useState } from "react";

type ElectricMode = "electric" | "polling";

type UseElectricShapeRowsOptions<T> = {
  enabled?: boolean;
  fallbackFetch: () => Promise<T[]>;
  initialRows?: T[];
  mapRows: (rows: unknown[]) => T[];
  pollIntervalMs?: number;
  shapeParams?: Record<string, string | string[]>;
  table: string;
};

const shapeServiceUrl =
  process.env.NEXT_PUBLIC_ELECTRIC_SHAPE_URL?.trim() || "";

export const useElectricShapeRows = <T>({
  enabled = true,
  fallbackFetch,
  initialRows = [],
  mapRows,
  pollIntervalMs = 12_000,
  shapeParams = {},
  table,
}: UseElectricShapeRowsOptions<T>) => {
  const [mode, setMode] = useState<ElectricMode>(
    shapeServiceUrl ? "electric" : "polling",
  );
  const [rows, setRows] = useState<T[]>(initialRows);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let interval: NodeJS.Timeout | null = null;
    let unsubscribe: null | (() => void) = null;

    const runFallbackFetch = async () => {
      try {
        const fallbackRows = await fallbackFetch();
        if (!cancelled) {
          setRows(fallbackRows);
        }
      } catch {
        // Ignore fallback fetch errors to keep UI resilient.
      }
    };

    const startPolling = async () => {
      if (!cancelled) {
        setMode("polling");
      }
      await runFallbackFetch();
      interval = setInterval(() => {
        void runFallbackFetch();
      }, pollIntervalMs);
    };

    if (!shapeServiceUrl) {
      void startPolling();
      return () => {
        cancelled = true;
        if (interval) clearInterval(interval);
      };
    }

    try {
      const stream = new ShapeStream({
        params: {
          table,
          ...shapeParams,
        },
        url: `${shapeServiceUrl.replace(/\/$/, "")}/v1/shape`,
      });
      const shape = new Shape(stream);

      void shape.rows
        .then((initialShapeRows) => {
          if (!cancelled) {
            setMode("electric");
            setRows(mapRows(initialShapeRows as unknown[]));
          }
        })
        .catch(async () => {
          await startPolling();
        });

      unsubscribe = shape.subscribe(
        ({ rows: liveRows }: { rows: unknown[] }) => {
          if (cancelled) return;
          setMode("electric");
          setRows(mapRows(liveRows));
        },
      );
    } catch {
      void startPolling();
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      unsubscribe?.();
    };
  }, [enabled, fallbackFetch, mapRows, pollIntervalMs, shapeParams, table]);

  return {
    mode,
    rows,
  };
};
