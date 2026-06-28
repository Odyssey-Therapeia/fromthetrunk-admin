/**
 * P3-01: Drizzle content-store adapter + in-memory test double.
 *
 * Two implementations of ContentStore:
 *
 *   createDrizzleContentStore() — production adapter backed by Neon/Postgres
 *     via the Drizzle query helpers in db/queries/content.ts.
 *
 *   createInMemoryContentStore() — pure in-memory implementation for unit tests.
 *     No database required. Exported so tests can import it directly.
 *
 * Both enforce the reserved-slug deny-list via isReservedSlug().
 */

import { isReservedSlug } from "@/lib/content/reserved-slugs";
import type {
  ContentStore,
  CreatePageInput,
  CreatePageVersionInput,
  MenuSlot,
  NavigationMenu,
  Page,
  PageStatus,
  PageVersion,
  Redirect,
  ThemeSettings,
  ThemeVersion,
  UpdatePageInput,
} from "@/lib/ports/content-store";

// ── Helper: reserved-slug guard ───────────────────────────────────────────────

function assertNotReserved(slug: string): void {
  if (isReservedSlug(slug)) {
    throw new Error(
      `Slug "${slug}" is reserved and cannot be used for a CMS page.`,
    );
  }
}

// ── In-memory adapter (test double) ──────────────────────────────────────────

/**
 * Creates a fully-functional in-memory ContentStore.
 *
 * All data is stored in plain Maps; no DB connection is required.
 * Each call to createInMemoryContentStore() produces an isolated store
 * (no shared state between tests).
 */
