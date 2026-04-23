export const PRODUCT_VIEW_MODES = ["cards", "gallery", "list", "compact"] as const;

export type ProductViewMode = (typeof PRODUCT_VIEW_MODES)[number];
