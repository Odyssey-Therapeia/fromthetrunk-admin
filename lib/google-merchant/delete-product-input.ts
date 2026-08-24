/**
 * The single Google Merchant DELETE primitive.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Counterpart to `upsert-product-input.ts`: every ProductInput deletion in this
 * integration goes through `deleteGoogleMerchantProductInput`, so authentication,
 * the pinned account and data source, the resource-name construction and the
 * sanitised error mapping exist exactly once.
 *
 * SCOPE — read this before reusing it. There is no bulk delete, no automatic
 * reconciliation, no cron and no webhook. The ONLY caller is
 * `deleteUnsupportedMerchantProduct`, which refuses anything the local audit
 * does not classify as UNSUPPORTED_PRODUCT_TYPE. This primitive is intentionally
 * dumb about policy: it deletes exactly the offer it is given, so the policy
 * gates must stay in the orchestrator.
 *
 * IDENTITY. The ProductInput resource name is derived, never accepted:
 *
 *   accounts/{accountId}/productInputs/{contentLanguage}~{feedLabel}~{offerId}
 *
 * The account comes from the Merchant config, the language and feed label are
 * the pinned FTT constants, and the offer id must be a product UUID. A caller
 * cannot supply a Google resource URL, an account id or a data source.
 *
 * A 2xx means Google ACCEPTED THE DELETION. Processing is asynchronous, so the
 * processed Product can still appear in `products.list` for some minutes
 * afterwards — nothing here assumes immediate disappearance.
 */

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
} from "@/lib/google-merchant/merchant-api";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:delete-product-input");

/** The pinned FTT ProductInput identity. Mirrors the planner's constants. */
export const DELETE_CONTENT_LANGUAGE = "en";
export const DELETE_FEED_LABEL = "IN";

/** Offer ids are local product UUIDs — nothing else may be deleted. */
const OFFER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MerchantProductInputDeleteResult = {
  deleted: true;
  offerId: string;
  /** `accounts/{account}/productInputs/{lang}~{feedLabel}~{offerId}` */
  productInputName: string;
};

/**
 * Build the ProductInput resource name for one offer.
 *
 * Deterministic and total: the offer id is re-validated here rather than
 * trusted, and every segment is percent-encoded before being joined. For a UUID
 * offer id encoding is a no-op, so the name is exactly the one Merchant Center
 * displays — the encoding exists so a future non-UUID identity can never inject
 * a path segment or a query string into the request URL.
 */
export function buildMerchantProductInputName(
  accountId: string,
  offerId: string,
): string {
  if (!OFFER_ID_PATTERN.test(offerId)) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_FOUND",
      "That product id is not a valid product identifier.",
      400,
    );
  }

  const productInputId = [
    DELETE_CONTENT_LANGUAGE,
    DELETE_FEED_LABEL,
    offerId,
  ]
    .map((segment) => encodeURIComponent(segment))
    .join("~");

  return `accounts/${accountId}/productInputs/${productInputId}`;
}

/**
 * Permanently delete ONE ProductInput from the configured Merchant data source.
 *
 * Exactly one request:
 *
 *   DELETE /products/v1/accounts/{account}/productInputs/en~IN~{offerId}
 *          ?dataSource=accounts%2F{account}%2FdataSources%2F{dataSource}
 *
 * `dataSource` is a REQUIRED query parameter of `productInputs.delete` — it
 * tells Google which data source the input is being removed from — and it is
 * pinned to the configured FTT source, so this call can never remove an input
 * belonging to another feed. There is no request body.
 *
 * Google answers with an empty body, so nothing is parsed: any 2xx is success.
 *
 * @param offerId the local product UUID.
 * @param options.accessToken reuse a token already minted for the surrounding
 *   read; omit to mint one. Either way the token is never logged or returned.
 * @throws {GoogleMerchantError} with a sanitised, static message.
 */
export async function deleteGoogleMerchantProductInput(
  offerId: string,
  options: { accessToken?: string } = {},
): Promise<MerchantProductInputDeleteResult> {
  assertServerRuntime();

  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);
  const productInputName = buildMerchantProductInputName(
    config.accountId,
    offerId,
  );

  const accessToken =
    options.accessToken ?? (await getGoogleMerchantAccessToken());

  // URLSearchParams so the `accounts/…/dataSources/…` slashes are percent-
  // encoded rather than pasted raw into the query string.
  const query = new URLSearchParams({ dataSource: dataSourceName });
  const url = `${MERCHANT_API_BASE_URL}/products/v1/${productInputName}?${query.toString()}`;

  const response = await merchantApiFetch(url, accessToken, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = mapGoogleFailure(response.status);
    log.error("Merchant API productInputs.delete failed", {
      code: error.code,
      status: response.status,
    });
    throw error;
  }

  // The response body is Empty — nothing is read from it, so nothing upstream
  // can reach the caller.
  log.info("Merchant product input deleted", { offerId });

  return { deleted: true, offerId, productInputName };
}
