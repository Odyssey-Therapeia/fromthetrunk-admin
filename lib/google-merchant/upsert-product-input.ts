/**
 * The single Google Merchant WRITE primitive.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Every product write in this integration goes through `upsertGoogleMerchant-
 * ProductInput` — the controlled one-product endpoint and the catalogue sync
 * batch alike — so authentication, the pinned data source, the request shape
 * and the response validation exist exactly once.
 *
 * `productInputs:insert` is an UPSERT keyed on
 * (contentLanguage, offerId, feedLabel, dataSource): re-submitting the same
 * offer replaces its input rather than creating a duplicate. That is what makes
 * a partially completed batch safe to re-run.
 *
 * A 200 means Google ACCEPTED THE INPUT. It does not mean the offer is
 * approved, serving or eligible for free listings — processing is asynchronous.
 */

import { getGoogleMerchantAccessToken } from "@/lib/google-merchant/auth";
import {
  getGoogleMerchantConfig,
  getGoogleMerchantDataSourceName,
  assertServerRuntime,
} from "@/lib/google-merchant/config";
import {
  MERCHANT_API_BASE_URL,
  mapGoogleFailure,
  merchantApiFetch,
  readJsonSafely,
  unexpectedResponse,
} from "@/lib/google-merchant/merchant-api";
import type { MerchantApiPayload } from "@/lib/google-merchant/merchant-api";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:upsert-product-input");

export type MerchantProductInputResult = {
  offerId: string;
  /** `accounts/{account}/productInputs/{...}` */
  productInputName: string;
  /** `accounts/{account}/products/{...}` */
  processedProductName: string;
};

/**
 * Strictly validate the `ProductInput` Google returns.
 *
 * The five fields validated here are the ones that establish the write: both
 * resource names must belong to OUR account, and the offer identity must match
 * what we submitted — a response describing another offer or another account is
 * an unexpected response, not a success.
 *
 * `dataSource` is deliberately NOT checked. It is a field of the processed
 * `Product` resource (accounts.products.get), not of `ProductInput`: requiring
 * it turned successful inserts into a 502. The data source is still pinned on
 * the way in, as the `?dataSource=` query parameter.
 *
 * Everything else Google returns — base64EncodedName, base64EncodedProduct,
 * legacyLocal, versionNumber, productAttributes, customAttributes, and any
 * field added later — is ignored. Nothing beyond the two resource names is read
 * from the payload, so none of it can reach the caller.
 */
export function validateProductInputResponse(
  payload: MerchantApiPayload,
  expected: {
    accountId: string;
    offerId: string;
    upstreamStatus: number;
  },
): { processedProductName: string; productInputName: string } {
  const fail = () => unexpectedResponse(expected.upstreamStatus);

  const productInputPrefix = `accounts/${expected.accountId}/productInputs/`;
  const productPrefix = `accounts/${expected.accountId}/products/`;

  const { contentLanguage, feedLabel, name, offerId, product } = payload;

  if (typeof name !== "string" || !name.startsWith(productInputPrefix)) {
    throw fail();
  }

  if (name.length <= productInputPrefix.length) throw fail();

  if (typeof product !== "string" || !product.startsWith(productPrefix)) {
    throw fail();
  }

  if (product.length <= productPrefix.length) throw fail();

  if (offerId !== expected.offerId) throw fail();
  if (contentLanguage !== "en") throw fail();
  if (feedLabel !== "IN") throw fail();

  return { processedProductName: product, productInputName: name };
}

/**
 * Submit one ProductInput to the configured Merchant data source.
 *
 * @param productInput a ProductInput built by `buildMerchantProductInput` —
 *   this primitive never maps a product itself.
 * @param options.accessToken reuse a token already minted for a batch; omit to
 *   mint one. Either way the token is never logged or returned.
 * @throws {GoogleMerchantError} with a sanitised, static message.
 */
export async function upsertGoogleMerchantProductInput(
  productInput: MerchantProductInput,
  options: { accessToken?: string } = {},
): Promise<MerchantProductInputResult> {
  assertServerRuntime();

  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);
  const accessToken =
    options.accessToken ?? (await getGoogleMerchantAccessToken());

  // URLSearchParams so the `accounts/…/dataSources/…` slashes are percent-
  // encoded rather than pasted raw into the query string.
  const query = new URLSearchParams({ dataSource: dataSourceName });
  const url = `${MERCHANT_API_BASE_URL}/products/v1/accounts/${config.accountId}/productInputs:insert?${query.toString()}`;

  const response = await merchantApiFetch(url, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productInput),
  });

  if (!response.ok) {
    const error = mapGoogleFailure(response.status);
    log.error("Merchant API productInputs:insert failed", {
      code: error.code,
      status: response.status,
    });
    throw error;
  }

  const { processedProductName, productInputName } =
    validateProductInputResponse(await readJsonSafely(response), {
      accountId: config.accountId,
      offerId: productInput.offerId,
      upstreamStatus: response.status,
    });

  return {
    offerId: productInput.offerId,
    processedProductName,
    productInputName,
  };
}
