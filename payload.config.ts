import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, slugField } from "payload";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const serverURL =
  process.env.NEXT_PUBLIC_SERVER_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
const previewSecret = process.env.PAYLOAD_PREVIEW_SECRET || "";
const payloadSecret = process.env.PAYLOAD_SECRET || "local-dev-payload-secret";

const isAdmin = ({ req }: { req: any }) => req.user?.role === "admin";

const isAdminOrSelf = ({ req }: { req: any }) => {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  return { id: { equals: req.user.id } };
};

const canAccessUserContent = ({ req }: { req: any }) => {
  if (!req.user) return false;
  if (req.user.role === "admin") return true;
  return { user: { equals: req.user.id } };
};

const buildPreviewURL = (path: string, token: null | string = null) => {
  const params = new URLSearchParams();
  params.set("slug", path);

  if (previewSecret) {
    params.set("secret", previewSecret);
  }

  if (token) {
    params.set("token", token);
  }

  return `${serverURL}/api/draft/enable?${params.toString()}`;
};

const toSlug = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

export default buildConfig({
  admin: {
    user: "users",
    importMap: {
      autoGenerate: false,
      baseDir: dirname,
      importMapFile: path.resolve(dirname, "payload", "importMap.ts"),
    },
    components: {
      beforeDashboard: [
        "/components/admin/DashboardOverview#DashboardOverview",
      ],
      graphics: {
        Logo: "/components/admin/AdminLogo#AdminLogo",
        Icon: "/components/admin/AdminIcon#AdminIcon",
      },
    },
  },
  routes: {
    api: "/api/payload",
  },
  collections: [
    {
      slug: "users",
      auth: true,
      admin: {
        useAsTitle: "email",
      },
      access: {
        admin: isAdmin,
        read: isAdminOrSelf,
        update: isAdminOrSelf,
        delete: isAdmin,
        create: isAdmin,
      },
      fields: [
        {
          name: "role",
          type: "select",
          required: true,
          defaultValue: "customer",
          options: [
            { label: "Admin", value: "admin" },
            { label: "Customer", value: "customer" },
          ],
        },
        {
          name: "name",
          type: "text",
        },
        {
          name: "image",
          type: "text",
        },
        {
          name: "phone",
          type: "text",
        },
        {
          name: "emailVerified",
          type: "date",
        },
        {
          name: "defaultAddress",
          type: "relationship",
          relationTo: "addresses",
        },
        {
          name: "addresses",
          type: "relationship",
          relationTo: "addresses",
          hasMany: true,
        },
        {
          name: "wishlist",
          type: "relationship",
          relationTo: "products",
          hasMany: true,
          admin: {
            description: "Products the user has saved to their wishlist.",
          },
        },
      ],
    },
    {
      slug: "addresses",
      admin: {
        useAsTitle: "label",
      },
      access: {
        read: canAccessUserContent,
        update: canAccessUserContent,
        delete: canAccessUserContent,
        create: ({ req }: { req: any }) => Boolean(req.user),
      },
      fields: [
        {
          name: "user",
          type: "relationship",
          relationTo: "users",
          required: true,
        },
        {
          name: "label",
          type: "text",
        },
        {
          name: "name",
          type: "text",
        },
        {
          name: "line1",
          type: "text",
          required: true,
        },
        {
          name: "line2",
          type: "text",
        },
        {
          name: "city",
          type: "text",
          required: true,
        },
        {
          name: "state",
          type: "text",
        },
        {
          name: "postalCode",
          type: "text",
          required: true,
        },
        {
          name: "country",
          type: "text",
          required: true,
        },
        {
          name: "phone",
          type: "text",
        },
        {
          name: "isDefault",
          type: "checkbox",
          defaultValue: false,
        },
      ],
    },
    {
      slug: "auth_accounts",
      admin: { hidden: true },
      access: {
        read: () => false,
        update: () => false,
        delete: () => false,
        create: () => false,
      },
      hooks: {
        beforeValidate: [
          async ({ data, originalDoc, req }) => {
            const provider = data?.provider ?? originalDoc?.provider;
            const providerAccountId =
              data?.providerAccountId ?? originalDoc?.providerAccountId;

            if (!provider || !providerAccountId || !req?.payload) {
              return data;
            }

            const existing = await req.payload.find({
              collection: "auth_accounts",
              where: {
                and: [
                  { provider: { equals: provider } },
                  { providerAccountId: { equals: providerAccountId } },
                ],
              },
              limit: 1,
              overrideAccess: true,
            });

            const existingDoc = existing.docs[0];
            const currentId = originalDoc?.id ?? data?.id;
            if (existingDoc && existingDoc.id !== currentId) {
              throw new Error("Provider account is already linked.");
            }

            return data;
          },
        ],
      },
      fields: [
        {
          name: "user",
          type: "relationship",
          relationTo: "users",
          required: true,
        },
        {
          name: "type",
          type: "text",
        },
        {
          name: "provider",
          type: "text",
          required: true,
        },
        {
          name: "providerAccountId",
          type: "text",
          required: true,
        },
        {
          name: "access_token",
          type: "text",
        },
        {
          name: "refresh_token",
          type: "text",
        },
        {
          name: "expires_at",
          type: "number",
        },
        {
          name: "token_type",
          type: "text",
        },
        {
          name: "scope",
          type: "text",
        },
        {
          name: "id_token",
          type: "text",
        },
        {
          name: "session_state",
          type: "text",
        },
      ],
    },
    {
      slug: "auth_sessions",
      admin: { hidden: true },
      access: {
        read: () => false,
        update: () => false,
        delete: () => false,
        create: () => false,
      },
      fields: [
        {
          name: "sessionToken",
          type: "text",
          required: true,
          unique: true,
        },
        {
          name: "user",
          type: "relationship",
          relationTo: "users",
          required: true,
        },
        {
          name: "expires",
          type: "date",
          required: true,
        },
      ],
    },
    {
      slug: "auth_verification_tokens",
      admin: { hidden: true },
      access: {
        read: () => false,
        update: () => false,
        delete: () => false,
        create: () => false,
      },
      fields: [
        {
          name: "identifier",
          type: "text",
          required: true,
        },
        {
          name: "token",
          type: "text",
          required: true,
          unique: true,
        },
        {
          name: "expires",
          type: "date",
          required: true,
        },
      ],
    },
    {
      slug: "products",
      admin: {
        useAsTitle: "name",
        preview: (doc, { token }) => {
          const slug = toSlug(doc?.slug);
          return buildPreviewURL(slug ? `/collection/${slug}` : "/collection", token);
        },
        livePreview: {
          url: ({ data }) => {
            const slug = toSlug(data?.slug);
            return slug ? `${serverURL}/collection/${slug}` : `${serverURL}/collection`;
          },
        },
      },
      access: {
        read: ({ req }: { req: any }) => {
          if (req.user?.role === "admin") return true;
          return { status: { equals: "published" } };
        },
        create: isAdmin,
        update: isAdmin,
        delete: isAdmin,
      },
      versions: {
        drafts: true,
      },
      fields: [
        {
          name: "name",
          type: "text",
          required: true,
        },
        slugField({
          name: "slug",
          position: "sidebar",
        }),
        {
          name: "price",
          type: "number",
          required: true,
          min: 0,
        },
        {
          name: "originalPrice",
          type: "number",
          min: 0,
        },
        {
          name: "featured",
          type: "checkbox",
          defaultValue: false,
        },
        {
          name: "images",
          type: "relationship",
          relationTo: "media",
          hasMany: true,
        },
        {
          name: "collection",
          type: "relationship",
          relationTo: "collections",
        },
        {
          name: "status",
          type: "select",
          defaultValue: "published",
          options: [
            { label: "Draft", value: "draft" },
            { label: "Published", value: "published" },
          ],
        },
        {
          name: "stockStatus",
          type: "select",
          defaultValue: "available",
          admin: {
            position: "sidebar",
            description: "Pre-loved items are one-of-a-kind. Track availability here.",
          },
          options: [
            { label: "Available", value: "available" },
            { label: "Reserved", value: "reserved" },
            { label: "Sold", value: "sold" },
          ],
        },
        {
          name: "reservedUntil",
          type: "date",
          admin: {
            position: "sidebar",
            description: "Auto-set when a customer adds this item to their cart.",
            readOnly: true,
          },
        },
        {
          name: "soldAt",
          type: "date",
          admin: {
            position: "sidebar",
            readOnly: true,
          },
        },
        {
          name: "story",
          type: "group",
          fields: [
            {
              name: "title",
              type: "text",
              required: true,
            },
            {
              name: "narrative",
              type: "textarea",
            },
            {
              name: "provenance",
              type: "text",
            },
            {
              name: "era",
              type: "text",
            },
          ],
        },
        {
          name: "details",
          type: "group",
          fields: [
            {
              name: "fabric",
              type: "text",
            },
            {
              name: "length",
              type: "text",
            },
            {
              name: "width",
              type: "text",
            },
            {
              name: "condition",
              type: "text",
            },
            {
              name: "designer",
              type: "text",
            },
            {
              name: "occasion",
              type: "select",
              hasMany: true,
              options: [
                { label: "Bridal", value: "bridal" },
                { label: "Cocktail", value: "cocktail" },
                { label: "Evening", value: "evening" },
                { label: "Festive", value: "festive" },
                { label: "Heritage", value: "heritage" },
                { label: "Reception", value: "reception" },
                { label: "Soiree", value: "soiree" },
                { label: "Wedding", value: "wedding" },
              ],
            },
          ],
        },
      ],
    },
    {
      slug: "collections",
      admin: {
        useAsTitle: "name",
        preview: (doc, { token }) => {
          const slug = toSlug(doc?.slug);
          return buildPreviewURL(
            slug ? `/collection?collection=${encodeURIComponent(slug)}` : "/collection",
            token
          );
        },
        livePreview: {
          url: ({ data }) => {
            const slug = toSlug(data?.slug);
            return slug
              ? `${serverURL}/collection?collection=${encodeURIComponent(slug)}`
              : `${serverURL}/collection`;
          },
        },
      },
      access: {
        read: () => true,
        create: isAdmin,
        update: isAdmin,
        delete: isAdmin,
      },
      versions: {
        drafts: true,
      },
      fields: [
        {
          name: "name",
          type: "text",
          required: true,
        },
        slugField({
          name: "slug",
          position: "sidebar",
        }),
        {
          name: "description",
          type: "textarea",
        },
        {
          name: "heroImage",
          type: "upload",
          relationTo: "media",
        },
        {
          name: "featured",
          type: "checkbox",
          defaultValue: false,
        },
      ],
    },
    {
      slug: "orders",
      admin: {
        useAsTitle: "id",
      },
      access: {
        read: canAccessUserContent,
        create: ({ req }: { req: any }) => Boolean(req.user),
        update: isAdmin,
        delete: isAdmin,
      },
      fields: [
        {
          name: "user",
          type: "relationship",
          relationTo: "users",
          required: true,
        },
        {
          name: "items",
          type: "array",
          required: true,
          fields: [
            {
              name: "product",
              type: "relationship",
              relationTo: "products",
            },
            {
              name: "name",
              type: "text",
              required: true,
            },
            {
              name: "price",
              type: "number",
              required: true,
            },
            {
              name: "quantity",
              type: "number",
              required: true,
              min: 1,
            },
            {
              name: "imageUrl",
              type: "text",
            },
          ],
        },
        {
          name: "subtotal",
          type: "number",
          required: true,
          min: 0,
        },
        {
          name: "status",
          type: "select",
          defaultValue: "pending",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Shipped", value: "shipped" },
            { label: "Delivered", value: "delivered" },
          ],
        },
        {
          name: "shippingAddress",
          type: "group",
          fields: [
            { name: "name", type: "text" },
            { name: "line1", type: "text" },
            { name: "line2", type: "text" },
            { name: "city", type: "text" },
            { name: "state", type: "text" },
            { name: "postalCode", type: "text" },
            { name: "country", type: "text" },
            { name: "phone", type: "text" },
            { name: "email", type: "text" },
          ],
        },
        {
          name: "shippingCost",
          type: "number",
          min: 0,
          defaultValue: 0,
        },
        {
          name: "shippingMethod",
          type: "select",
          options: [
            { label: "Standard", value: "standard" },
            { label: "Express", value: "express" },
          ],
        },
        {
          name: "taxRate",
          type: "number",
          min: 0,
          admin: { readOnly: true },
        },
        {
          name: "taxAmount",
          type: "number",
          min: 0,
          admin: { readOnly: true },
        },
        {
          name: "total",
          type: "number",
          min: 0,
          admin: { readOnly: true },
        },
        {
          name: "paymentGateway",
          type: "text",
          admin: { readOnly: true },
        },
        {
          name: "razorpayOrderId",
          type: "text",
          admin: { readOnly: true },
        },
        {
          name: "paymentId",
          type: "text",
          admin: { readOnly: true },
        },
        {
          name: "paymentStatus",
          type: "select",
          defaultValue: "pending",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Paid", value: "paid" },
            { label: "Failed", value: "failed" },
            { label: "Refunded", value: "refunded" },
          ],
        },
        {
          name: "paymentMethod",
          type: "text",
          admin: { readOnly: true },
        },
        {
          name: "placedAt",
          type: "date",
        },
      ],
    },
    {
      slug: "newsletter_subscribers",
      admin: {
        useAsTitle: "email",
      },
      access: {
        read: isAdmin,
        create: () => true,
        update: isAdmin,
        delete: isAdmin,
      },
      fields: [
        {
          name: "email",
          type: "email",
          required: true,
          unique: true,
        },
        {
          name: "status",
          type: "select",
          defaultValue: "pending",
          options: [
            { label: "Pending Confirmation", value: "pending" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Unsubscribed", value: "unsubscribed" },
          ],
        },
        {
          name: "confirmToken",
          type: "text",
          admin: { hidden: true },
        },
        {
          name: "confirmedAt",
          type: "date",
        },
      ],
    },
    {
      slug: "media",
      admin: {
        useAsTitle: "filename",
      },
      access: {
        read: () => true,
        create: isAdmin,
        update: isAdmin,
        delete: isAdmin,
      },
      upload: {
        staticDir: path.resolve(dirname, "public", "media"),
        imageSizes: [
          { name: "thumbnail", width: 400, height: 400 },
          { name: "card", width: 900, height: 1200 },
        ],
      },
      fields: [
        {
          name: "alt",
          type: "text",
        },
      ],
    },
  ],
  db: postgresAdapter({
    idType: "uuid",
    pool: {
      connectionString: process.env.DATABASE_URL || "",
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    },
  }),
  editor: lexicalEditor({}),
  globals: [
    {
      slug: "homePage",
      admin: {
        preview: (_doc, { token }) => buildPreviewURL("/", token),
        livePreview: {
          url: () => `${serverURL}/`,
        },
      },
      access: {
        read: () => true,
        update: isAdmin,
      },
      versions: {
        drafts: true,
      },
      fields: [
        {
          name: "heroEyebrow",
          type: "text",
          defaultValue: "From the Trunk",
        },
        {
          name: "heroTitle",
          type: "text",
          defaultValue: "Pre-loved luxury sarees with provenance.",
        },
        {
          name: "heroSubtitle",
          type: "textarea",
          defaultValue:
            "Curated heirloom pieces, authenticated and restored with care, each carrying the story that made it timeless.",
        },
        {
          name: "heroImage",
          type: "upload",
          relationTo: "media",
        },
        {
          name: "primaryCtaLabel",
          type: "text",
          defaultValue: "Explore the Collection",
        },
        {
          name: "primaryCtaHref",
          type: "text",
          defaultValue: "/collection",
        },
        {
          name: "secondaryCtaLabel",
          type: "text",
          defaultValue: "Read the Story",
        },
        {
          name: "secondaryCtaHref",
          type: "text",
          defaultValue: "/our-story",
        },
        {
          name: "heroCardEyebrow",
          type: "text",
          defaultValue: "New Arrivals",
        },
        {
          name: "heroCardTitle",
          type: "text",
          defaultValue: "Curated designer sarees from the 1980s-2000s.",
        },
        {
          name: "heroCardBody",
          type: "textarea",
          defaultValue:
            "Limited drops every fortnight. Reserve your piece early.",
        },
        {
          name: "featuredEyebrow",
          type: "text",
          defaultValue: "Featured Collection",
        },
        {
          name: "featuredTitle",
          type: "text",
          defaultValue: "Curated treasures for the season",
        },
        {
          name: "featuredBody",
          type: "textarea",
          defaultValue:
            "Every piece is authenticated and hand-selected from private wardrobes, couture houses, and archive trunks.",
        },
        {
          name: "featuredCtaLabel",
          type: "text",
          defaultValue: "View All Sarees",
        },
        {
          name: "featuredCtaHref",
          type: "text",
          defaultValue: "/collection",
        },
      ],
    },
    {
      slug: "collectionPage",
      admin: {
        preview: (_doc, { token }) => buildPreviewURL("/collection", token),
        livePreview: {
          url: () => `${serverURL}/collection`,
        },
      },
      access: {
        read: () => true,
        update: isAdmin,
      },
      versions: {
        drafts: true,
      },
      fields: [
        {
          name: "eyebrow",
          type: "text",
          defaultValue: "The Collection",
        },
        {
          name: "title",
          type: "text",
          defaultValue: "Curated pre-loved sarees",
        },
        {
          name: "description",
          type: "textarea",
          defaultValue:
            "Discover heirlooms from private wardrobes, couture archives, and collector trunks. Each piece is authenticated and accompanied by its story.",
        },
        {
          name: "filtersTitle",
          type: "text",
          defaultValue: "Refined browsing, coming soon",
        },
        {
          name: "filtersBody",
          type: "textarea",
          defaultValue:
            "We are preparing thoughtful ways to explore the collection by era, fabric, and provenance. Until then, every piece is here for you to discover.",
        },
      ],
    },
    {
      slug: "ourStoryPage",
      admin: {
        preview: (_doc, { token }) => buildPreviewURL("/our-story", token),
        livePreview: {
          url: () => `${serverURL}/our-story`,
        },
      },
      access: {
        read: () => true,
        update: isAdmin,
      },
      versions: {
        drafts: true,
      },
      fields: [
        {
          name: "heroEyebrow",
          type: "text",
          defaultValue: "Our Story",
        },
        {
          name: "heroTitle",
          type: "text",
          defaultValue: "A trunk of memories, reopened",
        },
        {
          name: "heroImage",
          type: "upload",
          relationTo: "media",
        },
        {
          name: "sectionTitle",
          type: "text",
          defaultValue: "From keepsake to collection",
        },
        {
          name: "sectionBody",
          type: "textarea",
          defaultValue:
            "The first trunk belonged to a grandmother who kept every saree she wore for milestones, festivals, and family weddings. We realized each piece carried a story worth preserving and sharing.",
        },
        {
          name: "cardOneTitle",
          type: "text",
          defaultValue: "Curated Heritage",
        },
        {
          name: "cardOneBody",
          type: "textarea",
          defaultValue:
            "Every saree is sourced from trusted collectors and family archives.",
        },
        {
          name: "cardTwoTitle",
          type: "text",
          defaultValue: "Authenticated Craft",
        },
        {
          name: "cardTwoBody",
          type: "textarea",
          defaultValue:
            "We verify weave, zari, and provenance before adding any piece.",
        },
        {
          name: "cardThreeTitle",
          type: "text",
          defaultValue: "Modern Heirlooms",
        },
        {
          name: "cardThreeBody",
          type: "textarea",
          defaultValue:
            "Pieces are restored with care so they can be cherished again.",
        },
      ],
    },
    {
      slug: "howItWorksPage",
      admin: {
        preview: (_doc, { token }) => buildPreviewURL("/how-it-works", token),
        livePreview: {
          url: () => `${serverURL}/how-it-works`,
        },
      },
      access: {
        read: () => true,
        update: isAdmin,
      },
      versions: {
        drafts: true,
      },
      fields: [
        {
          name: "eyebrow",
          type: "text",
          defaultValue: "How It Works",
        },
        {
          name: "title",
          type: "text",
          defaultValue: "The journey of every saree",
        },
        {
          name: "description",
          type: "textarea",
          defaultValue:
            "From sourcing to storytelling, every piece is cared for with respect to its heritage.",
        },
        {
          name: "stepOneTitle",
          type: "text",
          defaultValue: "Sourcing & Curation",
        },
        {
          name: "stepOneBody",
          type: "textarea",
          defaultValue:
            "We partner with collectors, couture archives, and legacy wardrobes to source heirloom sarees.",
        },
        {
          name: "stepTwoTitle",
          type: "text",
          defaultValue: "Authentication",
        },
        {
          name: "stepTwoBody",
          type: "textarea",
          defaultValue:
            "Our specialists verify weave, fabric, zari, and craftsmanship. Every piece is documented with provenance.",
        },
        {
          name: "stepThreeTitle",
          type: "text",
          defaultValue: "Restoration",
        },
        {
          name: "stepThreeBody",
          type: "textarea",
          defaultValue:
            "Gentle cleaning, steaming, and preservation ensures each saree is ready to wear again.",
        },
        {
          name: "stepFourTitle",
          type: "text",
          defaultValue: "Delivery",
        },
        {
          name: "stepFourBody",
          type: "textarea",
          defaultValue:
            "Your saree arrives in a protective muslin wrap with a story card and care notes.",
        },
      ],
    },
  ],
  secret: payloadSecret,
  serverURL,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
});
