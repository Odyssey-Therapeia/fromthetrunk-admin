import { randomUUID } from "node:crypto";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Client } from "pg";
import ws from "ws";

import { toPaise } from "../db/money";
import * as schema from "../db/schema";

type GlobalSlug = "collectionPage" | "homePage" | "howItWorksPage" | "ourStoryPage";
type TargetDb = ReturnType<typeof drizzle>;

type MigrationOptions = {
  dryRun: boolean;
  sourceUrl: string;
  targetUrl: string;
  truncateTarget: boolean;
};

type LegacyAddressRow = {
  city: string;
  country: string;
  created_at: Date;
  id: string;
  is_default: boolean | null;
  label: null | string;
  line1: string;
  line2: null | string;
  name: null | string;
  phone: null | string;
  postal_code: string;
  state: null | string;
  updated_at: Date;
  user_id: string;
};

type LegacyAuthAccountRow = {
  access_token: null | string;
  created_at: Date;
  expires_at: null | number | string;
  id: string;
  id_token: null | string;
  provider: string;
  provider_account_id: string;
  refresh_token: null | string;
  scope: null | string;
  session_state: null | string;
  token_type: null | string;
  type: null | string;
  updated_at: Date;
  user_id: string;
};

type LegacyAuthSessionRow = {
  created_at: Date;
  expires: Date;
  session_token: string;
  updated_at: Date;
  user_id: string;
};

type LegacyAuthVerificationTokenRow = {
  created_at: Date;
  expires: Date;
  id: string;
  identifier: string;
  token: string;
  updated_at: Date;
};

type LegacyCollectionRow = {
  created_at: Date;
  description: null | string;
  featured: boolean | null;
  hero_image_id: null | string;
  id: string;
  name: null | string;
  slug: null | string;
  status: null | string;
  updated_at: Date;
};

type LegacyGlobalCollectionPageRow = {
  description: null | string;
  eyebrow: null | string;
  filters_body: null | string;
  filters_title: null | string;
  title: null | string;
};

type LegacyGlobalHomePageRow = {
  featured_body: null | string;
  featured_cta_href: null | string;
  featured_cta_label: null | string;
  featured_eyebrow: null | string;
  featured_title: null | string;
  hero_card_body: null | string;
  hero_card_eyebrow: null | string;
  hero_card_title: null | string;
  hero_eyebrow: null | string;
  hero_image_id: null | string;
  hero_subtitle: null | string;
  hero_title: null | string;
  primary_cta_href: null | string;
  primary_cta_label: null | string;
  secondary_cta_href: null | string;
  secondary_cta_label: null | string;
};

type LegacyGlobalHowItWorksPageRow = {
  description: null | string;
  eyebrow: null | string;
  step_four_body: null | string;
  step_four_title: null | string;
  step_one_body: null | string;
  step_one_title: null | string;
  step_three_body: null | string;
  step_three_title: null | string;
  step_two_body: null | string;
  step_two_title: null | string;
  title: null | string;
};

type LegacyGlobalOurStoryPageRow = {
  card_one_body: null | string;
  card_one_title: null | string;
  card_three_body: null | string;
  card_three_title: null | string;
  card_two_body: null | string;
  card_two_title: null | string;
  hero_eyebrow: null | string;
  hero_image_id: null | string;
  hero_title: null | string;
  section_body: null | string;
  section_title: null | string;
};

type LegacyMediaRow = {
  alt: null | string;
  created_at: Date;
  filename: null | string;
  filesize: null | number | string;
  height: null | number | string;
  id: string;
  mime_type: null | string;
  sizes_card_filename: null | string;
  sizes_card_filesize: null | number | string;
  sizes_card_height: null | number | string;
  sizes_card_mime_type: null | string;
  sizes_card_url: null | string;
  sizes_card_width: null | number | string;
  sizes_thumbnail_filename: null | string;
  sizes_thumbnail_filesize: null | number | string;
  sizes_thumbnail_height: null | number | string;
  sizes_thumbnail_mime_type: null | string;
  sizes_thumbnail_url: null | string;
  sizes_thumbnail_width: null | number | string;
  updated_at: Date;
  url: null | string;
  width: null | number | string;
};

type LegacyNewsletterSubscriberRow = {
  confirm_token: null | string;
  confirmed_at: Date | null;
  created_at: Date;
  email: string;
  id: string;
  status: null | string;
  updated_at: Date;
};

type LegacyOrderItemRow = {
  _order: number | string;
  _parent_id: string;
  id: string;
  image_url: null | string;
  name: string;
  price: number | string;
  product_id: null | string;
  quantity: number | string;
};

type LegacyOrderRow = {
  created_at: Date;
  id: string;
  payment_gateway: null | string;
  payment_id: null | string;
  payment_method: null | string;
  payment_status: null | string;
  placed_at: Date | null;
  razorpay_order_id: null | string;
  shipping_address_city: null | string;
  shipping_address_country: null | string;
  shipping_address_email: null | string;
  shipping_address_line1: null | string;
  shipping_address_line2: null | string;
  shipping_address_name: null | string;
  shipping_address_phone: null | string;
  shipping_address_postal_code: null | string;
  shipping_address_state: null | string;
  shipping_cost: null | number | string;
  shipping_method: null | string;
  status: null | string;
  subtotal: number | string;
  tax_amount: null | number | string;
  tax_rate: null | number | string;
  total: null | number | string;
  updated_at: Date;
  user_id: string;
};

type LegacyProductOccasionRow = {
  order: number;
  parent_id: string;
  value: null | string;
};

