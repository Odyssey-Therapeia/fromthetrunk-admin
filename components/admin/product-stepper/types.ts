import { toRupees } from "@/db/money";

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
  slug: string;
  status: "draft" | "published";
  storyEra: string;
  storyNarrative: string;
  storyProvenance: string;
  storyTitle: string;
  tagsCsv: string;
};

export const mapProductToStepperValues = (product: {
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
  slug?: string;
  status?: "draft" | "published";
  storyEra?: null | string;
  storyNarrative?: null | string;
  storyProvenance?: null | string;
  storyTitle?: string;
  tags?: Array<{ id: number }>;
}): ProductStepperValues => ({
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
  slug: product.slug ?? "",
  status: product.status ?? "draft",
  storyEra: product.storyEra ?? "",
  storyNarrative: product.storyNarrative ?? "",
  storyProvenance: product.storyProvenance ?? "",
  storyTitle: product.storyTitle ?? "",
  tagsCsv: product.tags?.map((tag) => tag.id).join(", ") ?? "",
});

export const defaultStepperValues: ProductStepperValues = {
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
  slug: "",
  status: "draft",
  storyEra: "",
  storyNarrative: "",
  storyProvenance: "",
  storyTitle: "",
  tagsCsv: "",
};
