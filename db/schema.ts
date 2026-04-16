import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "customer"]);
export const productStatusEnum = pgEnum("product_status", ["draft", "published"]);
export const stockStatusEnum = pgEnum("stock_status", ["available", "reserved", "sold"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);
export const newsletterStatusEnum = pgEnum("newsletter_status", [
  "pending",
  "confirmed",
  "unsubscribed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull().default("customer"),
    name: text("name"),
    image: text("image"),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    defaultAddressId: uuid("default_address_id").references((): AnyPgColumn => addresses.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
    defaultAddressIdx: index("users_default_address_idx").on(table.defaultAddressId),
  })
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    name: text("name"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state"),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull(),
    phone: text("phone"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("addresses_user_idx").on(table.userId),
  })
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    url: text("url").notNull(),
    filename: text("filename").notNull(),
    alt: text("alt"),
    mimeType: text("mime_type"),
    filesize: integer("filesize"),
    width: integer("width"),
    height: integer("height"),
    blurDataUrl: text("blur_data_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyUnique: uniqueIndex("media_assets_key_unique").on(table.key),
  })
);

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    featured: boolean("featured").notNull().default(false),
    heroMediaId: uuid("hero_media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("collections_slug_unique").on(table.slug),
  })
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    collectionId: uuid("collection_id").references(() => collections.id, { onDelete: "set null" }),
    artisanId: uuid("artisan_id"),
    pricePaise: integer("price_paise").notNull(),
    originalPricePaise: integer("original_price_paise"),
    featured: boolean("featured").notNull().default(false),
    status: productStatusEnum("status").notNull().default("draft"),
    stockStatus: stockStatusEnum("stock_status").notNull().default("available"),
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    storyTitle: text("story_title").notNull(),
    storyNarrative: text("story_narrative"),
    storyProvenance: text("story_provenance"),
    storyEra: text("story_era"),
    detailsFabric: text("details_fabric"),
    detailsLength: text("details_length"),
    detailsWidth: text("details_width"),
    detailsCondition: text("details_condition"),
    detailsDesigner: text("details_designer"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("products_slug_unique").on(table.slug),
    collectionIdx: index("products_collection_idx").on(table.collectionId),
    statusIdx: index("products_status_idx").on(table.status),
    stockStatusIdx: index("products_stock_status_idx").on(table.stockStatus),
  })
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    productIdx: index("product_images_product_idx").on(table.productId),
    mediaIdx: index("product_images_media_idx").on(table.mediaId),
  })
);

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("tags_slug_unique").on(table.slug),
    categoryIdx: index("tags_category_idx").on(table.category),
  })
);

export const productTags = pgTable(
  "product_tags",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.productId, table.tagId],
      name: "product_tags_pkey",
    }),
    productIdx: index("product_tags_product_idx").on(table.productId),
    tagIdx: index("product_tags_tag_idx").on(table.tagId),
  })
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.productId],
      name: "wishlist_items_pkey",
    }),
  })
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subtotalPaise: integer("subtotal_paise").notNull(),
    shippingCostPaise: integer("shipping_cost_paise").notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
    taxAmountPaise: integer("tax_amount_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    shippingMethod: text("shipping_method"),
    status: orderStatusEnum("status").notNull().default("pending"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
    paymentGateway: text("payment_gateway"),
    paymentMethod: text("payment_method"),
    paymentId: text("payment_id"),
    razorpayOrderId: text("razorpay_order_id"),
    shippingName: text("shipping_name"),
    shippingLine1: text("shipping_line1"),
    shippingLine2: text("shipping_line2"),
    shippingCity: text("shipping_city"),
    shippingState: text("shipping_state"),
    shippingPostalCode: text("shipping_postal_code"),
    shippingCountry: text("shipping_country"),
    shippingPhone: text("shipping_phone"),
    shippingEmail: text("shipping_email"),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("orders_user_idx").on(table.userId),
    statusIdx: index("orders_status_idx").on(table.status),
    paymentStatusIdx: index("orders_payment_status_idx").on(table.paymentStatus),
    subtotalNonNegative: check(
      "orders_subtotal_paise_non_negative",
      sql`${table.subtotalPaise} >= 0`
    ),
    shippingCostNonNegative: check(
      "orders_shipping_cost_paise_non_negative",
      sql`${table.shippingCostPaise} >= 0`
    ),
    taxRateRange: check(
      "orders_tax_rate_range",
      sql`${table.taxRate} >= 0 and ${table.taxRate} <= 100`
    ),
    taxAmountNonNegative: check(
      "orders_tax_amount_paise_non_negative",
      sql`${table.taxAmountPaise} >= 0`
    ),
    totalNonNegative: check(
      "orders_total_paise_non_negative",
      sql`${table.totalPaise} >= 0`
    ),
  })
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    pricePaise: integer("price_paise").notNull(),
    quantity: integer("quantity").notNull().default(1),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index("order_items_order_idx").on(table.orderId),
    productIdx: index("order_items_product_idx").on(table.productId),
    priceNonNegative: check(
      "order_items_price_paise_non_negative",
      sql`${table.pricePaise} >= 0`
    ),
    quantityPositive: check(
      "order_items_quantity_positive",
      sql`${table.quantity} > 0`
    ),
  })
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull(),
    note: text("note").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index("order_events_order_idx").on(table.orderId),
    statusIdx: index("order_events_status_idx").on(table.status),
  })
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    status: newsletterStatusEnum("status").notNull().default("pending"),
    confirmToken: text("confirm_token"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("newsletter_subscribers_email_unique").on(table.email),
  })
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("oauth"),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    access_token: text("access_token"),
    refresh_token: text("refresh_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerUnique: uniqueIndex("auth_accounts_provider_unique").on(
      table.provider,
      table.providerAccountId
    ),
    userIdx: index("auth_accounts_user_idx").on(table.userId),
  })
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("auth_sessions_user_idx").on(table.userId),
  })
);

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.identifier, table.token],
      name: "auth_verification_tokens_pkey",
    }),
  })
);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    modelId: text("model_id").default("claude-sonnet-4-6"),
    messages: jsonb("messages").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("chat_conversations_user_idx").on(table.userId),
    productIdx: index("chat_conversations_product_idx").on(table.productId),
    productUserIdx: index("chat_conversations_product_user_idx").on(
      table.productId,
      table.userId,
    ),
  }),
);

// TODO: Tune ivfflat `lists` parameter as the product catalog grows (target: lists ≈ sqrt(num_rows)).
export const productEmbeddings = pgTable(
  "product_embeddings",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    model: text("model").notNull().default("text-embedding-3-small"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    embeddingIdx: index("product_embeddings_embedding_idx")
      .using("ivfflat", table.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  })
);

export const siteConfig = pgTable(
  "site_config",
  {
    slug: text("slug").primaryKey(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("site_config_slug_unique").on(table.slug),
  })
);