type LegacyProductRow = {
  collection_id: null | string;
  created_at: Date;
  details_condition: null | string;
  details_designer: null | string;
  details_fabric: null | string;
  details_length: null | string;
  details_width: null | string;
  featured: boolean | null;
  id: string;
  name: null | string;
  original_price: null | number | string;
  price: null | number | string;
  reserved_until: Date | null;
  slug: null | string;
  sold_at: Date | null;
  status: null | string;
  stock_status: null | string;
  story_era: null | string;
  story_narrative: null | string;
  story_provenance: null | string;
  story_title: null | string;
  updated_at: Date;
};

type LegacyProductRelRow = {
  media_id: null | string;
  order: number | null;
  parent_id: string;
  path: string;
};

type LegacyUserRelRow = {
  addresses_id: null | string;
  order: number | null;
  parent_id: string;
  path: string;
  products_id: null | string;
};

type LegacyUserRow = {
  created_at: Date;
  default_address_id: null | string;
  email: string;
  email_verified: Date | null;
  hash: null | string;
  id: string;
  image: null | string;
  name: null | string;
  phone: null | string;
  role: null | string;
  updated_at: Date;
};

type SourceData = {
  addresses: LegacyAddressRow[];
  authAccounts: LegacyAuthAccountRow[];
  authSessions: LegacyAuthSessionRow[];
  authVerificationTokens: LegacyAuthVerificationTokenRow[];
  collections: LegacyCollectionRow[];
  globals: Record<GlobalSlug, Record<string, unknown>>;
  media: LegacyMediaRow[];
  newsletterSubscribers: LegacyNewsletterSubscriberRow[];
  orderItems: LegacyOrderItemRow[];
  orders: LegacyOrderRow[];
  productOccasions: LegacyProductOccasionRow[];
  productRels: LegacyProductRelRow[];
  products: LegacyProductRow[];
  userRels: LegacyUserRelRow[];
  users: LegacyUserRow[];
};

const parseOptions = (): MigrationOptions => {
  const args = new Set(process.argv.slice(2));

  const sourceUrl =
    process.env.LEGACY_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
  const targetUrl =
    process.env.CUSTOM_DATABASE_URL?.trim() ||
    process.env.TARGET_DATABASE_URL?.trim() ||
    "";

  if (!sourceUrl) {
    throw new Error(
      "Missing source database URL. Set LEGACY_DATABASE_URL (or DATABASE_URL) before running."
    );
  }

  if (!targetUrl) {
    throw new Error(
      "Missing target database URL. Set CUSTOM_DATABASE_URL (or TARGET_DATABASE_URL) before running."
    );
  }

  if (sourceUrl === targetUrl) {
    throw new Error("Source and target database URLs are identical. Aborting migration.");
  }

  return {
    dryRun: args.has("--dry-run"),
    sourceUrl,
    targetUrl,
    truncateTarget: args.has("--truncate-target"),
  };
};

