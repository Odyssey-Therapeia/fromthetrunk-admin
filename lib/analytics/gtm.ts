export function shouldRenderGtm(gtmId: string | undefined): boolean {
  return Boolean(gtmId);
}
export function buildGtmSrc(gtmId: string): string {
  return `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
}
