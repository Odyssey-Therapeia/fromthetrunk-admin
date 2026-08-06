/**
 * The ONE controlled Google Merchant product insertion.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Scope guard rails, deliberately narrow:
 *   - Exactly one product id is insertable (`TEST_INSERT_PRODUCT_ID`).
 *   - Read-only against the database: `getProduct` + the reservations count.
 *     Nothing is written, updated or deleted, here or in Merchant Center.
 *   - No catalogue sync, no publish/order hooks, no reconciliation, no polling,
 *     no deletion. Those are separate, later changes.
 *
 * Flow:
 *   getProduct → identity/state checks → inventory check → pure mapping
 *   (product-input.ts) → WIF access token (auth.ts) → productInputs:insert →
 *   strict response validation → sanitised result.
 *
 * A 200 from Google means the product INPUT was accepted. It does NOT mean the
 * offer is approved, served, or eligible for free listings — Google processes
 * and reviews the input asynchronously. Nothing here claims otherwise.
 */

import { deriveStockStatus } from "@/db/inventory";
import type { StockStatus } from "@/db/inventory";
import { getProduct } from "@/db/queries/products";
import { getBatchActiveReservationsCounts } from "@/db/queries/reservations";
import type { ProductWithRelations } from "@/db/queries/products";
import { isInventoryV2 } from "@/lib/config/flags";
import { getGoogleMerchantAccessToken } from "@/lib/google-merchant/auth";
import {
  GoogleMerchantError,
  assertServerRuntime,
  getGoogleMerchantConfig,
  getGoogleMerchantDataSourceName,
} from "@/lib/google-merchant/config";
import {
  MERCHANT_API_BASE_URL,
  mapGoogleFailure,
  merchantApiFetch,
  readJsonSafely,
  unexpectedResponse,
} from "@/lib/google-merchant/merchant-api";
import type { MerchantApiPayload } from "@/lib/google-merchant/merchant-api";
import {
  TEST_INSERT_PRODUCT_ID,
  TEST_INSERT_PRODUCT_SLUG,
  buildMerchantProductInput,
} from "@/lib/google-merchant/product-input";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:insert-product");

export type GoogleMerchantInsertResult = {
  inserted: true;
  productId: string;
  offerId: string;
  /** `accounts/{account}/productInputs/{...}` */
  productInputName: string;
  /** `accounts/{account}/products/{...}` */
  processedProductName: string;
};

/**
 * Resolve the status that decides purchasability.
 *
 * Inventory v2 ON: quantity_available + live active-reservation count, through
 * the shared `deriveStockStatus` helper — so a saree held in someone's checkout
 * is "reserved" here even if the denormalised column has not caught up.
 * Inventory v2 OFF: the `stockStatus` column, exactly as every other read path.
 */
async function resolveEffectiveStockStatus(
  product: ProductWithRelations,
): Promise<StockStatus> {
  if (!isInventoryV2()) {
    return product.stockStatus;
  }

  const counts = await getBatchActiveReservationsCounts([product.id]);

  return deriveStockStatus({
    activeReservationsCount: counts.get(product.id) ?? 0,
    quantityAvailable: product.quantityAvailable,
  });
}

/**
 * Strictly validate the `ProductInput` Google returns.
 *
 * The five fields validated here are the ones that establish the insertion:
 * both resource names must belong to OUR account, and the offer identity must
 * match what we submitted — a response describing another offer or another
 * account is an unexpected response, not a success.
 *
 * `dataSource` is deliberately NOT checked. It is a field of the processed
 * `Product` resource (accounts.products.get), not of `ProductInput`: requiring
 * it turned successful inserts into a 502. The data source is still pinned on
 * the way in, as the `?dataSource=` query parameter of the insert request.
 *
 * Everything else Google returns — base64EncodedName, base64EncodedProduct,
 * legacyLocal, versionNumber, productAttributes, customAttributes, and any
 * field added later — is ignored. Nothing beyond the two resource names is read
 * from the payload, so none of it can reach the caller.
 */
function validateProductInputResponse(
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
 * Insert the one controlled product into Merchant Center.
 *
 * @param productId must be `TEST_INSERT_PRODUCT_ID`; any other id is refused
 *   before the database is touched (the route validates this too — this is the
 *   service-level backstop).
 * @throws {GoogleMerchantError} with a sanitised, static message.
 */
export async function insertGoogleMerchantTestProduct(
  productId: string = TEST_INSERT_PRODUCT_ID,
): Promise<GoogleMerchantInsertResult> {
  assertServerRuntime();

  if (productId !== TEST_INSERT_PRODUCT_ID) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_FOUND",
      "That product cannot be inserted through this endpoint.",
      404,
    );
  }

  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);

  const product = await getProduct(productId);

  if (!product) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_FOUND",
      "The product does not exist.",
      404,
    );
  }

  if (product.status !== "published") {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_PUBLISHED",
      "The product is not published.",
      409,
    );
  }

  if (product.slug !== TEST_INSERT_PRODUCT_SLUG) {
    throw new GoogleMerchantError(
      "PRODUCT_SLUG_MISMATCH",
      "The product does not have the expected slug.",
      409,
    );
  }

  const effectiveStockStatus = await resolveEffectiveStockStatus(product);

  if (effectiveStockStatus !== "available") {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_PURCHASABLE",
      "The product is not currently purchasable.",
      409,
    );
  }

  // Pure mapping + remaining product-data validation. Throws before any
  // credential is minted, so incomplete data never spends a token.
  const productInput = buildMerchantProductInput({
    effectiveStockStatus,
    product,
  });

  const accessToken = await getGoogleMerchantAccessToken();

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

  log.info("Merchant API accepted the product input", {
    productId: product.id,
  });

  return {
    inserted: true,
    offerId: productInput.offerId,
    processedProductName,
    productId: product.id,
    productInputName,
  };
}
