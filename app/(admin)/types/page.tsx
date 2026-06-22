import type { Metadata } from "next";

import { ProductTypesManager } from "@/components/admin/product-types/product-types-manager";
import { listProductTypes } from "@/db/queries/product-types";
import type { ProductTypeRecord } from "@/components/admin/product-types/types";

export const metadata: Metadata = {
  title: "Product Types | FTT Admin",
};

export default async function ProductTypesPage() {
  const rows = await listProductTypes();

  const initialTypes: ProductTypeRecord[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    attributeDefs: row.attributeDefs as ProductTypeRecord["attributeDefs"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return <ProductTypesManager initialTypes={initialTypes} />;
}
