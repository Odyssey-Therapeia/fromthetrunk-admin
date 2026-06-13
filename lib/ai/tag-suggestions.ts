import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/db";
import { tags } from "@/db/schema";

type SuggestTagsInput = {
  detailsDesigner?: null | string;
  detailsFabric?: null | string;
  storyEra?: null | string;
  storyNarrative?: null | string;
  storyProvenance?: null | string;
  storyTitle?: null | string;
};

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const unique = <T>(values: T[]) => Array.from(new Set(values));

export const suggestTagIds = async (input: SuggestTagsInput, limit = 8) => {
  const phrase = [
    input.storyTitle,
    input.storyNarrative,
    input.storyProvenance,
    input.storyEra,
    input.detailsFabric,
    input.detailsDesigner,
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" ");

  if (!phrase.trim()) return [];

  const tokens = unique(tokenize(phrase));
  if (tokens.length === 0) return [];

  const clauses = tokens.map((token) =>
    or(ilike(tags.name, `%${token}%`), ilike(tags.slug, `%${token}%`), ilike(tags.category, `%${token}%`))
  );

  const queryFilter =
    clauses.length === 1
      ? clauses[0]
      : and(...clauses);

  const matched = await db
    .select()
    .from(tags)
    .where(queryFilter)
    .orderBy(desc(tags.updatedAt))
    .limit(limit * 2);

  if (matched.length === 0) {
    const fallback = await db
      .select()
      .from(tags)
      .where(eq(tags.category, "occasion"))
      .limit(limit);
    return fallback;
  }

  const scored = matched
    .map((tag) => {
      const haystack = `${tag.name} ${tag.slug} ${tag.category}`.toLowerCase();
      const score = tokens.reduce(
        (sum, token) => (haystack.includes(token) ? sum + 1 : sum),
        0
      );
      return { score, tag };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.tag);

  return scored;
};