export function createInMemoryContentStore(): ContentStore {
  const pagesMap = new Map<string, Page>();
  const pagesBySlug = new Map<string, Page>();
  const versionsMap = new Map<string, PageVersion>();
  const versionsByPage = new Map<string, PageVersion[]>();
  let themeRow: ThemeSettings | null = null;
  const themeVersionsList: ThemeVersion[] = [];
  const menusMap = new Map<MenuSlot, NavigationMenu>();
  const redirectsByFrom = new Map<string, Redirect>();

  function newId(): string {
    return crypto.randomUUID();
  }

  return {
    // ── Pages ─────────────────────────────────────────────────────────────

    async createPage(input: CreatePageInput): Promise<Page> {
      assertNotReserved(input.slug);

      const page: Page = {
        id: newId(),
        slug: input.slug,
        title: input.title,
        status: "draft" as PageStatus,
        seo: input.seo ?? null,
        publishedVersionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      pagesMap.set(page.id, page);
      pagesBySlug.set(page.slug, page);
      return page;
    },

    async getPageBySlug(slug: string): Promise<Page | null> {
      return pagesBySlug.get(slug) ?? null;
    },

    async getPageById(pageId: string): Promise<Page | null> {
      return pagesMap.get(pageId) ?? null;
    },

    async listPages(): Promise<Page[]> {
      return Array.from(pagesMap.values());
    },

    async updatePage(
      pageId: string,
      input: UpdatePageInput,
    ): Promise<Page | null> {
      const page = pagesMap.get(pageId);
      if (!page) return null;

      const updated: Page = {
        ...page,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.seo !== undefined ? { seo: input.seo } : {}),
        updatedAt: new Date(),
      };

      pagesMap.set(pageId, updated);
      pagesBySlug.set(updated.slug, updated);
      return updated;
    },

    async deletePage(pageId: string): Promise<boolean> {
      const page = pagesMap.get(pageId);

      if (!page) {
        return false;
      }

      pagesMap.delete(pageId);
      pagesBySlug.delete(page.slug);

      const versions = versionsByPage.get(pageId) ?? [];
      versions.forEach((version) => {
        versionsMap.delete(version.id);
      });
      versionsByPage.delete(pageId);

      return true;
    },

    // ── Page versions ─────────────────────────────────────────────────────

    async createPageVersion(
      input: CreatePageVersionInput,
    ): Promise<PageVersion> {
      const version: PageVersion = {
        id: newId(),
        pageId: input.pageId,
        blocks: input.blocks,
        createdBy: input.createdBy,
        createdAt: new Date(),
      };

      versionsMap.set(version.id, version);
      const existing = versionsByPage.get(input.pageId) ?? [];
      versionsByPage.set(input.pageId, [...existing, version]);
      return version;
    },

    async listPageVersions(pageId: string): Promise<PageVersion[]> {
      const versions = versionsByPage.get(pageId) ?? [];
      // Return newest first
      return [...versions].reverse();
    },

    async publishPage(pageId: string, versionId: string): Promise<Page> {
      const page = pagesMap.get(pageId);
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }

      const updated: Page = {
        ...page,
        status: "published",
        publishedVersionId: versionId,
        updatedAt: new Date(),
      };

      pagesMap.set(pageId, updated);
      pagesBySlug.set(updated.slug, updated);
      return updated;
    },

    async unpublishPage(pageId: string): Promise<Page> {
      const page = pagesMap.get(pageId);
      if (!page) {
        throw new Error(`Page not found: ${pageId}`);
      }

      const updated: Page = {
        ...page,
        status: "draft",
        publishedVersionId: null,
        updatedAt: new Date(),
      };

      pagesMap.set(pageId, updated);
      pagesBySlug.set(updated.slug, updated);
      return updated;
    },

    async getPublishedPage(
      slug: string,
    ): Promise<{ page: Page; version: PageVersion } | null> {
      const page = pagesBySlug.get(slug);
      if (!page || page.status !== "published" || !page.publishedVersionId) {
        return null;
      }

      const version = versionsMap.get(page.publishedVersionId);
      if (!version) return null;

      return { page, version };
    },

    // ── Theme settings ────────────────────────────────────────────────────

    async getThemeSettings(): Promise<ThemeSettings | null> {
      return themeRow;
    },

    async saveThemeSettings(
      tokens: Record<string, unknown>,
      createdBy: string = "unknown",
    ): Promise<ThemeSettings> {
      themeRow = {
        id: 1,
        tokens,
        updatedAt: new Date(),
      };

      // Append an immutable version row
      const version: ThemeVersion = {
        id: newId(),
        tokens,
        createdBy,
        createdAt: new Date(),
      };
      themeVersionsList.unshift(version); // newest first

      return themeRow;
    },

    async listThemeVersions(): Promise<ThemeVersion[]> {
      // Already stored newest-first
      return [...themeVersionsList];
    },

    async getThemeVersion(id: string): Promise<ThemeVersion | null> {
      return themeVersionsList.find((version) => version.id === id) ?? null;
    },

    // ── Navigation menus ──────────────────────────────────────────────────

    async getMenu(slot: MenuSlot): Promise<NavigationMenu | null> {
      return menusMap.get(slot) ?? null;
    },

    async saveMenu(slot: MenuSlot, items: unknown[]): Promise<NavigationMenu> {
      const existing = menusMap.get(slot);
      const menu: NavigationMenu = {
        id: existing?.id ?? newId(),
        slot,
        items,
        updatedAt: new Date(),
      };
      menusMap.set(slot, menu);
      return menu;
    },

    // ── Redirects ─────────────────────────────────────────────────────────

    async createRedirect(fromPath: string, toPath: string): Promise<Redirect> {
      if (redirectsByFrom.has(fromPath)) {
        throw new Error(
          `A redirect from "${fromPath}" already exists. from_path must be unique.`,
        );
      }

      const redirect: Redirect = {
        id: newId(),
        fromPath,
        toPath,
        createdAt: new Date(),
      };

      redirectsByFrom.set(fromPath, redirect);
      return redirect;
    },

    async getRedirect(fromPath: string): Promise<Redirect | null> {
      return redirectsByFrom.get(fromPath) ?? null;
    },

    async listRedirects(): Promise<Redirect[]> {
      return Array.from(redirectsByFrom.values());
    },

    async deleteRedirect(fromPath: string): Promise<boolean> {
      return redirectsByFrom.delete(fromPath);
    },
  };
}

// ── Drizzle adapter (production) ─────────────────────────────────────────────

