/**
 * Manually-authored Payload type definitions.
 *
 * These mirror the collections and globals declared in payload.config.ts so
 * the rest of the codebase can avoid `any`.  When an actual database is
 * available, run `npm run payload:types` to regenerate from the schema and
 * replace this file.
 */

/* ------------------------------------------------------------------ */
/*  Shared / utility types                                            */
/* ------------------------------------------------------------------ */

/** Shape returned by every Payload `find` call. */
export interface PaginatedDocs<T> {
  docs: T[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
  nextPage?: number | null;
  page?: number;
  pagingCounter: number;
  prevPage?: number | null;
  totalDocs: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Media                                                             */
/* ------------------------------------------------------------------ */

export interface Media {
  id: string;
  alt?: string | null;
  createdAt: string;
  filename?: string | null;
  filesize?: number | null;
  height?: number | null;
  mimeType?: string | null;
  sizes?: {
    card?: MediaSize | null;
    thumbnail?: MediaSize | null;
  };
  updatedAt: string;
  url?: string | null;
  width?: number | null;
}

export interface MediaSize {
  filename?: string | null;
  filesize?: number | null;
  height?: number | null;
  mimeType?: string | null;
  url?: string | null;
  width?: number | null;
}

/* ------------------------------------------------------------------ */
/*  Users                                                             */
/* ------------------------------------------------------------------ */

export type UserRole = "admin" | "customer";

export interface User {
  id: string;
  addresses?: (Address | string)[] | null;
  createdAt: string;
  defaultAddress?: Address | string | null;
  email: string;
  emailVerified?: string | null;
  image?: string | null;
  name?: string | null;
  phone?: string | null;
  role: UserRole;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Addresses                                                         */
/* ------------------------------------------------------------------ */

export interface Address {
  id: string;
  city: string;
  country: string;
  createdAt: string;
  isDefault?: boolean | null;
  label?: string | null;
  line1: string;
  line2?: string | null;
  name?: string | null;
  phone?: string | null;
  postalCode: string;
  state?: string | null;
  updatedAt: string;
  user: User | string;
}

/* ------------------------------------------------------------------ */
/*  Collections (the Payload "collections" collection, not the concept) */
/* ------------------------------------------------------------------ */

export interface Collection {
  id: string;
  createdAt: string;
  description?: string | null;
  featured?: boolean | null;
  heroImage?: Media | string | null;
  name: string;
  slug: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Products                                                          */
/* ------------------------------------------------------------------ */

export type ProductStatus = "draft" | "published";

export type ProductOccasion =
  | "bridal"
  | "cocktail"
  | "evening"
  | "festive"
  | "heritage"
  | "reception"
  | "soiree"
  | "wedding";

export type StockStatus = "available" | "reserved" | "sold";

export interface ProductStory {
  era?: string | null;
  narrative?: string | null;
  provenance?: string | null;
  title: string;
}

export interface ProductDetails {
  condition?: string | null;
  designer?: string | null;
  fabric?: string | null;
  length?: string | null;
  occasion?: ProductOccasion[] | null;
  width?: string | null;
}

export interface Product {
  id: string;
  collection?: Collection | string | null;
  createdAt: string;
  details?: ProductDetails | null;
  featured?: boolean | null;
  images?: (Media | string)[] | null;
  name: string;
  originalPrice?: number | null;
  price: number;
  slug: string;
  status?: ProductStatus | null;
  stockStatus?: StockStatus | null;
  reservedUntil?: string | null;
  soldAt?: string | null;
  story?: ProductStory | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Orders                                                            */
/* ------------------------------------------------------------------ */

export type OrderStatus = "confirmed" | "delivered" | "pending" | "shipped";

export interface OrderItem {
  id?: string;
  imageUrl?: string | null;
  name: string;
  price: number;
  product?: Product | string | null;
  quantity: number;
}

export interface ShippingAddress {
  city?: string | null;
  country?: string | null;
  email?: string | null;
  line1?: string | null;
  line2?: string | null;
  name?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  state?: string | null;
}

export interface Order {
  id: string;
  createdAt: string;
  items: OrderItem[];
  placedAt?: string | null;
  shippingAddress?: ShippingAddress | null;
  shippingCost?: number | null;
  shippingMethod?: string | null;
  status?: OrderStatus | null;
  subtotal: number;
  taxAmount?: number | null;
  taxRate?: number | null;
  total?: number | null;
  updatedAt: string;
  user: User | string;
  paymentId?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentGateway?: string | null;
  razorpayOrderId?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Auth helper collections (hidden from admin)                       */
/* ------------------------------------------------------------------ */

export interface AuthAccount {
  id: string;
  access_token?: string | null;
  expires_at?: number | null;
  id_token?: string | null;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  scope?: string | null;
  session_state?: string | null;
  token_type?: string | null;
  type?: string | null;
  user: User | string;
}

export interface AuthSession {
  id: string;
  expires: string;
  sessionToken: string;
  user: User | string;
}

export interface AuthVerificationToken {
  id: string;
  expires: string;
  identifier: string;
  token: string;
}

/* ------------------------------------------------------------------ */
/*  Globals                                                           */
/* ------------------------------------------------------------------ */

export interface HomePageGlobal {
  featuredBody?: string | null;
  featuredCtaHref?: string | null;
  featuredCtaLabel?: string | null;
  featuredEyebrow?: string | null;
  featuredTitle?: string | null;
  heroCardBody?: string | null;
  heroCardEyebrow?: string | null;
  heroCardTitle?: string | null;
  heroEyebrow?: string | null;
  heroImage?: Media | string | null;
  heroSubtitle?: string | null;
  heroTitle?: string | null;
  primaryCtaHref?: string | null;
  primaryCtaLabel?: string | null;
  secondaryCtaHref?: string | null;
  secondaryCtaLabel?: string | null;
}

export interface CollectionPageGlobal {
  description?: string | null;
  eyebrow?: string | null;
  filtersBody?: string | null;
  filtersTitle?: string | null;
  title?: string | null;
}

export interface OurStoryPageGlobal {
  cardOneBody?: string | null;
  cardOneTitle?: string | null;
  cardThreeBody?: string | null;
  cardThreeTitle?: string | null;
  cardTwoBody?: string | null;
  cardTwoTitle?: string | null;
  heroEyebrow?: string | null;
  heroImage?: Media | string | null;
  heroTitle?: string | null;
  sectionBody?: string | null;
  sectionTitle?: string | null;
}

export interface HowItWorksPageGlobal {
  description?: string | null;
  eyebrow?: string | null;
  stepFourBody?: string | null;
  stepFourTitle?: string | null;
  stepOneBody?: string | null;
  stepOneTitle?: string | null;
  stepThreeBody?: string | null;
  stepThreeTitle?: string | null;
  stepTwoBody?: string | null;
  stepTwoTitle?: string | null;
  title?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Newsletter subscribers (new collection to be added)               */
/* ------------------------------------------------------------------ */

export interface NewsletterSubscriber {
  id: string;
  createdAt: string;
  email: string;
  confirmedAt?: string | null;
  status: "pending" | "confirmed" | "unsubscribed";
  updatedAt: string;
}