const isUuid = (value: null | string | undefined) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const parseNumber = (value: null | number | string | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeProductStatus = (value: null | string | undefined): "draft" | "published" =>
  value === "draft" ? "draft" : "published";

const normalizeStockStatus = (
  value: null | string | undefined
): "available" | "reserved" | "sold" => {
  if (value === "reserved") return "reserved";
  if (value === "sold") return "sold";
  return "available";
};

const normalizeOrderStatus = (
  value: null | string | undefined
): "confirmed" | "delivered" | "pending" | "shipped" => {
  if (value === "confirmed" || value === "delivered" || value === "shipped") {
    return value;
  }
  return "pending";
};

const normalizePaymentStatus = (
  value: null | string | undefined
): "failed" | "paid" | "pending" | "refunded" => {
  if (value === "failed" || value === "paid" || value === "refunded") {
    return value;
  }
  return "pending";
};

const normalizeNewsletterStatus = (
  value: null | string | undefined
): "confirmed" | "pending" | "unsubscribed" => {
  if (value === "confirmed" || value === "unsubscribed") {
    return value;
  }
  return "pending";
};

const capitalize = (value: string) =>
  value
    .trim()
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const OCCASION_MAP = new Map<string, string>([
  ["bridal", "bridal"],
  ["cocktail", "cocktail"],
  ["collectible", "heritage"],
  ["day wedding", "wedding"],
  ["engagement", "festive"],
  ["evening", "evening"],
  ["festive", "festive"],
  ["gala", "evening"],
  ["haldi", "festive"],
  ["heritage", "heritage"],
  ["mehendi", "festive"],
  ["office", "soiree"],
  ["party", "soiree"],
  ["reception", "reception"],
  ["sangeet", "festive"],
  ["soirée", "soiree"],
  ["soiree", "soiree"],
  ["temple", "heritage"],
  ["wedding", "wedding"],
]);

const normalizeOccasion = (value: null | string) => {
  if (!value) return null;
  return OCCASION_MAP.get(value.trim().toLowerCase()) ?? null;
};

const buildLegacyMediaKey = (media: LegacyMediaRow) => {
  const fallbackName = media.filename || "asset";
  let pathSegment = fallbackName;

  if (media.url) {
    try {
      const url = new URL(media.url, "https://legacy.fromthetrunk.local");
      const path = url.pathname.replace(/^\/+/, "");
      if (path) {
        pathSegment = path;
      }
    } catch {
      // keep fallback below
    }
  }

  return `legacy/${media.id}/${pathSegment}`;
};

const countRows = async (targetDb: TargetDb, tableName: string) => {
  const result = await targetDb.execute<{ count: number }>(
    sql.raw(`SELECT count(*)::int AS count FROM "${tableName}"`)
  );
  return result.rows[0]?.count ?? 0;
};

const ensureTargetCollections = async (targetDb: TargetDb, options: MigrationOptions) => {
  if (!options.truncateTarget) return;

  await targetDb.execute(sql`
    TRUNCATE TABLE
      product_tags,
      product_images,
      wishlist_items,
      order_items,
      order_events,
      orders,
      products,
      tags,
      auth_accounts,
      auth_sessions,
      auth_verification_tokens,
      newsletter_subscribers,
      addresses,
      collections,
      media_assets,
      site_config,
      users
    RESTART IDENTITY CASCADE;
  `);
};

const loadGlobals = async (source: Client): Promise<Record<GlobalSlug, Record<string, unknown>>> => {
  const homePage = await source.query<LegacyGlobalHomePageRow>(`
    SELECT
      hero_eyebrow,
      hero_title,
      hero_subtitle,
      hero_image_id::text,
      primary_cta_label,
      primary_cta_href,
      secondary_cta_label,
      secondary_cta_href,
      hero_card_eyebrow,
      hero_card_title,
      hero_card_body,
      featured_eyebrow,
      featured_title,
      featured_body,
      featured_cta_label,
      featured_cta_href
    FROM home_page
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `);

  const collectionPage = await source.query<LegacyGlobalCollectionPageRow>(`
    SELECT eyebrow, title, description, filters_title, filters_body
    FROM collection_page
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `);

  const ourStoryPage = await source.query<LegacyGlobalOurStoryPageRow>(`
    SELECT
      hero_eyebrow,
      hero_title,
      hero_image_id::text,
      section_title,
      section_body,
      card_one_title,
      card_one_body,
      card_two_title,
      card_two_body,
      card_three_title,
      card_three_body
    FROM our_story_page
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `);

  const howItWorksPage = await source.query<LegacyGlobalHowItWorksPageRow>(`
    SELECT
      eyebrow,
      title,
      description,
      step_one_title,
      step_one_body,
      step_two_title,
      step_two_body,
      step_three_title,
      step_three_body,
      step_four_title,
      step_four_body
    FROM how_it_works_page
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `);

  const home = homePage.rows[0];
  const collection = collectionPage.rows[0];
  const story = ourStoryPage.rows[0];
  const how = howItWorksPage.rows[0];

  return {
    collectionPage: {
      description: collection?.description ?? null,
      eyebrow: collection?.eyebrow ?? null,
      filtersBody: collection?.filters_body ?? null,
      filtersTitle: collection?.filters_title ?? null,
      title: collection?.title ?? null,
    },
    homePage: {
      featuredBody: home?.featured_body ?? null,
      featuredCtaHref: home?.featured_cta_href ?? null,
      featuredCtaLabel: home?.featured_cta_label ?? null,
      featuredEyebrow: home?.featured_eyebrow ?? null,
      featuredTitle: home?.featured_title ?? null,
      heroCardBody: home?.hero_card_body ?? null,
      heroCardEyebrow: home?.hero_card_eyebrow ?? null,
      heroCardTitle: home?.hero_card_title ?? null,
      heroEyebrow: home?.hero_eyebrow ?? null,
      heroImage: home?.hero_image_id ?? null,
      heroSubtitle: home?.hero_subtitle ?? null,
      heroTitle: home?.hero_title ?? null,
      primaryCtaHref: home?.primary_cta_href ?? null,
      primaryCtaLabel: home?.primary_cta_label ?? null,
      secondaryCtaHref: home?.secondary_cta_href ?? null,
      secondaryCtaLabel: home?.secondary_cta_label ?? null,
    },
    howItWorksPage: {
      description: how?.description ?? null,
      eyebrow: how?.eyebrow ?? null,
      stepFourBody: how?.step_four_body ?? null,
      stepFourTitle: how?.step_four_title ?? null,
      stepOneBody: how?.step_one_body ?? null,
      stepOneTitle: how?.step_one_title ?? null,
      stepThreeBody: how?.step_three_body ?? null,
      stepThreeTitle: how?.step_three_title ?? null,
      stepTwoBody: how?.step_two_body ?? null,
      stepTwoTitle: how?.step_two_title ?? null,
      title: how?.title ?? null,
    },
    ourStoryPage: {
      cardOneBody: story?.card_one_body ?? null,
      cardOneTitle: story?.card_one_title ?? null,
      cardThreeBody: story?.card_three_body ?? null,
      cardThreeTitle: story?.card_three_title ?? null,
      cardTwoBody: story?.card_two_body ?? null,
      cardTwoTitle: story?.card_two_title ?? null,
      heroEyebrow: story?.hero_eyebrow ?? null,
      heroImage: story?.hero_image_id ?? null,
      heroTitle: story?.hero_title ?? null,
      sectionBody: story?.section_body ?? null,
      sectionTitle: story?.section_title ?? null,
    },
  };
};

const loadSourceData = async (source: Client): Promise<SourceData> => {
  const users = await source.query<LegacyUserRow>(`
      SELECT
        id::text,
        email,
        role::text AS role,
        name,
        image,
        phone,
        email_verified,
        default_address_id::text,
        created_at,
        updated_at,
        hash
      FROM users
    `);

  const userRels = await source.query<LegacyUserRelRow>(`
      SELECT
        parent_id::text,
        path,
        addresses_id::text,
        products_id::text,
        "order"
      FROM users_rels
      ORDER BY parent_id, "order"
    `);

  const addresses = await source.query<LegacyAddressRow>(`
      SELECT
        id::text,
        user_id::text,
        label,
        name,
        line1,
        line2,
        city,
        state,
        postal_code,
        country,
        phone,
        is_default,
        created_at,
        updated_at
      FROM addresses
    `);

  const collections = await source.query<LegacyCollectionRow>(`
      SELECT
        id::text,
        name,
        slug,
        description,
        featured,
        hero_image_id::text,
        created_at,
        updated_at,
        _status::text AS status
      FROM collections
    `);

  const media = await source.query<LegacyMediaRow>(`
      SELECT
        id::text,
        alt,
        url,
        filename,
        mime_type,
        filesize,
        width,
        height,
        sizes_thumbnail_url,
        sizes_thumbnail_width,
        sizes_thumbnail_height,
        sizes_thumbnail_mime_type,
        sizes_thumbnail_filesize,
        sizes_thumbnail_filename,
        sizes_card_url,
        sizes_card_width,
        sizes_card_height,
        sizes_card_mime_type,
        sizes_card_filesize,
        sizes_card_filename,
        created_at,
        updated_at
      FROM media
    `);

  const products = await source.query<LegacyProductRow>(`
      SELECT
        id::text,
        name,
        slug,
        price,
        original_price,
        featured,
        collection_id::text,
        status::text,
        stock_status::text,
        reserved_until,
        sold_at,
        story_title,
        story_narrative,
        story_provenance,
        story_era,
        details_fabric,
        details_length,
        details_width,
        details_condition,
        details_designer,
        created_at,
        updated_at
      FROM products
    `);

  const productRels = await source.query<LegacyProductRelRow>(`
      SELECT
        parent_id::text,
        path,
        media_id::text,
        "order"
      FROM products_rels
      WHERE path = 'images'
      ORDER BY parent_id, "order"
    `);

  const productOccasions = await source.query<LegacyProductOccasionRow>(`
      SELECT parent_id::text, value::text, "order"
      FROM products_details_occasion
      ORDER BY parent_id, "order"
    `);

  const orders = await source.query<LegacyOrderRow>(`
      SELECT
        id::text,
        user_id::text,
        subtotal,
        shipping_cost,
        tax_rate,
        tax_amount,
        total,
        shipping_method::text,
        status::text,
        payment_status::text,
        payment_gateway,
        payment_method,
        payment_id,
        razorpay_order_id,
        shipping_address_name,
        shipping_address_line1,
        shipping_address_line2,
        shipping_address_city,
        shipping_address_state,
        shipping_address_postal_code,
        shipping_address_country,
        shipping_address_phone,
        shipping_address_email,
        placed_at,
        created_at,
        updated_at
      FROM orders
    `);

  const orderItems = await source.query<LegacyOrderItemRow>(`
      SELECT
        _parent_id::text,
        _order,
        id,
        product_id::text,
        name,
        price,
        quantity,
        image_url
      FROM orders_items
      ORDER BY _parent_id, _order
    `);

  const newsletterSubscribers = await source.query<LegacyNewsletterSubscriberRow>(`
      SELECT
        id::text,
        email,
        status::text,
        confirm_token,
        confirmed_at,
        created_at,
        updated_at
      FROM newsletter_subscribers
    `);

  const authAccounts = await source.query<LegacyAuthAccountRow>(`
      SELECT
        id::text,
        user_id::text,
        type,
        provider,
        provider_account_id,
        access_token,
        refresh_token,
        expires_at,
        token_type,
        scope,
        id_token,
        session_state,
        created_at,
        updated_at
      FROM auth_accounts
    `);

  const authSessions = await source.query<LegacyAuthSessionRow>(`
      SELECT
        session_token,
        user_id::text,
        expires,
        created_at,
        updated_at
      FROM auth_sessions
    `);

  const authVerificationTokens = await source.query<LegacyAuthVerificationTokenRow>(`
      SELECT
        id::text,
        identifier,
        token,
        expires,
        created_at,
        updated_at
      FROM auth_verification_tokens
    `);

  const globals = await loadGlobals(source);

  return {
    addresses: addresses.rows,
    authAccounts: authAccounts.rows,
    authSessions: authSessions.rows,
    authVerificationTokens: authVerificationTokens.rows,
    collections: collections.rows,
    globals,
    media: media.rows,
    newsletterSubscribers: newsletterSubscribers.rows,
    orderItems: orderItems.rows,
    orders: orders.rows,
    productOccasions: productOccasions.rows,
    productRels: productRels.rows,
    products: products.rows,
    userRels: userRels.rows,
    users: users.rows,
  };
};

const run = async () => {
  const options = parseOptions();

  console.log(
    `[migration] source=${options.sourceUrl.slice(0, 32)}... target=${options.targetUrl.slice(0, 32)}... dryRun=${options.dryRun} truncateTarget=${options.truncateTarget}`
  );

  const source = new Client({ connectionString: options.sourceUrl });
  await source.connect();

  if (typeof window === "undefined") {
    neonConfig.webSocketConstructor = ws;
  }

  const targetPool = new Pool({ connectionString: options.targetUrl });
  const targetDb = drizzle(targetPool, { schema });

  try {
    const sourceData = await loadSourceData(source);

    console.log(
      `[migration] fetched source rows: users=${sourceData.users.length}, addresses=${sourceData.addresses.length}, collections=${sourceData.collections.length}, media=${sourceData.media.length}, products=${sourceData.products.length}, productImages=${sourceData.productRels.length}, productOccasions=${sourceData.productOccasions.length}, orders=${sourceData.orders.length}, orderItems=${sourceData.orderItems.length}, newsletter=${sourceData.newsletterSubscribers.length}, authAccounts=${sourceData.authAccounts.length}, authSessions=${sourceData.authSessions.length}, authVerificationTokens=${sourceData.authVerificationTokens.length}`
    );

    if (options.dryRun) {
      return;
    }

    await ensureTargetCollections(targetDb, options);

    const mediaIds = new Set<string>();
    for (const media of sourceData.media) {
      if (!isUuid(media.id)) continue;
      mediaIds.add(media.id);

      const metadata: Record<string, unknown> = {
        legacySource: "payload",
        originalUrl: media.url ?? null,
        sizes: {
          card: {
            filename: media.sizes_card_filename ?? null,
            filesize: parseNumber(media.sizes_card_filesize),
            height: parseNumber(media.sizes_card_height),
            mimeType: media.sizes_card_mime_type ?? null,
            url: media.sizes_card_url ?? null,
            width: parseNumber(media.sizes_card_width),
          },
          thumbnail: {
            filename: media.sizes_thumbnail_filename ?? null,
            filesize: parseNumber(media.sizes_thumbnail_filesize),
            height: parseNumber(media.sizes_thumbnail_height),
            mimeType: media.sizes_thumbnail_mime_type ?? null,
            url: media.sizes_thumbnail_url ?? null,
            width: parseNumber(media.sizes_thumbnail_width),
          },
        },
      };

      await targetDb
        .insert(schema.mediaAssets)
        .values({
          alt: media.alt ?? null,
          blurDataUrl: null,
          createdAt: media.created_at,
          filename: media.filename || `${media.id}.asset`,
          filesize: parseNumber(media.filesize),
          height: parseNumber(media.height),
          id: media.id,
          key: buildLegacyMediaKey(media),
          metadata,
          mimeType: media.mime_type ?? null,
          updatedAt: media.updated_at,
          url: media.url ?? "",
          width: parseNumber(media.width),
        })
        .onConflictDoUpdate({
          set: {
            alt: media.alt ?? null,
            filename: media.filename || `${media.id}.asset`,
            filesize: parseNumber(media.filesize),
            height: parseNumber(media.height),
            key: buildLegacyMediaKey(media),
            metadata,
            mimeType: media.mime_type ?? null,
            updatedAt: media.updated_at,
            url: media.url ?? "",
            width: parseNumber(media.width),
          },
          target: schema.mediaAssets.id,
        });
    }

    const collectionIds = new Set<string>();
    for (const collection of sourceData.collections) {
      if (!isUuid(collection.id)) continue;
      if (!collection.name || !collection.slug) continue;
      collectionIds.add(collection.id);

      await targetDb
        .insert(schema.collections)
        .values({
          createdAt: collection.created_at,
          description: collection.description ?? null,
          featured: Boolean(collection.featured),
          heroMediaId:
            collection.hero_image_id && mediaIds.has(collection.hero_image_id)
              ? collection.hero_image_id
              : null,
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          updatedAt: collection.updated_at,
        })
        .onConflictDoUpdate({
          set: {
            description: collection.description ?? null,
            featured: Boolean(collection.featured),
            heroMediaId:
              collection.hero_image_id && mediaIds.has(collection.hero_image_id)
                ? collection.hero_image_id
                : null,
            name: collection.name,
            slug: collection.slug,
            updatedAt: collection.updated_at,
          },
          target: schema.collections.id,
        });
    }

    const userIds = new Set<string>();
    for (const user of sourceData.users) {
      if (!isUuid(user.id)) continue;
      userIds.add(user.id);

      await targetDb
        .insert(schema.users)
        .values({
          createdAt: user.created_at,
          defaultAddressId: null,
          email: user.email,
          emailVerified: user.email_verified,
          id: user.id,
          image: user.image ?? null,
          metadata: null,
          name: user.name ?? null,
          passwordHash: user.hash ?? null,
          phone: user.phone ?? null,
          role: user.role === "admin" ? "admin" : "customer",
          updatedAt: user.updated_at,
        })
        .onConflictDoUpdate({
          set: {
            email: user.email,
            emailVerified: user.email_verified,
            image: user.image ?? null,
            name: user.name ?? null,
            passwordHash: user.hash ?? null,
            phone: user.phone ?? null,
            role: user.role === "admin" ? "admin" : "customer",
            updatedAt: user.updated_at,
          },
          target: schema.users.id,
        });
    }

    const addressIds = new Set<string>();
    for (const address of sourceData.addresses) {
      if (!isUuid(address.id) || !isUuid(address.user_id) || !userIds.has(address.user_id)) {
        continue;
      }
      addressIds.add(address.id);

      await targetDb
        .insert(schema.addresses)
        .values({
          city: address.city,
          country: address.country,
          createdAt: address.created_at,
          id: address.id,
          isDefault: Boolean(address.is_default),
          label: address.label ?? null,
          line1: address.line1,
          line2: address.line2 ?? null,
          name: address.name ?? null,
          phone: address.phone ?? null,
          postalCode: address.postal_code,
          state: address.state ?? null,
          updatedAt: address.updated_at,
          userId: address.user_id,
        })
        .onConflictDoUpdate({
          set: {
            city: address.city,
            country: address.country,
            isDefault: Boolean(address.is_default),
            label: address.label ?? null,
            line1: address.line1,
            line2: address.line2 ?? null,
            name: address.name ?? null,
            phone: address.phone ?? null,
            postalCode: address.postal_code,
            state: address.state ?? null,
            updatedAt: address.updated_at,
            userId: address.user_id,
          },
          target: schema.addresses.id,
        });
    }

    for (const user of sourceData.users) {
      if (!isUuid(user.id)) continue;
      if (!user.default_address_id || !addressIds.has(user.default_address_id)) continue;

      await targetDb
        .update(schema.users)
        .set({ defaultAddressId: user.default_address_id })
        .where(eq(schema.users.id, user.id));
    }

    const productIds = new Set<string>();
    for (const product of sourceData.products) {
      if (!isUuid(product.id)) continue;
      const name = product.name?.trim() || `Legacy Product ${product.id.slice(0, 8)}`;
      const slug =
        product.slug?.trim() || toSlug(`${name}-${product.id.slice(0, 8)}`) || product.id;

      productIds.add(product.id);

      const collectionId =
        product.collection_id && collectionIds.has(product.collection_id)
          ? product.collection_id
          : null;

      await targetDb
        .insert(schema.products)
        .values({
          artisanId: null,
          collectionId,
          createdAt: product.created_at,
          detailsCondition: product.details_condition ?? null,
          detailsDesigner: product.details_designer ?? null,
          detailsFabric: product.details_fabric ?? null,
          detailsLength: product.details_length ?? null,
          detailsWidth: product.details_width ?? null,
          featured: Boolean(product.featured),
          id: product.id,
          metadata: { legacySource: "payload" },
          name,
          originalPricePaise:
            parseNumber(product.original_price) !== null
              ? toPaise(parseNumber(product.original_price) as number)
              : null,
          pricePaise: toPaise(parseNumber(product.price) ?? 0),
          reservedUntil: product.reserved_until,
          slug,
          soldAt: product.sold_at,
          status: normalizeProductStatus(product.status),
          stockStatus: normalizeStockStatus(product.stock_status),
          storyEra: product.story_era ?? null,
          storyNarrative: product.story_narrative ?? null,
          storyProvenance: product.story_provenance ?? null,
          storyTitle: product.story_title ?? name,
          updatedAt: product.updated_at,
        })
        .onConflictDoUpdate({
          set: {
            collectionId,
            detailsCondition: product.details_condition ?? null,
            detailsDesigner: product.details_designer ?? null,
            detailsFabric: product.details_fabric ?? null,
            detailsLength: product.details_length ?? null,
            detailsWidth: product.details_width ?? null,
            featured: Boolean(product.featured),
            metadata: { legacySource: "payload" },
            name,
            originalPricePaise:
              parseNumber(product.original_price) !== null
                ? toPaise(parseNumber(product.original_price) as number)
                : null,
            pricePaise: toPaise(parseNumber(product.price) ?? 0),
            reservedUntil: product.reserved_until,
            slug,
            soldAt: product.sold_at,
            status: normalizeProductStatus(product.status),
            stockStatus: normalizeStockStatus(product.stock_status),
            storyEra: product.story_era ?? null,
            storyNarrative: product.story_narrative ?? null,
            storyProvenance: product.story_provenance ?? null,
            storyTitle: product.story_title ?? name,
            updatedAt: product.updated_at,
          },
          target: schema.products.id,
        });
    }

    const imagesByProduct = new Map<string, LegacyProductRelRow[]>();
    for (const relation of sourceData.productRels) {
      if (!relation.media_id || !mediaIds.has(relation.media_id)) continue;
      if (!relation.parent_id || !productIds.has(relation.parent_id)) continue;

      const existing = imagesByProduct.get(relation.parent_id) ?? [];
      existing.push(relation);
      imagesByProduct.set(relation.parent_id, existing);
    }

    for (const [productId, relations] of imagesByProduct) {
      await targetDb
        .delete(schema.productImages)
        .where(eq(schema.productImages.productId, productId));

      const ordered = [...relations].sort(
        (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)
      );

      for (let index = 0; index < ordered.length; index += 1) {
        const relation = ordered[index];
        if (!relation.media_id) continue;

        await targetDb.insert(schema.productImages).values({
          createdAt: new Date(),
          id: randomUUID(),
          mediaId: relation.media_id,
          productId,
          sortOrder: index,
        });
      }
    }

    const occasionValuesByProduct = new Map<string, string[]>();
    for (const row of sourceData.productOccasions) {
      if (!row.parent_id || !productIds.has(row.parent_id)) continue;
      const occasion = normalizeOccasion(row.value);
      if (!occasion) continue;

      const existing = occasionValuesByProduct.get(row.parent_id) ?? [];
      if (!existing.includes(occasion)) {
        existing.push(occasion);
      }
      occasionValuesByProduct.set(row.parent_id, existing);
    }

    const allOccasionSlugs = Array.from(
      new Set(Array.from(occasionValuesByProduct.values()).flatMap((items) => items))
    );

    if (allOccasionSlugs.length > 0) {
      for (const slug of allOccasionSlugs) {
        await targetDb
          .insert(schema.tags)
          .values({
            category: "occasion",
            name: capitalize(slug),
            slug,
          })
          .onConflictDoUpdate({
            set: {
              category: "occasion",
              name: capitalize(slug),
            },
            target: schema.tags.slug,
          });
      }

      const tagRows = await targetDb
        .select({
          id: schema.tags.id,
          slug: schema.tags.slug,
        })
        .from(schema.tags)
        .where(inArray(schema.tags.slug, allOccasionSlugs));

      const tagIdBySlug = new Map(tagRows.map((row) => [row.slug, row.id]));

      for (const [productId, occasions] of occasionValuesByProduct) {
        await targetDb
          .delete(schema.productTags)
          .where(eq(schema.productTags.productId, productId));

        for (const occasion of occasions) {
          const tagId = tagIdBySlug.get(occasion);
          if (!tagId) continue;

          await targetDb
            .insert(schema.productTags)
            .values({
              productId,
              tagId,
            })
            .onConflictDoNothing();
        }
      }
    }

    const wishlistRels = sourceData.userRels.filter((rel) => rel.path === "wishlist");
    for (const rel of wishlistRels) {
      if (!rel.products_id || !productIds.has(rel.products_id)) continue;
      if (!rel.parent_id || !userIds.has(rel.parent_id)) continue;

      await targetDb
        .insert(schema.wishlistItems)
        .values({
          productId: rel.products_id,
          userId: rel.parent_id,
        })
        .onConflictDoNothing();
    }

    const orderIds = new Set<string>();
    for (const order of sourceData.orders) {
      if (!isUuid(order.id) || !isUuid(order.user_id) || !userIds.has(order.user_id)) continue;
      orderIds.add(order.id);

      const subtotal = parseNumber(order.subtotal) ?? 0;
      const shippingCost = parseNumber(order.shipping_cost) ?? 0;
      const taxRate = parseNumber(order.tax_rate) ?? 0.12;
      const taxAmount = parseNumber(order.tax_amount) ?? 0;
      const total = parseNumber(order.total) ?? subtotal;

      await targetDb
        .insert(schema.orders)
        .values({
          createdAt: order.created_at,
          id: order.id,
          paymentGateway: order.payment_gateway ?? null,
          paymentId: order.payment_id ?? null,
          paymentMethod: order.payment_method ?? null,
          paymentStatus: normalizePaymentStatus(order.payment_status),
          placedAt: order.placed_at ?? order.created_at,
          razorpayOrderId: order.razorpay_order_id ?? null,
          shippingCity: order.shipping_address_city ?? null,
          shippingCostPaise: toPaise(shippingCost),
          shippingCountry: order.shipping_address_country ?? null,
          shippingEmail: order.shipping_address_email ?? null,
          shippingLine1: order.shipping_address_line1 ?? null,
          shippingLine2: order.shipping_address_line2 ?? null,
          shippingMethod: order.shipping_method ?? null,
          shippingName: order.shipping_address_name ?? null,
          shippingPhone: order.shipping_address_phone ?? null,
          shippingPostalCode: order.shipping_address_postal_code ?? null,
          shippingState: order.shipping_address_state ?? null,
          status: normalizeOrderStatus(order.status),
          subtotalPaise: toPaise(subtotal),
          taxAmountPaise: toPaise(taxAmount),
          taxRate: String(taxRate),
          totalPaise: toPaise(total),
          updatedAt: order.updated_at,
          userId: order.user_id,
        })
        .onConflictDoUpdate({
          set: {
            paymentGateway: order.payment_gateway ?? null,
            paymentId: order.payment_id ?? null,
            paymentMethod: order.payment_method ?? null,
            paymentStatus: normalizePaymentStatus(order.payment_status),
            placedAt: order.placed_at ?? order.created_at,
            razorpayOrderId: order.razorpay_order_id ?? null,
            shippingCity: order.shipping_address_city ?? null,
            shippingCostPaise: toPaise(shippingCost),
            shippingCountry: order.shipping_address_country ?? null,
            shippingEmail: order.shipping_address_email ?? null,
            shippingLine1: order.shipping_address_line1 ?? null,
            shippingLine2: order.shipping_address_line2 ?? null,
            shippingMethod: order.shipping_method ?? null,
            shippingName: order.shipping_address_name ?? null,
            shippingPhone: order.shipping_address_phone ?? null,
            shippingPostalCode: order.shipping_address_postal_code ?? null,
            shippingState: order.shipping_address_state ?? null,
            status: normalizeOrderStatus(order.status),
            subtotalPaise: toPaise(subtotal),
            taxAmountPaise: toPaise(taxAmount),
            taxRate: String(taxRate),
            totalPaise: toPaise(total),
            updatedAt: order.updated_at,
            userId: order.user_id,
          },
          target: schema.orders.id,
        });
    }

    const orderItemsByOrder = new Map<string, LegacyOrderItemRow[]>();
    for (const item of sourceData.orderItems) {
      if (!item._parent_id || !orderIds.has(item._parent_id)) continue;
      const existing = orderItemsByOrder.get(item._parent_id) ?? [];
      existing.push(item);
      orderItemsByOrder.set(item._parent_id, existing);
    }

    for (const [orderId, items] of orderItemsByOrder) {
      await targetDb
        .delete(schema.orderItems)
        .where(eq(schema.orderItems.orderId, orderId));

      for (const item of items) {
        const productId =
          item.product_id && productIds.has(item.product_id) ? item.product_id : null;
        const price = parseNumber(item.price) ?? 0;
        const quantity = parseNumber(item.quantity) ?? 1;
        const itemId = isUuid(item.id) ? item.id : randomUUID();

        await targetDb.insert(schema.orderItems).values({
          createdAt: new Date(),
          id: itemId,
          imageUrl: item.image_url ?? null,
          name: item.name,
          orderId,
          pricePaise: toPaise(price),
          productId,
          quantity: Math.max(1, Math.round(quantity)),
        });
      }
    }

    for (const order of sourceData.orders) {
      if (!orderIds.has(order.id)) continue;
      const already = await targetDb
        .select({ id: schema.orderEvents.id })
        .from(schema.orderEvents)
        .where(
          and(
            eq(schema.orderEvents.orderId, order.id),
            eq(schema.orderEvents.note, "Migrated from legacy Payload order")
          )
        );

      if (already.length > 0) continue;

      await targetDb.insert(schema.orderEvents).values({
        createdAt: order.updated_at,
        id: randomUUID(),
        note: "Migrated from legacy Payload order",
        orderId: order.id,
        payload: {
          legacyOrderId: order.id,
          migratedAt: new Date().toISOString(),
        },
        status: normalizeOrderStatus(order.status),
      });
    }

    for (const subscriber of sourceData.newsletterSubscribers) {
      if (!isUuid(subscriber.id)) continue;

      await targetDb
        .insert(schema.newsletterSubscribers)
        .values({
          confirmToken: subscriber.confirm_token ?? null,
          confirmedAt: subscriber.confirmed_at ?? null,
          createdAt: subscriber.created_at,
          email: subscriber.email.toLowerCase(),
          id: subscriber.id,
          status: normalizeNewsletterStatus(subscriber.status),
          updatedAt: subscriber.updated_at,
        })
        .onConflictDoUpdate({
          set: {
            confirmToken: subscriber.confirm_token ?? null,
            confirmedAt: subscriber.confirmed_at ?? null,
            email: subscriber.email.toLowerCase(),
            status: normalizeNewsletterStatus(subscriber.status),
            updatedAt: subscriber.updated_at,
          },
          target: schema.newsletterSubscribers.id,
        });
    }

    for (const account of sourceData.authAccounts) {
      if (!isUuid(account.id) || !isUuid(account.user_id) || !userIds.has(account.user_id)) {
        continue;
      }

      await targetDb
        .insert(schema.authAccounts)
        .values({
          access_token: account.access_token ?? null,
          createdAt: account.created_at,
          expires_at:
            parseNumber(account.expires_at) !== null
              ? Math.round(parseNumber(account.expires_at) as number)
              : null,
          id: account.id,
          id_token: account.id_token ?? null,
          provider: account.provider,
          providerAccountId: account.provider_account_id,
          refresh_token: account.refresh_token ?? null,
          scope: account.scope ?? null,
          session_state: account.session_state ?? null,
          token_type: account.token_type ?? null,
          type: account.type ?? "oauth",
          updatedAt: account.updated_at,
          userId: account.user_id,
        })
        .onConflictDoUpdate({
          set: {
            access_token: account.access_token ?? null,
            expires_at:
              parseNumber(account.expires_at) !== null
                ? Math.round(parseNumber(account.expires_at) as number)
                : null,
            id_token: account.id_token ?? null,
            provider: account.provider,
            providerAccountId: account.provider_account_id,
            refresh_token: account.refresh_token ?? null,
            scope: account.scope ?? null,
            session_state: account.session_state ?? null,
            token_type: account.token_type ?? null,
            type: account.type ?? "oauth",
            updatedAt: account.updated_at,
            userId: account.user_id,
          },
          target: schema.authAccounts.id,
        });
    }

    for (const session of sourceData.authSessions) {
      if (!session.session_token || !isUuid(session.user_id) || !userIds.has(session.user_id)) {
        continue;
      }

      await targetDb
        .insert(schema.authSessions)
        .values({
          createdAt: session.created_at,
          expires: session.expires,
          sessionToken: session.session_token,
          userId: session.user_id,
        })
        .onConflictDoUpdate({
          set: {
            expires: session.expires,
            userId: session.user_id,
          },
          target: schema.authSessions.sessionToken,
        });
    }

    for (const token of sourceData.authVerificationTokens) {
      if (!token.identifier || !token.token) continue;

      await targetDb
        .insert(schema.authVerificationTokens)
        .values({
          createdAt: token.created_at,
          expires: token.expires,
          identifier: token.identifier,
          token: token.token,
        })
        .onConflictDoUpdate({
          set: {
            expires: token.expires,
          },
          target: [schema.authVerificationTokens.identifier, schema.authVerificationTokens.token],
        });
    }

    for (const [slug, content] of Object.entries(sourceData.globals) as [
      GlobalSlug,
      Record<string, unknown>,
    ][]) {
      await targetDb
        .insert(schema.siteConfig)
        .values({
          content,
          slug,
        })
        .onConflictDoUpdate({
          set: {
            content,
            updatedAt: new Date(),
          },
          target: schema.siteConfig.slug,
        });
    }

    const summary = {
      addresses: await countRows(targetDb, "addresses"),
      authAccounts: await countRows(targetDb, "auth_accounts"),
      authSessions: await countRows(targetDb, "auth_sessions"),
      authVerificationTokens: await countRows(targetDb, "auth_verification_tokens"),
      collections: await countRows(targetDb, "collections"),
      mediaAssets: await countRows(targetDb, "media_assets"),
      newsletterSubscribers: await countRows(targetDb, "newsletter_subscribers"),
      orderEvents: await countRows(targetDb, "order_events"),
      orderItems: await countRows(targetDb, "order_items"),
      orders: await countRows(targetDb, "orders"),
      productImages: await countRows(targetDb, "product_images"),
      productTags: await countRows(targetDb, "product_tags"),
      products: await countRows(targetDb, "products"),
      siteConfig: await countRows(targetDb, "site_config"),
      tags: await countRows(targetDb, "tags"),
      users: await countRows(targetDb, "users"),
      wishlistItems: await countRows(targetDb, "wishlist_items"),
    };

    console.log("[migration] complete");
    console.table(summary);
  } finally {
    await source.end();
    await targetPool.end();
  }
};

run().catch((error) => {
  console.error("[migration] failed", error);
  process.exit(1);
});
