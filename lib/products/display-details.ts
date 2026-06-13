type ProductDisplayDetailSource = {
  detailsCondition?: null | string;
  detailsDesigner?: null | string;
  detailsFabric?: null | string;
  detailsLength?: null | string;
  detailsWidth?: null | string;
  name?: null | string;
  storyNarrative?: null | string;
  storyProvenance?: null | string;
  storyTitle?: null | string;
  tags?: Array<{ name?: null | string }>;
};

export type ProductDisplayDetails = {
  condition: string;
  designer: null | string;
  fabric: string;
  length: string;
  width: string;
};

const FABRIC_INFERENCE_RULES: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "Kanjeevaram silk", pattern: /\bkanj(?:ee|i)varam\b/i },
  { label: "Banarasi silk", pattern: /\bbanarasi\b/i },
  { label: "Mysore silk", pattern: /\bmysore\s+silk\b/i },
  { label: "Tussar silk", pattern: /\bt[au]ssar\b/i },
  { label: "Chanderi", pattern: /\bchanderi\b/i },
  { label: "Organza", pattern: /\borganza\b/i },
  { label: "Georgette", pattern: /\bgeorgette\b/i },
  { label: "Chiffon", pattern: /\bchiffon\b/i },
  { label: "Crepe", pattern: /\bcrepe\b/i },
  { label: "Linen", pattern: /\blinen\b/i },
  { label: "Cotton", pattern: /\bcotton\b/i },
  { label: "Silk", pattern: /\bsilk\b/i },
  { label: "Bandhani", pattern: /\bbandhani\b/i },
  { label: "Ikat", pattern: /\bikat\b/i },
];

const normalizeDetail = (value?: null | string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const buildSearchText = (product: ProductDisplayDetailSource) =>
  [
    product.name,
    product.storyTitle,
    product.storyNarrative,
    product.storyProvenance,
    ...(product.tags ?? []).map((tag) => tag.name),
  ]
    .map((value) => normalizeDetail(value))
    .filter(Boolean)
    .join(" ");

const inferFabric = (product: ProductDisplayDetailSource) => {
  const explicitFabric = normalizeDetail(product.detailsFabric);
  if (explicitFabric) return explicitFabric;

  const searchText = buildSearchText(product);
  const matchedRule = FABRIC_INFERENCE_RULES.find((rule) =>
    rule.pattern.test(searchText),
  );

  return matchedRule?.label ?? "Heirloom saree";
};

export const getProductDisplayDetails = (
  product: ProductDisplayDetailSource,
): ProductDisplayDetails => ({
  condition:
    normalizeDetail(product.detailsCondition) ?? "Pre-loved, quality checked",
  designer: normalizeDetail(product.detailsDesigner),
  fabric: inferFabric(product),
  length: normalizeDetail(product.detailsLength) ?? "Standard saree drape",
  width: normalizeDetail(product.detailsWidth) ?? "Standard saree width",
});
