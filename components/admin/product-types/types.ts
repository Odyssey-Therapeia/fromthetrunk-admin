export type ProductTypeFieldType =
  | "text"
  | "textarea"
  | "rich-text"
  | "number"
  | "money-paise"
  | "select"
  | "multi-select"
  | "boolean"
  | "image-ref"
  | "list-of-group"
  | "list-of-text"
  | "conditional";

export type ProductTypeOption = {
  label: string;
  value: string;
};

export type ProductTypeAttributeDef = {
  key: string;
  required: boolean;
  meta: {
    type: ProductTypeFieldType;
    label?: string;
    description?: string;
    helpText?: string;
    placeholder?: string;
    options?: ProductTypeOption[];
    multiple?: boolean;
    itemSchema?: unknown;
    showIf?: unknown;
    [key: string]: unknown;
  };
};

export type ProductTypeRecord = {
  id: string;
  name: string;
  slug: string;
  attributeDefs: ProductTypeAttributeDef[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type ProductTypeFormValues = {
  name: string;
  slug: string;
  attributeDefs: ProductTypeAttributeDef[];
};

export const productTypeFieldTypes: ProductTypeFieldType[] = [
  "text",
  "textarea",
  "rich-text",
  "number",
  "money-paise",
  "select",
  "multi-select",
  "boolean",
  "image-ref",
  "list-of-text",
];

export function slugifyTypeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function keyifyAttributeLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
