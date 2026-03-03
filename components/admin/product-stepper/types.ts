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
