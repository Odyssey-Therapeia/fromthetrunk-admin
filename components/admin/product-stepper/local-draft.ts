import type { ProductStepperMedia, ProductStepperValues } from "./types";

const LOCAL_DRAFT_VERSION = 1;
const LOCAL_DRAFT_PREFIX = "ftt-admin:product-stepper:local-draft";
const LOCAL_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export type ProductStepperLocalDraft = {
  media: ProductStepperMedia[];
  productId: string | null;
  stepIndex: number;
  updatedAt: string;
  values: ProductStepperValues;
  version: typeof LOCAL_DRAFT_VERSION;
};

type SaveProductStepperLocalDraftInput = {
  media: ProductStepperMedia[];
  productId: string | null;
  stepIndex: number;
  values: ProductStepperValues;
};

const canUseLocalStorage = () =>
  typeof window !== "undefined" && Boolean(window.localStorage);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const getProductStepperLocalDraftKey = (
  productId: string | null | undefined,
) => `${LOCAL_DRAFT_PREFIX}:${productId ?? "new"}`;

export const saveProductStepperLocalDraft = (
  key: string,
  input: SaveProductStepperLocalDraftInput,
) => {
  if (!canUseLocalStorage()) return;

  const draft: ProductStepperLocalDraft = {
    media: input.media,
    productId: input.productId,
    stepIndex: input.stepIndex,
    updatedAt: new Date().toISOString(),
    values: input.values,
    version: LOCAL_DRAFT_VERSION,
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Local storage can fail in private browsing, low storage, or locked-down
    // browser profiles. The DB/server autosave remains the canonical fallback.
  }
};

export const readProductStepperLocalDraft = (
  key: string,
): ProductStepperLocalDraft | null => {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;

    if (parsed.version !== LOCAL_DRAFT_VERSION) {
      window.localStorage.removeItem(key);
      return null;
    }

    if (typeof parsed.updatedAt !== "string") {
      window.localStorage.removeItem(key);
      return null;
    }

    const updatedAtMs = new Date(parsed.updatedAt).getTime();
    if (
      !Number.isFinite(updatedAtMs) ||
      Date.now() - updatedAtMs > LOCAL_DRAFT_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(key);
      return null;
    }

    if (!isRecord(parsed.values)) return null;
    if (!Array.isArray(parsed.media)) return null;
    if (typeof parsed.stepIndex !== "number") return null;

    return parsed as ProductStepperLocalDraft;
  } catch {
    return null;
  }
};

export const clearProductStepperLocalDraft = (key: string) => {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
};

export const formatLocalDraftAge = (updatedAt: string) => {
  const updatedAtMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return "recently";

  const diffMs = Math.max(0, Date.now() - updatedAtMs);
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
};
