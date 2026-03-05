"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const globalSlugs = ["homePage", "collectionPage", "ourStoryPage", "howItWorksPage"] as const;

export default function AdminGlobalsPage() {
  const [activeSlug, setActiveSlug] = useState<(typeof globalSlugs)[number]>("homePage");
  const [contentBySlug, setContentBySlug] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const loadGlobal = async (slug: (typeof globalSlugs)[number]): Promise<string> => {
    const response = await fetch(`/api/v2/globals/${slug}`);
    if (!response.ok) {
      return "{}";
    }

    const data = (await response.json()) as { content: Record<string, unknown> };
    return JSON.stringify(data.content ?? {}, null, 2);
  };

  const { data: fetchedContent = "{}" } = useQuery({
    queryKey: ["admin-global", activeSlug],
    queryFn: async () => await loadGlobal(activeSlug),
  });

  const content = contentBySlug[activeSlug] ?? fetchedContent;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Globals</h2>
        <p className="text-sm text-muted-foreground">Edit page-level content JSON.</p>
      </div>

      <Tabs onValueChange={(value) => setActiveSlug(value as typeof activeSlug)} value={activeSlug}>
        <TabsList>
          {globalSlugs.map((slug) => (
            <TabsTrigger key={slug} value={slug}>
              {slug}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Textarea
        className="min-h-[360px] font-mono text-xs"
        onChange={(event) =>
          setContentBySlug((prev) => ({
            ...prev,
            [activeSlug]: event.target.value,
          }))
        }
        value={content}
      />

      <div className="flex items-center gap-3">
        <Button
          onClick={async () => {
            try {
              const parsed = JSON.parse(content);
              const response = await fetch(`/api/v2/globals/${activeSlug}`, {
                body: JSON.stringify({ content: parsed }),
                headers: {
                  "Content-Type": "application/json",
                },
                method: "PATCH",
              });
              setStatus(response.ok ? "Saved" : `Save failed (${response.status})`);
            } catch {
              setStatus("Invalid JSON");
            }
          }}
          type="button"
        >
          Save Global
        </Button>
        <p className="text-xs text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}
