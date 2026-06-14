/**
 * P3-01: Raw Drizzle queries for the content / CMS tables.
 *
 * These functions are consumed by the Drizzle content-store adapter
 * (lib/adapters/drizzle-content-store.ts). Keep them free of business logic —
 * validation (reserved slugs, FK checks) belongs in the adapter.
 */

import { desc, eq } from "drizzle-orm";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db } from "@/db";
import {
  navigationMenus,
  pageVersions,
  pages,
  redirects,
  themeSettings,
  themeVersions,
} from "@/db/schema";

// ── Exported row types ────────────────────────────────────────────────────────

export type PageRow = InferSelectModel<typeof pages>;
export type PageVersionRow = InferSelectModel<typeof pageVersions>;
export type ThemeSettingsRow = InferSelectModel<typeof themeSettings>;
export type ThemeVersionRow = InferSelectModel<typeof themeVersions>;
export type NavigationMenuRow = InferSelectModel<typeof navigationMenus>;
export type RedirectRow = InferSelectModel<typeof redirects>;

// ── Pages ─────────────────────────────────────────────────────────────────────

export type InsertPageInput = Omit<InferInsertModel<typeof pages>, "id" | "createdAt" | "updatedAt">;

export async function dbInsertPage(input: InsertPageInput): Promise<PageRow> {
  const [row] = await db.insert(pages).values(input).returning();
  return row;
}

export async function dbSelectPageBySlug(slug: string): Promise<PageRow | null> {
  const [row] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  return row ?? null;
}

export async function dbSelectPageById(id: string): Promise<PageRow | null> {
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return row ?? null;
}

export async function dbSelectAllPages(): Promise<PageRow[]> {
  return db.select().from(pages);
}

export type UpdatePageFields = { title?: string; seo?: Record<string, unknown> | null };

export async function dbUpdatePage(
  pageId: string,
  fields: UpdatePageFields
): Promise<PageRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.title !== undefined) set.title = fields.title;
  if (fields.seo !== undefined) set.seo = fields.seo;

  const [row] = await db
    .update(pages)
    .set(set)
    .where(eq(pages.id, pageId))
    .returning();
  return row ?? null;
}

export async function dbUpdatePagePublish(
  pageId: string,
  versionId: string
): Promise<PageRow> {
  const [row] = await db
    .update(pages)
    .set({ status: "published", publishedVersionId: versionId, updatedAt: new Date() })
    .where(eq(pages.id, pageId))
    .returning();
  return row;
}

/** Clears published_version_id and sets status back to draft. */
export async function dbUpdatePageUnpublish(pageId: string): Promise<PageRow> {
  const [row] = await db
    .update(pages)
    .set({ status: "draft", publishedVersionId: null, updatedAt: new Date() })
    .where(eq(pages.id, pageId))
    .returning();
  return row;
}

// ── Page versions ─────────────────────────────────────────────────────────────

export type InsertPageVersionInput = Omit<InferInsertModel<typeof pageVersions>, "id" | "createdAt">;

export async function dbInsertPageVersion(
  input: InsertPageVersionInput
): Promise<PageVersionRow> {
  const [row] = await db.insert(pageVersions).values(input).returning();
  return row;
}

export async function dbSelectPageVersionById(id: string): Promise<PageVersionRow | null> {
  const [row] = await db.select().from(pageVersions).where(eq(pageVersions.id, id)).limit(1);
  return row ?? null;
}

export async function dbSelectPageVersionsByPageId(pageId: string): Promise<PageVersionRow[]> {
  return db
    .select()
    .from(pageVersions)
    .where(eq(pageVersions.pageId, pageId))
    .orderBy(desc(pageVersions.createdAt));
}

// ── Theme settings (singleton row, id = 1) ────────────────────────────────────

export async function dbSelectThemeSettings(): Promise<ThemeSettingsRow | null> {
  const [row] = await db.select().from(themeSettings).where(eq(themeSettings.id, 1)).limit(1);
  return row ?? null;
}

export async function dbUpsertThemeSettings(
  tokens: Record<string, unknown>
): Promise<ThemeSettingsRow> {
  const [row] = await db
    .insert(themeSettings)
    .values({ id: 1, tokens, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: themeSettings.id,
      set: { tokens, updatedAt: new Date() },
    })
    .returning();
  return row;
}

// ── Theme versions ────────────────────────────────────────────────────────────

export type InsertThemeVersionInput = Omit<
  InferInsertModel<typeof themeVersions>,
  "id" | "createdAt"
>;

export async function dbInsertThemeVersion(
  input: InsertThemeVersionInput
): Promise<ThemeVersionRow> {
  const [row] = await db.insert(themeVersions).values(input).returning();
  return row;
}

export async function dbSelectThemeVersions(): Promise<ThemeVersionRow[]> {
  return db
    .select()
    .from(themeVersions)
    .orderBy(desc(themeVersions.createdAt));
}

export async function dbSelectThemeVersionById(
  id: string
): Promise<ThemeVersionRow | null> {
  const [row] = await db
    .select()
    .from(themeVersions)
    .where(eq(themeVersions.id, id))
    .limit(1);
  return row ?? null;
}

// ── Navigation menus ──────────────────────────────────────────────────────────

export async function dbSelectMenu(
  slot: "header" | "footer"
): Promise<NavigationMenuRow | null> {
  const [row] = await db
    .select()
    .from(navigationMenus)
    .where(eq(navigationMenus.slot, slot))
    .limit(1);
  return row ?? null;
}

export async function dbUpsertMenu(
  slot: "header" | "footer",
  items: unknown[]
): Promise<NavigationMenuRow> {
  const [row] = await db
    .insert(navigationMenus)
    .values({ slot, items, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: navigationMenus.slot,
      set: { items, updatedAt: new Date() },
    })
    .returning();
  return row;
}

// ── Redirects ─────────────────────────────────────────────────────────────────

export async function dbInsertRedirect(
  fromPath: string,
  toPath: string
): Promise<RedirectRow> {
  const [row] = await db.insert(redirects).values({ fromPath, toPath }).returning();
  return row;
}

export async function dbSelectRedirect(fromPath: string): Promise<RedirectRow | null> {
  const [row] = await db
    .select()
    .from(redirects)
    .where(eq(redirects.fromPath, fromPath))
    .limit(1);
  return row ?? null;
}

export async function dbSelectAllRedirects(): Promise<RedirectRow[]> {
  return db.select().from(redirects).orderBy(desc(redirects.createdAt));
}

export async function dbDeleteRedirect(fromPath: string): Promise<boolean> {
  const result = await db
    .delete(redirects)
    .where(eq(redirects.fromPath, fromPath))
    .returning();
  return result.length > 0;
}
