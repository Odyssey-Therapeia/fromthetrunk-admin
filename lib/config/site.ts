export function getSiteOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SERVER_URL;
  if (url) return url.replace(/\/$/, "");  // strip trailing slash
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SERVER_URL is required in production");
  }
  return "https://www.fromthetrunk.shop";  // dev/test default (the actual canonical)
}
