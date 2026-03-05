import type { InferSelectModel } from "drizzle-orm";

import type { CollectionWithHeroMedia } from "@/db/queries/collections";
import type { OrderWithRelations } from "@/db/queries/orders";
import type { ProductWithRelations } from "@/db/queries/products";
import type { UserWithDefaultAddress } from "@/db/queries/users";
import { addresses, mediaAssets } from "@/db/schema";

export type Address = InferSelectModel<typeof addresses>;
export type Collection = CollectionWithHeroMedia;
export type MediaAsset = InferSelectModel<typeof mediaAssets>;
export type Order = OrderWithRelations;
export type OrderItem = OrderWithRelations["items"][number];
export type Product = ProductWithRelations;
export type ProductImage = ProductWithRelations["images"][number];
export type StockStatus = ProductWithRelations["stockStatus"];
export type User = UserWithDefaultAddress;
