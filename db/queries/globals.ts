import { eq } from "drizzle-orm";

import { db } from "@/db";
import { siteConfig } from "@/db/schema";

export type SiteConfigContent = Record<string, unknown>;
export type SiteConfigSlug =
  | "collectionPage"
  | "homePage"
  | "howItWorksPage"
  | "ourStoryPage"
  | string;

export const getGlobal = async <TContent extends SiteConfigContent = SiteConfigContent>(
  slug: SiteConfigSlug
): Promise<TContent | null> => {
  const [row] = await db
    .select({ content: siteConfig.content })
    .from(siteConfig)
    .where(eq(siteConfig.slug, slug))
    .limit(1);

  return (row?.content as TContent | undefined) ?? null;
};

export const setGlobal = async <TContent extends SiteConfigContent = SiteConfigContent>(
  slug: SiteConfigSlug,
  content: TContent
): Promise<TContent> => {
  await db
    .insert(siteConfig)
    .values({
      slug,
      content,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteConfig.slug,
      set: {
        content,
        updatedAt: new Date(),
      },
    });

  return content;
};
