export const DEFAULT_PRODUCT_SORT = "latest" as const;

export const PRODUCT_SORT_OPTIONS = [
  {
    label: "Newest arrivals",
    value: DEFAULT_PRODUCT_SORT,
  },
  {
    label: "Price: Low to High",
    value: "price-low-to-high",
  },
  {
    label: "Price: High to Low",
    value: "price-high-to-low",
  },
] as const;

export type ProductSortOption = (typeof PRODUCT_SORT_OPTIONS)[number]["value"];

export const isProductSortOption = (value: string): value is ProductSortOption =>
  PRODUCT_SORT_OPTIONS.some((option) => option.value === value);

export const parseProductSort = (
  value: string | string[] | undefined
): ProductSortOption => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return DEFAULT_PRODUCT_SORT;
  return isProductSortOption(candidate) ? candidate : DEFAULT_PRODUCT_SORT;
};

export const getProductSortLabel = (sort: ProductSortOption) =>
  PRODUCT_SORT_OPTIONS.find((option) => option.value === sort)?.label ??
  PRODUCT_SORT_OPTIONS[0].label;
