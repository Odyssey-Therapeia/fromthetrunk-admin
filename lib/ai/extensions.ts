import { rawSql, withRetry } from "@/db";

let vectorReadyPromise: null | Promise<boolean> = null;
let embeddingsTableReadyPromise: null | Promise<boolean> = null;

const memoizeReadiness = async (
  getCurrent: () => null | Promise<boolean>,
  setCurrent: (value: null | Promise<boolean>) => void,
  label: string,
  operation: () => Promise<boolean>,
) => {
  if (!getCurrent()) {
    setCurrent(
      operation()
        .then((ready) => {
          if (!ready) {
            setCurrent(null);
          }

          return ready;
        })
        .catch((error) => {
          setCurrent(null);
          console.warn(`[ai] Unable to verify ${label}.`, error);
          return false;
        }),
    );
  }

  return getCurrent()!;
};

const checkVectorExtension = async () => {
  const rows = (await withRetry(() => rawSql`
    select exists (
      select 1
      from pg_extension
      where extname = 'vector'
    ) as installed
  `)) as Array<{ installed?: boolean }>;

  return Boolean(rows[0]?.installed);
};

export const ensureVectorExtension = async () => {
  return memoizeReadiness(
    () => vectorReadyPromise,
    (value) => {
      vectorReadyPromise = value;
    },
    "vector extension readiness",
    checkVectorExtension,
  );
};

export const ensureProductEmbeddingsTable = async () => {
  return memoizeReadiness(
    () => embeddingsTableReadyPromise,
    (value) => {
      embeddingsTableReadyPromise = value;
    },
    "product_embeddings readiness",
    async () => {
      const hasVector = await ensureVectorExtension();
      if (!hasVector) {
        return false;
      }

      const rows = (await withRetry(() => rawSql`
        select to_regclass('public.product_embeddings') as table_name
      `)) as Array<{ table_name?: null | string }>;

      return rows[0]?.table_name === "product_embeddings";
    },
  );
};
