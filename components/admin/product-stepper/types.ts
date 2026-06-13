import { toRupees } from "@/db/money";

import type { ProductStockStatus } from "./availability";

export type ProductStepperMedia = {
  filename: string;
  id: string;
  url: string;
};

export type ProductStepperValues = {
  collectionId: string;
  detailsCondition: string;
  detailsDesigner: string;
  detailsFabric: string;
  detailsLength: string;
  detailsWidth: string;
  featured: boolean;
  imageMediaIds: string[];
  name: string;
  originalPriceRupees: number;
  priceRupees: number;
  reservedUntil: null | string;
  slug: string;
  soldAt: null | string;
  status: "draft" | "published";
  stockStatus: ProductStockStatus;
  storyEra: string;
  storyNarrative: string;
  storyProvenance: string;
  storyTitle: string;
  tagsCsv: string;
  /**
   * P4-02: UUID of the selected product_types row.
   * null when no type has been selected (the "Type" step not yet completed).
   */
  typeId: null | string;
  /**
   * P4-02: Attribute values keyed by attribute_defs[n].key.
   * Persisted to products.attributes (jsonb) on save.
   * Validated at submit time via buildTypeZodSchema(attributeDefs).
   */
  attributeValues: Record<string, unknown>;
};

const toNullableIsoString = (value?: Date | null | string) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

export const mapProductToStepperValues = (product: {
  attributes?: Record<string, unknown> | null;
  collectionId?: null | string;
  detailsCondition?: null | string;
  detailsDesigner?: null | string;
  detailsFabric?: null | string;
  detailsLength?: null | string;
  detailsWidth?: null | string;
  featured?: boolean;
  images?: Array<{ media: { id: string }; sortOrder?: number }>;
  name?: string;
  originalPricePaise?: null | number;
  pricePaise?: number;
  reservedUntil?: Date | null | string;
  slug?: string;
  soldAt?: Date | null | string;
  status?: "draft" | "published";
  stockStatus?: ProductStockStatus;
  storyEra?: null | string;
  storyNarrative?: null | string;
  storyProvenance?: null | string;
  storyTitle?: string;
  tags?: Array<{ id: number }>;
  typeId?: null | string;
}): ProductStepperValues => ({
  attributeValues: product.attributes ?? {},
  collectionId: product.collectionId ?? "",
  detailsCondition: product.detailsCondition ?? "",
  detailsDesigner: product.detailsDesigner ?? "",
  detailsFabric: product.detailsFabric ?? "",
  detailsLength: product.detailsLength ?? "",
  detailsWidth: product.detailsWidth ?? "",
  featured: Boolean(product.featured),
  imageMediaIds:
    product.images
      ? [...product.images]
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((image) => image.media.id)
      : [],
  name: product.name ?? "",
  originalPriceRupees: product.originalPricePaise ? toRupees(product.originalPricePaise) : 0,
  priceRupees: product.pricePaise ? toRupees(product.pricePaise) : 0,
  reservedUntil: toNullableIsoString(product.reservedUntil),
  slug: product.slug ?? "",
  soldAt: toNullableIsoString(product.soldAt),
  status: product.status ?? "draft",
  stockStatus: product.stockStatus ?? "available",
  storyEra: product.storyEra ?? "",
  storyNarrative: product.storyNarrative ?? "",
  storyProvenance: product.storyProvenance ?? "",
  storyTitle: product.storyTitle ?? "",
  tagsCsv: product.tags?.map((tag) => tag.id).join(", ") ?? "",
  typeId: product.typeId ?? null,
});

export const defaultStepperValues: ProductStepperValues = {
  attributeValues: {},
  collectionId: "",
  detailsCondition: "",
  detailsDesigner: "",
  detailsFabric: "",
  detailsLength: "",
  detailsWidth: "",
  featured: false,
  imageMediaIds: [],
  name: "",
  originalPriceRupees: 0,
  priceRupees: 0,
  reservedUntil: null,
  slug: "",
  soldAt: null,
  status: "draft",
  stockStatus: "available",
  storyEra: "",
  storyNarrative: "",
  storyProvenance: "",
  storyTitle: "",
  tagsCsv: "",
  typeId: null,
};
