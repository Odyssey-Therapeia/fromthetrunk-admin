/**
 * Reading the CURRENT Google Merchant catalogue state.
 *
 * SERVER ONLY. Never import from a client component. STRICTLY READ-ONLY: this
 * module only ever issues `products.list` GETs.
 *
 *   GET /products/v1/accounts/{account}/products?pageSize=1000[&pageToken=…]
 *
 * Only the fields reconciliation and status inspection need are parsed —
 * identity (name, offerId, contentLanguage, feedLabel, dataSource), a little
 * display context (title, availability, price) and the processing status. The
 * raw upstream payload is never returned, logged, or surfaced in an error.
 *
 * OWNERSHIP: a Google product counts as ours only when its `dataSource` equals
 * the configured API data source. Products from "Found by Google", a
 * supplemental feed or any other source are visible here but never treated as
 * managed by this integration — see `isManagedByDataSource`.
 */

import {
  MERCHANT_API_BASE_URL,
  mapGoogleFailure,
  merchantApiFetch,
  unexpectedResponse,
} from "@/lib/google-merchant/merchant-api";

/** Google returns at most 1000 per page; the catalogue is far below that. */
const PAGE_SIZE = 1000;

/**
 * Hard stop on pagination. Reaching it means we do NOT have the complete Google
 * state, and an incomplete picture would make the planner propose inserts for
 * offers that already exist — so it fails closed rather than guessing.
 */
const MAX_PAGES = 20;

export type GoogleDestinationStatus = {
  reportingContext: string;
  approvedCountries: string[];
  pendingCountries: string[];
  disapprovedCountries: string[];
};

export type GoogleItemLevelIssue = {
  code: string;
  severity: string;
  attribute: null | string;
  reportingContext: null | string;
  description: null | string;
  applicableCountries: string[];
};

/** The safe projection of a Merchant API `Product` resource. */
export type GoogleMerchantProductSummary = {
  /** `accounts/{account}/products/{...}` */
  name: string;
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
  dataSource: string;
  title: null | string;
  availability: null | string;
  price: null | { amountMicros: string; currencyCode: string };
  destinationStatuses: GoogleDestinationStatus[];
  itemLevelIssues: GoogleItemLevelIssue[];
};

const asString = (value: unknown): null | string =>
  typeof value === "string" && value.length > 0 ? value : null;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function parsePrice(
  value: unknown,
): null | { amountMicros: string; currencyCode: string } {
  const price = asRecord(value);
  const amountMicros = price.amountMicros;
  const currencyCode = asString(price.currencyCode);

  if (currencyCode === null) return null;
  if (typeof amountMicros !== "string" && typeof amountMicros !== "number") {
    return null;
  }

  return { amountMicros: String(amountMicros), currencyCode };
}

function parseDestinationStatuses(value: unknown): GoogleDestinationStatus[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const status = asRecord(entry);

    return {
      approvedCountries: asStringArray(status.approvedCountries),
      disapprovedCountries: asStringArray(status.disapprovedCountries),
      pendingCountries: asStringArray(status.pendingCountries),
      reportingContext: asString(status.reportingContext) ?? "UNKNOWN",
    };
  });
}

function parseItemLevelIssues(value: unknown): GoogleItemLevelIssue[] {
  if (!Array.isArray(value)) return [];

  return value.map((entry) => {
    const issue = asRecord(entry);

    return {
      applicableCountries: asStringArray(issue.applicableCountries),
      attribute: asString(issue.attribute),
      code: asString(issue.code) ?? "UNKNOWN",
      description: asString(issue.description),
      reportingContext: asString(issue.reportingContext),
      severity: asString(issue.severity) ?? "UNKNOWN",
    };
  });
}

/**
 * Project one `Product` resource, or null when its identity is unreadable.
 *
 * Identity — name, offerId, contentLanguage, feedLabel, dataSource — is
 * mandatory: without it we cannot tell whether the product is ours, and a
 * product we cannot classify must not be silently ignored.
 */
export function parseGoogleProduct(
  value: unknown,
): null | GoogleMerchantProductSummary {
  const product = asRecord(value);

  const contentLanguage = asString(product.contentLanguage);
  const dataSource = asString(product.dataSource);
  const feedLabel = asString(product.feedLabel);
  const name = asString(product.name);
  const offerId = asString(product.offerId);

  if (!contentLanguage || !dataSource || !feedLabel || !name || !offerId) {
    return null;
  }

  const attributes = asRecord(product.productAttributes);
  const status = asRecord(product.productStatus);

  return {
    availability: asString(attributes.availability),
    contentLanguage,
    dataSource,
    destinationStatuses: parseDestinationStatuses(status.destinationStatuses),
    feedLabel,
    itemLevelIssues: parseItemLevelIssues(status.itemLevelIssues),
    name,
    offerId,
    price: parsePrice(attributes.price),
    title: asString(attributes.title),
  };
}

/** True when the product belongs to the configured API data source. */
export function isManagedByDataSource(
  product: GoogleMerchantProductSummary,
  dataSourceName: string,
): boolean {
  return product.dataSource === dataSourceName;
}

/**
 * List every product Google holds for the account, following `nextPageToken`.
 *
 * @param accessToken a short-lived token, reused across pages. Never logged.
 * @throws {GoogleMerchantError} sanitised, on upstream failure, a malformed
 *   page, or more pages than `MAX_PAGES`.
 */
export async function listGoogleMerchantProducts(
  accountId: string,
  accessToken: string,
): Promise<GoogleMerchantProductSummary[]> {
  const products: GoogleMerchantProductSummary[] = [];
  let pageToken: null | string = null;
  let pages = 0;

  do {
    if (pages >= MAX_PAGES) throw unexpectedResponse();
    pages += 1;

    const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) query.set("pageToken", pageToken);

    const url = `${MERCHANT_API_BASE_URL}/products/v1/accounts/${accountId}/products?${query.toString()}`;
    const response = await merchantApiFetch(url, accessToken, {
      method: "GET",
    });

    if (!response.ok) throw mapGoogleFailure(response.status);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw unexpectedResponse(response.status);
    }

    const page = asRecord(payload);
    const rows = page.products;

    if (rows !== undefined && !Array.isArray(rows)) {
      throw unexpectedResponse(response.status);
    }

    for (const row of rows ?? []) {
      const parsed = parseGoogleProduct(row);
      // A product whose identity we cannot read cannot be classified as ours or
      // not ours — fail closed rather than risk a duplicate insert.
      if (!parsed) throw unexpectedResponse(response.status);

      products.push(parsed);
    }

    const nextPageToken = asString(page.nextPageToken);
    pageToken = nextPageToken;
  } while (pageToken);

  return products;
}
