/**
 * P3-01: Content-store port.
 *
 * Defines the stable interface for CMS content CRUD. The production
 * implementation is the Drizzle adapter in lib/adapters/drizzle-content-store.ts.
 * Tests use the same file's in-memory implementation.
 *
 * Money: not applicable here (content store has no monetary fields).
 * Slugs: callers must pass pre-validated slugs; createPage enforces the
 *        reserved-slug deny-list internally.
 */

// ── Domain types ─────────────────────────────────────────────────────────────

export type PageStatus = "draft" | "published";
export type MenuSlot = "header" | "footer";

export interface Page {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  seo: Record<string, unknown> | null;
  publishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageVersion {
  id: string;
  pageId: string;
  blocks: unknown[];
  createdBy: string;
  createdAt: Date;
}

export interface ThemeSettings {
  id: number;
  tokens: Record<string, unknown>;
  updatedAt: Date;
}

export interface ThemeVersion {
  id: string;
  tokens: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
}

export interface NavigationMenu {
  id: string;
  slot: MenuSlot;
  items: unknown[];
  updatedAt: Date;
}

export interface Redirect {
  id: string;
  fromPath: string;
  toPath: string;
  createdAt: Date;
}

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreatePageInput {
  slug: string;
  title: string;
  seo?: Record<string, unknown> | null;
}

export interface CreatePageVersionInput {
  pageId: string;
  blocks: unknown[];
  createdBy: string;
}

export interface UpdatePageInput {
  title?: string;
  seo?: Record<string, unknown> | null;
}

// ── Port interface ───────────────────────────────────────────────────────────

export interface ContentStore {
  // Pages
  getPageBySlug(slug: string): Promise<Page | null>;
  getPageById(pageId: string): Promise<Page | null>;
  listPages(): Promise<Page[]>;
  /** Creates a page in draft status. Rejects reserved slugs. */
  createPage(input: CreatePageInput): Promise<Page>;
  /** Updates mutable page fields (title, seo). Does not change slug or status. */
  updatePage(pageId: string, input: UpdatePageInput): Promise<Page | null>;

  // Page versions (immutable — only inserted, never updated)
  createPageVersion(input: CreatePageVersionInput): Promise<PageVersion>;
  /** Lists all versions for a page, newest first. */
  listPageVersions(pageId: string): Promise<PageVersion[]>;

  /** Sets published_version_id and status=published. */
  publishPage(pageId: string, versionId: string): Promise<Page>;

  /**
   * Clears published_version_id and sets status back to draft.
   * The page returns to 404 publicly until re-published.
   */
  unpublishPage(pageId: string): Promise<Page>;

  /** Returns the published page + its active version, or null if draft/not found. */
  getPublishedPage(slug: string): Promise<{ page: Page; version: PageVersion } | null>;

  // Theme settings (singleton)
  getThemeSettings(): Promise<ThemeSettings | null>;
  /** Persists tokens to the singleton row AND appends an immutable version row. */
  saveThemeSettings(
    tokens: Record<string, unknown>,
    createdBy?: string
  ): Promise<ThemeSettings>;
  /** Returns all theme versions, newest first. */
  listThemeVersions(): Promise<ThemeVersion[]>;
  /** Returns a single theme version by id, or null. */
  getThemeVersion(id: string): Promise<ThemeVersion | null>;

  // Navigation menus
  getMenu(slot: MenuSlot): Promise<NavigationMenu | null>;
  saveMenu(slot: MenuSlot, items: unknown[]): Promise<NavigationMenu>;

  // Redirects
  createRedirect(fromPath: string, toPath: string): Promise<Redirect>;
  getRedirect(fromPath: string): Promise<Redirect | null>;
  listRedirects(): Promise<Redirect[]>;
  deleteRedirect(fromPath: string): Promise<boolean>;
}
