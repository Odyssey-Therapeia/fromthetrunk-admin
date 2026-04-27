type NumberEnvOptions = {
  allowZero?: boolean;
};

const parseNumberEnv = (
  name: string,
  fallback: number,
  { allowZero = true }: NumberEnvOptions = {}
) => {
  const rawValue = process.env[name];
  const value =
    rawValue && rawValue.trim().length > 0 ? Number(rawValue) : fallback;

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }

  if (value < 0 || (!allowZero && value === 0)) {
    throw new Error(
      `${name} must be ${allowZero ? "a non-negative" : "a positive"} number.`
    );
  }

  return value;
};

/** GST rate for textile and apparel products in India. */
export const GST_RATE = parseNumberEnv("NEXT_PUBLIC_FTT_GST_RATE", 0.12);

/** Shipping cost tiers in INR. */
export const SHIPPING_TIERS = {
  /** Free shipping threshold in INR. */
  freeThreshold: parseNumberEnv("NEXT_PUBLIC_FTT_SHIPPING_FREE_THRESHOLD", 25000),
  standard: parseNumberEnv("NEXT_PUBLIC_FTT_SHIPPING_STANDARD", 500, {
    allowZero: false,
  }),
  express: parseNumberEnv("NEXT_PUBLIC_FTT_SHIPPING_EXPRESS", 1200, {
    allowZero: false,
  }),
} as const;

export type ShippingMethod = Exclude<keyof typeof SHIPPING_TIERS, "freeThreshold">;
