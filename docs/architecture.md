# From the Trunk - Architecture Overview

This document outlines the high-level architecture of the "From the Trunk" e-commerce platform. The project is built using Next.js 16 (App Router), Payload CMS 3, PostgreSQL, and modern frontend tools.

## 1. Routing Architecture

The project uses Next.js Route Groups to separate the public storefront from the CMS admin panel, ensuring distinct layouts and functionality.

### **`(site)` Route Group - Public Storefront**
- **Purpose**: Handles all public-facing pages for customers.
- **Layouts**: 
  - Root Layout (`layout.tsx`): Wraps the entire site with the header, footer, SEO metadata, fonts (Cormorant Garamond, Inter), and global Providers.
  - Template (`template.tsx`): Integrates Framer Motion for page transition animations.
  - Account Layout (`account/layout.tsx`): Provides a shell for authenticated user account pages.
- **Key Routes**:
  - `/` - Homepage
  - `/collection` & `/collection/[slug]` - Product listing and detail pages
  - `/cart` & `/checkout` - E-commerce transaction flow
  - `/account/*` - User profile, orders, addresses, and wishlist management
  - `/search` - Product search

### **`(payload)` Route Group - Admin Panel**
- **Purpose**: Hosts the Payload CMS admin interface.
- **Route**: `/admin/[[...segments]]` Catch-all route to dynamically render Payload's admin views.
- **Integration**: Uses custom server function integration (`payload-admin-server-function.ts`).

### **API Routes (`app/api`)**
- **Auth**: `/api/auth/[...nextauth]` handles authentication using NextAuth.js.
- **CMS**: `/api/payload/[...slug]` is the REST API proxy for Payload CMS.
- **E-commerce**: Includes endpoints for cart reservation (`/api/cart/reserve`), order creation, and Razorpay integrations (`/api/payments/create-order`, `/api/webhooks/razorpay`).
- **Jobs**: `/api/cron/release-reservations` handles scheduled cleanup of reserved cart items.

---

## 2. Frontend & UI Component Architecture

The frontend is built with a focus on accessible, luxury-themed components using modern styling and animation libraries.

### **UI Libraries & Styling**
- **Headless UI**: Primarily uses Radix UI for accessible primitives (Dialog, Dropdown Menu, Select, Accordion).
- **Styling**: Tailwind CSS v4 is used extensively, with a custom variable-based theming system supporting Dark Mode.
- **Theme/Colors**: Custom palette includes `trunk-burgundy`, `trunk-gold`, `trunk-cream`, and `trunk-brown`.
- **Component Patterns**: 
  - Uses `class-variance-authority` (CVA) for variant management.
  - Follows shadcn/ui style composition patterns for base UI components (`components/ui/`).
  - Domain-specific components are separated logically (e.g., `components/product/`, `components/cart/`).

### **State Management & Data Fetching**
- **Zustand**: Client-side state management (e.g., shopping cart, recently viewed items).
- **TanStack React Query**: Manages server state and asynchronous data fetching.
- **Next Auth**: Manages user session and authentication state.

### **Animations**
- **GSAP**: Used for advanced scroll-triggered animations (`scroll-reveal.tsx`), respecting `prefers-reduced-motion`.
- **Framer Motion**: Utilized for page transitions.

---

## 3. Data Models & Payload CMS Setup

The backend logic and data storage are managed by Payload CMS with a PostgreSQL database.

### **Database Configuration**
- **Adapter**: `@payloadcms/db-postgres`
- **Connection Pooling**: Configured in `payload.config.ts` to manage concurrent connections efficiently (max pool size set to 5).

### **Core Collections**
- **`users`**: Authentication-enabled collection for both customers and admins. Manages relationships to addresses and wishlist products.
- **`products`**: Central e-commerce items featuring draft/publish versioning, specialized status fields (`available`, `reserved`, `sold`), and detailed product metadata.
- **`orders`**: Tracks the order lifecycle (`pending`, `confirmed`, `shipped`, `delivered`), tied to Razorpay payments and shipping data.
- **`collections`**: Categories for organizing products.
- **`addresses`**: User shipping addresses.
- **`newsletter_subscribers`**: Handles double opt-in email subscriptions.
- **`media`**: Manages file uploads and automated image resizing (e.g., thumbnails, cards).

### **Globals (Dynamic Pages)**
Payload Globals are used to manage singleton page content, supporting drafts and live preview:
- `homePage`
- `collectionPage`
- `ourStoryPage`
- `howItWorksPage`

---

## 4. Notable Architecture Features

- **Inventory Reservation System**: The custom cart system uses a 30-minute server-side hold (tracked via `stockStatus` and `reservedUntil` on the product) and an automatic cron job for release.
- **Draft Preview Integration**: Real-time content preview is fully integrated between Next.js Draft Mode and the Payload admin panel.
- **Next.js 15+ Conventions**: The App Router heavily utilizes the new Promise-based asynchronous APIs for dynamic `params` and `searchParams` to align with the latest Next.js 15/16 rendering standards.
