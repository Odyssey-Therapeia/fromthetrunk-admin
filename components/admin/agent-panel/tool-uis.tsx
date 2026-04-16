"use client";

import { useState } from "react";
import {
  type ToolCallMessagePartStatus,
  useAssistantToolUI,
} from "@assistant-ui/react";
import { AlertCircle, Check, Copy, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function ToolCallWrapper({
  children,
  label,
  status,
}: {
  children: React.ReactNode;
  label: string;
  status: ToolCallMessagePartStatus | undefined;
}) {
  if (!status || status.type === "running") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-[#2a2a2a] p-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#c9a96e]" />
        <span className="text-xs text-[#999]">
          Running <span className="font-medium text-[#ccc]">{label}</span>...
        </span>
      </div>
    );
  }

  if (status.type === "incomplete") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-800/40 bg-red-950/30 p-3">
        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
        <span className="text-xs text-red-400">{label} failed to complete.</span>
      </div>
    );
  }

  return <>{children}</>;
}

function SuggestNamesToolUI({
  result,
  status,
}: {
  result: { names?: string[] } | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (name: string) => {
    navigator.clipboard.writeText(name).then(
      () => {
        setCopied(name);
        toast.success(`Copied: ${name}`);
      },
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <ToolCallWrapper label="suggestNames" status={status}>
      {result?.names?.length ? (
        <div className="space-y-2 rounded-lg border border-[#333] bg-[#222] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#999]">
            <Wrench className="h-3 w-3" /> Name suggestions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.names.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleCopy(name)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-[#444] px-3 py-1 text-xs transition-colors",
                  copied === name
                    ? "border-[#c9a96e] bg-[#c9a96e]/10 text-[#c9a96e]"
                    : "text-[#ccc] hover:border-[#c9a96e]/50 hover:bg-[#2a2a2a]",
                )}
              >
                {copied === name && <Check className="h-3 w-3" />}
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

function DraftStoryToolUI({
  result,
  status,
}: {
  result: {
    storyTitle?: string;
    storyNarrative?: string;
    storyProvenance?: string;
    storyEra?: string;
  } | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const handleCopy = () => {
    const text = [
      result?.storyTitle,
      result?.storyNarrative,
      result?.storyProvenance && `Provenance: ${result.storyProvenance}`,
      result?.storyEra && `Era: ${result.storyEra}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("Story copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <ToolCallWrapper label="draftStory" status={status}>
      {result?.storyNarrative ? (
        <div className="space-y-2 rounded-lg border border-[#333] bg-[#222] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#999]">
            <Wrench className="h-3 w-3" /> Drafted story
          </p>
          {result.storyTitle && (
            <p className="text-sm font-semibold text-[#e5e5e5]">{result.storyTitle}</p>
          )}
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#aaa]">
            {result.storyNarrative}
          </p>
          {result.storyProvenance && (
            <p className="text-xs text-[#ccc]">
              <span className="font-medium">Provenance:</span> {result.storyProvenance}
            </p>
          )}
          {result.storyEra && (
            <p className="text-xs text-[#ccc]">
              <span className="font-medium">Era:</span> {result.storyEra}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            type="button"
            className="mt-1 border-[#444] bg-transparent text-[#ccc] hover:bg-[#333]"
          >
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

function SuggestTagsToolUI({
  result,
  status,
}: {
  result: { tags?: Array<{ id: number; name: string; category: string }> } | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const handleCopy = () => {
    const ids = result?.tags?.map((t) => t.id).join(", ") ?? "";
    navigator.clipboard.writeText(ids).then(
      () => toast.success(`Copied ${result?.tags?.length ?? 0} tag IDs`),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <ToolCallWrapper label="suggestTags" status={status}>
      {result?.tags?.length ? (
        <div className="space-y-2 rounded-lg border border-[#333] bg-[#222] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#999]">
            <Wrench className="h-3 w-3" /> Matching tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="border-[#444] text-xs text-[#ccc]"
              >
                {tag.name}{" "}
                <span className="ml-1 text-[#777]">#{tag.id}</span>
              </Badge>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            type="button"
            className="mt-1 border-[#444] bg-transparent text-[#ccc] hover:bg-[#333]"
          >
            <Copy className="mr-1 h-3 w-3" /> Copy IDs
          </Button>
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

function GenerateSlugToolUI({
  result,
  status,
}: {
  result: { slug?: string } | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const handleCopy = () => {
    if (!result?.slug) return;
    navigator.clipboard.writeText(result.slug).then(
      () => toast.success(`Copied slug: ${result.slug}`),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <ToolCallWrapper label="generateSlug" status={status}>
      {result?.slug ? (
        <div className="space-y-2 rounded-lg border border-[#333] bg-[#222] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#999]">
            <Wrench className="h-3 w-3" /> Generated slug
          </p>
          <code className="block rounded bg-[#1a1a1a] px-2 py-1 text-xs text-[#c9a96e]">
            {result.slug}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            type="button"
            className="mt-1 border-[#444] bg-transparent text-[#ccc] hover:bg-[#333]"
          >
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

function DraftMarketingCopyToolUI({
  result,
  status,
}: {
  result: {
    shortDescription?: string;
    seoTitle?: string;
    seoDescription?: string;
  } | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <ToolCallWrapper label="draftMarketingCopy" status={status}>
      {result?.shortDescription || result?.seoTitle ? (
        <div className="space-y-2 rounded-lg border border-[#333] bg-[#222] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#999]">
            <Wrench className="h-3 w-3" /> Marketing copy
          </p>
          {result.shortDescription && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#ccc]">Short description</p>
              <p className="text-xs text-[#aaa]">{result.shortDescription}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(result.shortDescription!)}
                type="button"
                className="h-6 px-2 text-xs text-[#999] hover:text-[#ccc]"
              >
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
            </div>
          )}
          {result.seoTitle && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#ccc]">SEO title</p>
              <p className="text-xs text-[#aaa]">{result.seoTitle}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(result.seoTitle!)}
                type="button"
                className="h-6 px-2 text-xs text-[#999] hover:text-[#ccc]"
              >
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
            </div>
          )}
          {result.seoDescription && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#ccc]">Meta description</p>
              <p className="text-xs text-[#aaa]">{result.seoDescription}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(result.seoDescription!)}
                type="button"
                className="h-6 px-2 text-xs text-[#999] hover:text-[#ccc]"
              >
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

function CreateProductToolUI({
  result,
  status,
}: {
  result:
    | {
        name?: string;
        slug?: string;
        pricePaise?: number;
        storyTitle?: string;
        storyNarrative?: string;
        detailsFabric?: string;
        confirmationRequired?: boolean;
      }
    | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const handleCreate = async () => {
    if (!result?.name || !result?.storyTitle) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v2/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.name,
          slug: result.slug || result.name.toLowerCase().replace(/\s+/g, "-"),
          pricePaise: result.pricePaise || 0,
          storyTitle: result.storyTitle,
          storyNarrative: result.storyNarrative || null,
          detailsFabric: result.detailsFabric || null,
          status: "draft",
          stockStatus: "available",
          featured: false,
          imageMediaIds: [],
          tagIds: [],
        }),
      });
      if (!res.ok) throw new Error("Failed to create product");
      setCreated(true);
      toast.success(`Created: ${result.name}`);
    } catch {
      toast.error("Failed to create product");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ToolCallWrapper label="createProduct" status={status}>
      {result?.confirmationRequired && result.name ? (
        <div className="space-y-2 rounded-lg border border-[#c9a96e]/30 bg-[#222] p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[#c9a96e]">
            <Wrench className="h-3 w-3" /> Proposed product
          </p>
          <p className="text-sm font-semibold text-[#e5e5e5]">{result.name}</p>
          {result.storyTitle && (
            <p className="text-xs text-[#aaa]">Story: {result.storyTitle}</p>
          )}
          {result.detailsFabric && (
            <p className="text-xs text-[#aaa]">Fabric: {result.detailsFabric}</p>
          )}
          {result.pricePaise != null && result.pricePaise > 0 && (
            <p className="text-xs text-[#aaa]">
              Price: ₹{(result.pricePaise / 100).toLocaleString("en-IN")}
            </p>
          )}
          {created ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="mt-1 border-green-600 text-green-400"
            >
              <Check className="mr-1 h-3 w-3" /> Created
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              className="mt-1 bg-[#c9a96e] text-[#1a1a1a] hover:bg-[#b8984e]"
            >
              {creating ? "Creating..." : "Create Product"}
            </Button>
          )}
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

/** Register all product tool UIs for the agent panel. */
export function AgentToolUIRegistrations() {
  useAssistantToolUI({
    toolName: "suggestNames",
    render: ({ result, status }) => (
      <SuggestNamesToolUI
        result={result as { names?: string[] } | undefined}
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "draftStory",
    render: ({ result, status }) => (
      <DraftStoryToolUI
        result={result as Record<string, string> | undefined}
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "suggestTags",
    render: ({ result, status }) => (
      <SuggestTagsToolUI
        result={
          result as
            | { tags?: Array<{ id: number; name: string; category: string }> }
            | undefined
        }
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "generateSlug",
    render: ({ result, status }) => (
      <GenerateSlugToolUI
        result={result as { slug?: string } | undefined}
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "draftMarketingCopy",
    render: ({ result, status }) => (
      <DraftMarketingCopyToolUI
        result={
          result as
            | { shortDescription?: string; seoTitle?: string; seoDescription?: string }
            | undefined
        }
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "createProduct",
    render: ({ result, status }) => (
      <CreateProductToolUI
        result={
          result as
            | {
                name?: string;
                slug?: string;
                pricePaise?: number;
                storyTitle?: string;
                storyNarrative?: string;
                detailsFabric?: string;
                confirmationRequired?: boolean;
              }
            | undefined
        }
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  return null;
}
