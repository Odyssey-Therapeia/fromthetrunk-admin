/**
 * The single Google Merchant AVAILABILITY primitive.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * The third Merchant write primitive, alongside `upsert-product-input.ts`
 * (insert/replace) and `delete-product-input.ts` (remove). This one performs a
 * PARTIAL update of exactly one field:
 *
 *   PATCH /products/v1/accounts/{account}/productInputs/en~IN~{offerId}
 *         ?updateMask=productAttributes.availability
 *         &dataSource=accounts/{account}/dataSources/{dataSource}
 *
 *   { "productAttributes": { "availability": "IN_STOCK" | "OUT_OF_STOCK" } }
 *
 * WHY PATCH AND NOT INSERT. `productInputs:insert` upserts the WHOLE input, so
 * using it to flip availability would require rebuilding — and resubmitting —
 * the title, description, price, images and apparel attributes on every
 * inventory change. Google supports partial updates precisely for frequently
 * changing fields like availability, and the update mask guarantees that
 * everything outside it is left untouched. Nothing but availability is ever
 * sent from here.
 *
 * IDENTITY is derived, never accepted: the account comes from the Merchant
 * config, `en`/`IN` are the pinned FTT constants, and the offer id must be a
 * product UUID. `buildMerchantProductInputName` (shared with the delete
 * primitive) does that construction and validation, and
 * `validateProductInputResponse` (shared with the upsert primitive) checks that
 * the ProductInput Google echoes back really is ours. No identity logic is
 * duplicated here.
 *
 * A 2xx means Google ACCEPTED the change. Processing is asynchronous, so
 * `products.list` can still report the old availability for some minutes.
 */

import { getGoogleMerchantAccessToken } from "@/lib/google-merchant/auth";
import {
  assertServerRuntime,
  getGoogleMerchantConfig,
  getGoogleMerchantDataSourceName,
} from "@/lib/google-merchant/config";
import { buildMerchantProductInputName } from "@/lib/google-merchant/delete-product-input";
import {
  MERCHANT_API_BASE_URL,
  mapGoogleFailure,
  merchantApiFetch,
  readJsonSafely,
} from "@/lib/google-merchant/merchant-api";
import { validateProductInputResponse } from "@/lib/google-merchant/upsert-product-input";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:patch-product-availability");

/** The only two availability values this integration ever writes. */
export const MERCHANT_AVAILABILITY_VALUES = [
  "IN_STOCK",
  "OUT_OF_STOCK",
] as const;

export type MerchantAvailability = (typeof MERCHANT_AVAILABILITY_VALUES)[number];

/**
 * The update mask, verbatim. Exactly one field: anything outside it — title,
 * price, images, apparel attributes, the landing page — is left untouched by
 * Google. Exported so tests can assert the literal rather than a rebuild of it.
 */
export const AVAILABILITY_UPDATE_MASK = "productAttributes.availability";

export type MerchantAvailabilityPatchResult = {
  patched: true;
  offerId: string;
  availability: MerchantAvailability;
  /** `accounts/{account}/productInputs/{lang}~{feedLabel}~{offerId}` */
  productInputName: string;
};

/**
 * Set the availability of ONE existing Merchant offer.
 *
 * Exactly one request, no product data beyond the single field.
 *
 * @param offerId the local product UUID.
 * @param availability IN_STOCK or OUT_OF_STOCK.
 * @param options.accessToken reuse a token already minted for the surrounding
 *   read; omit to mint one. Either way the token is never logged or returned.
 * @throws {GoogleMerchantError} with a sanitised, static message.
 */
export async function patchGoogleMerchantProductAvailability(
  offerId: string,
  availability: MerchantAvailability,
  options: { accessToken?: string } = {},
): Promise<MerchantAvailabilityPatchResult> {
  assertServerRuntime();

  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);
  // Validates the offer id and pins account / en / IN — shared with delete.
  const productInputName = buildMerchantProductInputName(
    config.accountId,
    offerId,
  );

  const accessToken =
    options.accessToken ?? (await getGoogleMerchantAccessToken());

  // URLSearchParams so the `accounts/…/dataSources/…` slashes are percent-
  // encoded rather than pasted raw into the query string.
  const query = new URLSearchParams({
    updateMask: AVAILABILITY_UPDATE_MASK,
    dataSource: dataSourceName,
  });
  const url = `${MERCHANT_API_BASE_URL}/products/v1/${productInputName}?${query.toString()}`;

  const response = await merchantApiFetch(url, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    // The ENTIRE body. No title, no price, no images, no attributes.
    body: JSON.stringify({ productAttributes: { availability } }),
  });

  if (!response.ok) {
    const error = mapGoogleFailure(response.status);
    log.error("Merchant API productInputs.patch failed", {
      code: error.code,
      status: response.status,
    });
    throw error;
  }

  // The same strict identity check the insert primitive uses: the echoed
  // ProductInput must belong to OUR account and describe THIS offer in en/IN.
  validateProductInputResponse(await readJsonSafely(response), {
    accountId: config.accountId,
    offerId,
    upstreamStatus: response.status,
  });

  log.info("Merchant product availability patched", { availability, offerId });

  return { availability, offerId, patched: true, productInputName };
}
