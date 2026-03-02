import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

if (typeof window === "undefined" && !neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize the Drizzle client.");
}

declare global {
  var __fttDbPool: Pool | undefined;
}

const pool = globalThis.__fttDbPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
  globalThis.__fttDbPool = pool;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;

export { pool };
