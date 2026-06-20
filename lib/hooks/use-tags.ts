"use client";

/**
 * lib/hooks/use-tags.ts
 *
 * React Query access to the tags API. `useTags()` lists; `useCreateTag()` creates
 * and merges the new tag into the cached list so the picker shows it immediately.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Tag = {
  id: number;
  name: string;
  slug: string;
  category: string | null;
};

const TAGS_QUERY_KEY = ["admin", "tags"] as const;

async function fetchTags(): Promise<Tag[]> {
  const res = await fetch("/api/v2/tags");
  if (!res.ok) throw new Error("Failed to load tags.");
  const data = (await res.json()) as { tags?: Tag[] };
  return Array.isArray(data.tags) ? data.tags : [];
}

export function useTags() {
  return useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: fetchTags,
    staleTime: 5 * 60 * 1000,
  });
}

export type CreateTagInput = { name: string; category?: string | null };

async function createTagRequest(input: CreateTagInput): Promise<Tag> {
  const res = await fetch("/api/v2/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let message = "Failed to create tag.";
    try {
      const data = (await res.json()) as { message?: string };
      if (typeof data.message === "string" && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // no-op
    }
    throw new Error(message);
  }
  return (await res.json()) as Tag;
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTagRequest,
    onSuccess: (tag) => {
      // Merge into the cached list (skip if already present — create is
      // idempotent-by-slug, so re-creating an existing tag returns that row).
      queryClient.setQueryData<Tag[]>(TAGS_QUERY_KEY, (old) => {
        const list = old ?? [];
        if (list.some((t) => t.id === tag.id)) return list;
        return [...list, tag].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
  });
}