/**
 * Creates the production ContentStore backed by Drizzle + Postgres.
 *
 * Import lazily so the db connection is not opened during unit tests.
 */
export function createDrizzleContentStore(): ContentStore {
  return {
    async createPage(input: CreatePageInput): Promise<Page> {
      assertNotReserved(input.slug);

      const { dbInsertPage } = await import("@/db/queries/content");
      const row = await dbInsertPage({
        slug: input.slug,
        title: input.title,
        seo: input.seo ?? null,
      });

      return rowToPage(row);
    },

    async getPageBySlug(slug: string): Promise<Page | null> {
      const { dbSelectPageBySlug } = await import("@/db/queries/content");
      const row = await dbSelectPageBySlug(slug);
      return row ? rowToPage(row) : null;
    },

    async getPageById(pageId: string): Promise<Page | null> {
      const { dbSelectPageById } = await import("@/db/queries/content");
      const row = await dbSelectPageById(pageId);
      return row ? rowToPage(row) : null;
    },

    async listPages(): Promise<Page[]> {
      const { dbSelectAllPages } = await import("@/db/queries/content");
      const rows = await dbSelectAllPages();
      return rows.map(rowToPage);
    },

    async updatePage(
      pageId: string,
      input: UpdatePageInput,
    ): Promise<Page | null> {
      const { dbUpdatePage } = await import("@/db/queries/content");
      const row = await dbUpdatePage(pageId, {
        title: input.title,
        seo: input.seo,
      });
      return row ? rowToPage(row) : null;
    },

    async deletePage(pageId: string): Promise<boolean> {
      const { dbSelectPageById } = await import("@/db/queries/content");
      const existing = await dbSelectPageById(pageId);

      if (!existing) {
        return false;
      }

      const { db } = await import("@/db");
      const { sql } = await import("drizzle-orm");

      /**
       * Keep this adapter self-contained instead of requiring a third query-helper
       * file change. The table names match the CMS schema used by
       * db/queries/content.ts.
       *
       * Delete versions first so this works even if the FK is not configured
       * with ON DELETE CASCADE in a local/dev database.
       */
      await db.execute(
        sql`delete from page_versions where page_id = ${pageId}`,
      );
      await db.execute(sql`delete from pages where id = ${pageId}`);

      return true;
    },

    async createPageVersion(
      input: CreatePageVersionInput,
    ): Promise<PageVersion> {
      const { dbInsertPageVersion } = await import("@/db/queries/content");
      const row = await dbInsertPageVersion({
        pageId: input.pageId,
        blocks: input.blocks as unknown[],
        createdBy: input.createdBy,
      });
      return rowToVersion(row);
    },

    async listPageVersions(pageId: string): Promise<PageVersion[]> {
      const { dbSelectPageVersionsByPageId } =
        await import("@/db/queries/content");
      const rows = await dbSelectPageVersionsByPageId(pageId);
      return rows.map(rowToVersion);
    },

    async publishPage(pageId: string, versionId: string): Promise<Page> {
      const { dbUpdatePagePublish } = await import("@/db/queries/content");
      const row = await dbUpdatePagePublish(pageId, versionId);
      return rowToPage(row);
    },

    async unpublishPage(pageId: string): Promise<Page> {
      const { dbUpdatePageUnpublish } = await import("@/db/queries/content");
      const row = await dbUpdatePageUnpublish(pageId);
      return rowToPage(row);
    },

    async getPublishedPage(
      slug: string,
    ): Promise<{ page: Page; version: PageVersion } | null> {
      const { dbSelectPageBySlug, dbSelectPageVersionById } =
        await import("@/db/queries/content");

      const pageRow = await dbSelectPageBySlug(slug);
      if (
        !pageRow ||
        pageRow.status !== "published" ||
        !pageRow.publishedVersionId
      ) {
        return null;
      }

      const versionRow = await dbSelectPageVersionById(
        pageRow.publishedVersionId,
      );
      if (!versionRow) return null;

      return { page: rowToPage(pageRow), version: rowToVersion(versionRow) };
    },

    async getThemeSettings(): Promise<ThemeSettings | null> {
      const { dbSelectThemeSettings } = await import("@/db/queries/content");
      const row = await dbSelectThemeSettings();

      return row
        ? {
            id: row.id,
            tokens: row.tokens as Record<string, unknown>,
            updatedAt: row.updatedAt,
          }
        : null;
    },

    async saveThemeSettings(
      tokens: Record<string, unknown>,
      createdBy: string = "unknown",
    ): Promise<ThemeSettings> {
      const { dbUpsertThemeSettings, dbInsertThemeVersion } =
        await import("@/db/queries/content");

      // Dual-write: update singleton + append immutable version row
      const [row] = await Promise.all([
        dbUpsertThemeSettings(tokens),
        dbInsertThemeVersion({ tokens, createdBy }),
      ]);

      return {
        id: row.id,
        tokens: row.tokens as Record<string, unknown>,
        updatedAt: row.updatedAt,
      };
    },

    async listThemeVersions(): Promise<ThemeVersion[]> {
      const { dbSelectThemeVersions } = await import("@/db/queries/content");
      const rows = await dbSelectThemeVersions();
      return rows.map(rowToThemeVersion);
    },

    async getThemeVersion(id: string): Promise<ThemeVersion | null> {
      const { dbSelectThemeVersionById } = await import("@/db/queries/content");
      const row = await dbSelectThemeVersionById(id);
      return row ? rowToThemeVersion(row) : null;
    },

    async getMenu(slot: MenuSlot): Promise<NavigationMenu | null> {
      const { dbSelectMenu } = await import("@/db/queries/content");
      const row = await dbSelectMenu(slot);

      return row
        ? {
            id: row.id,
            slot: row.slot,
            items: row.items as unknown[],
            updatedAt: row.updatedAt,
          }
        : null;
    },

    async saveMenu(slot: MenuSlot, items: unknown[]): Promise<NavigationMenu> {
      const { dbUpsertMenu } = await import("@/db/queries/content");
      const row = await dbUpsertMenu(slot, items);

      return {
        id: row.id,
        slot: row.slot,
        items: row.items as unknown[],
        updatedAt: row.updatedAt,
      };
    },

    async createRedirect(fromPath: string, toPath: string): Promise<Redirect> {
      const { dbInsertRedirect } = await import("@/db/queries/content");
      const row = await dbInsertRedirect(fromPath, toPath);
      return rowToRedirect(row);
    },

    async getRedirect(fromPath: string): Promise<Redirect | null> {
      const { dbSelectRedirect } = await import("@/db/queries/content");
      const row = await dbSelectRedirect(fromPath);
      return row ? rowToRedirect(row) : null;
    },

    async listRedirects(): Promise<Redirect[]> {
      const { dbSelectAllRedirects } = await import("@/db/queries/content");
      const rows = await dbSelectAllRedirects();
      return rows.map(rowToRedirect);
    },

    async deleteRedirect(fromPath: string): Promise<boolean> {
      const { dbDeleteRedirect } = await import("@/db/queries/content");
      return dbDeleteRedirect(fromPath);
    },
  };
}

// ── Row mappers ───────────────────────────────────────────────────────────────

import type {
  PageRow,
  PageVersionRow,
  RedirectRow,
  ThemeVersionRow,
} from "@/db/queries/content";

function rowToPage(row: PageRow): Page {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status as PageStatus,
    seo: row.seo as Record<string, unknown> | null,
    publishedVersionId: row.publishedVersionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToVersion(row: PageVersionRow): PageVersion {
  return {
    id: row.id,
    pageId: row.pageId,
    blocks: row.blocks as unknown[],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function rowToRedirect(row: RedirectRow): Redirect {
  return {
    id: row.id,
    fromPath: row.fromPath,
    toPath: row.toPath,
    createdAt: row.createdAt,
  };
}

function rowToThemeVersion(row: ThemeVersionRow): ThemeVersion {
  return {
    id: row.id,
    tokens: row.tokens as Record<string, unknown>,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}
