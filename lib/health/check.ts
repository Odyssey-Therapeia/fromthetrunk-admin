/**
 * P6-07: Health check — DB connectivity probe.
 *
 * checkHealth() runs a lightweight DB query (select from products limit 1)
 * to verify the database is reachable. Returns a structured result indicating
 * whether each critical path is healthy.
 *
 * Never throws — all errors are caught and reflected in the status object.
 */
import { db } from "@/db";
import { products } from "@/db/schema";

export type HealthResult = {
  healthy: boolean;
  checks: {
    db: "ok" | "error";
  };
};

/**
 * Probe all critical paths and return a structured health result.
 * Healthy = all checks pass. Unhealthy = any check fails.
 * Never throws.
 */
export async function checkHealth(): Promise<HealthResult> {
  let dbStatus: "ok" | "error" = "error";

  try {
    await db.select().from(products).limit(1);
    dbStatus = "ok";
  } catch {
    dbStatus = "error";
  }

  const healthy = dbStatus === "ok";

  return {
    healthy,
    checks: {
      db: dbStatus,
    },
  };
}
