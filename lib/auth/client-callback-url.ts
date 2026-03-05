"use client";

const DEFAULT_FALLBACK_PATH = "/";

export const buildClientCallbackUrl = (
  target: null | string | undefined,
  fallbackPath = DEFAULT_FALLBACK_PATH,
  origin = typeof window !== "undefined" ? window.location.origin : undefined
): string => {
  const normalizedFallback = fallbackPath.startsWith("/")
    ? fallbackPath
    : `/${fallbackPath}`;

  if (!origin) {
    return target && target.trim().length > 0 ? target : normalizedFallback;
  }

  const candidate = target && target.trim().length > 0 ? target : normalizedFallback;

  try {
    const url = new URL(candidate, origin);

    if (url.origin !== origin) {
      return new URL(`${url.pathname}${url.search}${url.hash}`, origin).toString();
    }

    return url.toString();
  } catch {
    return new URL(normalizedFallback, origin).toString();
  }
};
