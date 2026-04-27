type NumberEnvOptions = {
  allowZero?: boolean;
};

/**
 * Reads a numeric environment override with a safe fallback.
 *
 * @param name - Environment variable name to read from process.env.
 * @param fallback - Number to use when the environment variable is missing or blank.
 * @param options - Parsing options. `allowZero` defaults to true.
 * @returns The parsed finite number, or the fallback when the variable is empty.
 *
 * Accepted inputs are standard numeric strings such as "0.12", "500", or
 * "25000". The function throws when the value is not finite, negative, or zero
 * while `allowZero` is false.
 */
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

/**
 * Reads a decimal-rate environment override.
 *
 * @param name - Environment variable name to read from process.env.
 * @param fallback - Decimal rate to use when the environment variable is missing or blank.
 * @returns A finite decimal rate in the inclusive range 0 to 1.
 *
 * Accepted inputs include values such as "0", "0.05", "0.12", and "1". The
 * function throws for the same invalid number cases as `parseNumberEnv`, and
 * also throws when the parsed rate is greater than 1.
 */
const parseRateEnv = (name: string, fallback: number) => {
  const value = parseNumberEnv(name, fallback);

  if (value > 1) {
    throw new Error(`${name} must be a decimal rate between 0 and 1.`);
  }

  return value;
};

/** GST rate for textile and apparel products in India. */
export const GST_RATE = parseRateEnv("NEXT_PUBLIC_FTT_GST_RATE", 0.12);

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
