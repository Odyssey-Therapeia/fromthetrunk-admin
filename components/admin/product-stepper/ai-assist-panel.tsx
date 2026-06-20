"use client";

import { useMemo, useCallback, useState } from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type ToolCallMessagePartStatus,
  useAssistantToolUI,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  SendHorizontal,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, slugify } from "@/lib/utils";

import type { ProductStepperMedia, ProductStepperValues } from "./types";

/** Loose form interface compatible with TanStack React Form. */
export interface StepperForm {
  state: { values: ProductStepperValues };
  setFieldValue(
    field: string,
    value: string | number | boolean | string[],
  ): void;
}

export type AiAssistPanelProps = {
  form: StepperForm;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  stepIndex: number;
  uploaded: ProductStepperMedia[];
};

// P4-02: steps updated to match stepper.tsx (Type, Photos, Details, Attributes, Story, Pricing, Preview)
const STEPS = [
  "Type",
  "Photos",
  "Details",
  "Attributes",
  "Story",
  "Pricing",
  "Preview",
] as const;

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
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">
          Running <span className="font-medium">{label}</span>...
        </span>
      </div>
    );
  }

  if (status.type === "incomplete") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        <span className="text-xs text-destructive">
          {label} failed to complete.
        </span>
      </div>
    );
  }

  return <>{children}</>;
}

function SuggestNamesToolUI({
  form,
  result,
  status,
}: {
  form: StepperForm;
  result: { names?: string[] } | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const [applied, setApplied] = useState<string | null>(null);

  const handleApply = (name: string) => {
    form.setFieldValue("name", name);
    form.setFieldValue("slug", slugify(name));
    setApplied(name);
    toast.success(`Applied name: ${name}`);
  };

  return (
    <ToolCallWrapper label="suggestNames" status={status}>
      {result?.names?.length ? (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" /> Name suggestions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.names.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleApply(name)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  applied === name
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:border-primary/50 hover:bg-muted",
                )}
              >
                {applied === name && <Check className="h-3 w-3" />}
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
  form,
  result,
  status,
}: {
  form: StepperForm;
  result:
    | {
        storyTitle?: string;
        storyNarrative?: string;
        storyProvenance?: string;
        storyEra?: string;
      }
    | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    if (result?.storyTitle) form.setFieldValue("storyTitle", result.storyTitle);
    if (result?.storyNarrative)
      form.setFieldValue("storyNarrative", result.storyNarrative);
    if (result?.storyProvenance)
      form.setFieldValue("storyProvenance", result.storyProvenance);
    if (result?.storyEra) form.setFieldValue("storyEra", result.storyEra);
    setApplied(true);
    toast.success("Story applied to form");
  };

  return (
    <ToolCallWrapper label="draftStory" status={status}>
      {result?.storyNarrative ? (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" /> Drafted story
          </p>
          {result.storyTitle && (
            <p className="text-sm font-semibold">{result.storyTitle}</p>
          )}
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {result.storyNarrative}
          </p>
          {result.storyProvenance && (
            <p className="text-xs">
              <span className="font-medium">Provenance:</span>{" "}
              {result.storyProvenance}
            </p>
          )}
          {result.storyEra && (
            <p className="text-xs">
              <span className="font-medium">Era:</span> {result.storyEra}
            </p>
          )}
          <Button
            size="sm"
            variant={applied ? "secondary" : "default"}
            onClick={handleApply}
            type="button"
            className="mt-1"
          >
            {applied ? (
              <>
                <Check className="mr-1 h-3 w-3" /> Applied
              </>
            ) : (
              "Apply to form"
            )}
          </Button>
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

function SuggestTagsToolUI({
  form,
  result,
  status,
}: {
  form: StepperForm;
  result:
    | { tags?: Array<{ id: number; name: string; category: string }> }
    | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    const tags = result?.tags ?? [];
    const ids = tags.map((tag) => tag.id).join(", ");
    form.setFieldValue("tagsCsv", ids);
    setApplied(true);
    toast.success(`Applied ${tags.length} tags`);
  };

  return (
    <ToolCallWrapper label="suggestTags" status={status}>
      {result?.tags?.length ? (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" /> Matching tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.tags.map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-xs">
                {tag.name}{" "}
                <span className="ml-1 text-muted-foreground">#{tag.id}</span>
              </Badge>
            ))}
          </div>
          <Button
            size="sm"
            variant={applied ? "secondary" : "default"}
            onClick={handleApply}
            type="button"
            className="mt-1"
          >
            {applied ? (
              <>
                <Check className="mr-1 h-3 w-3" /> Applied
              </>
            ) : (
              "Apply all to form"
            )}
          </Button>
        </div>
      ) : null}
    </ToolCallWrapper>
  );
}

function GenerateSlugToolUI({
  form,
  result,
  status,
}: {
  form: StepperForm;
  result: { slug?: string } | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    const slug = result?.slug;
    if (!slug) return;
    form.setFieldValue("slug", slug);
    setApplied(true);
    toast.success(`Slug set: ${slug}`);
  };

  return (
    <ToolCallWrapper label="generateSlug" status={status}>
      {result?.slug ? (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" /> Generated slug
          </p>
          <code className="block rounded bg-muted px-2 py-1 text-xs">
            {result.slug}
          </code>
          <Button
            size="sm"
            variant={applied ? "secondary" : "default"}
            onClick={handleApply}
            type="button"
            className="mt-1"
          >
            {applied ? (
              <>
                <Check className="mr-1 h-3 w-3" /> Applied
              </>
            ) : (
              "Apply to form"
            )}
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
  result:
    | {
        shortDescription?: string;
        seoTitle?: string;
        seoDescription?: string;
      }
    | undefined;
  status: ToolCallMessagePartStatus | undefined;
}) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Failed to copy — try selecting the text manually"),
    );
  };

  return (
    <ToolCallWrapper label="draftMarketingCopy" status={status}>
      {result?.shortDescription || result?.seoTitle ? (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3 w-3" /> Marketing copy
          </p>
          {result.shortDescription && (
            <div className="space-y-1">
              <p className="text-xs font-medium">Short description</p>
              <p className="text-xs text-muted-foreground">
                {result.shortDescription}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(result.shortDescription!)}
                type="button"
                className="h-6 px-2 text-xs"
              >
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
            </div>
          )}
          {result.seoTitle && (
            <div className="space-y-1">
              <p className="text-xs font-medium">SEO title</p>
              <p className="text-xs text-muted-foreground">{result.seoTitle}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(result.seoTitle!)}
                type="button"
                className="h-6 px-2 text-xs"
              >
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
            </div>
          )}
          {result.seoDescription && (
            <div className="space-y-1">
              <p className="text-xs font-medium">Meta description</p>
              <p className="text-xs text-muted-foreground">
                {result.seoDescription}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(result.seoDescription!)}
                type="button"
                className="h-6 px-2 text-xs"
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

function ToolUIRegistrations({ form }: { form: StepperForm }) {
  useAssistantToolUI({
    toolName: "suggestNames",
    render: ({ result, status }) => (
      <SuggestNamesToolUI
        result={result as { names?: string[] } | undefined}
        form={form}
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "draftStory",
    render: ({ result, status }) => (
      <DraftStoryToolUI
        result={
          result as
            | {
                storyTitle?: string;
                storyNarrative?: string;
                storyProvenance?: string;
                storyEra?: string;
              }
            | undefined
        }
        form={form}
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
            | {
                tags?: Array<{
                  id: number;
                  name: string;
                  category: string;
                }>;
              }
            | undefined
        }
        form={form}
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  useAssistantToolUI({
    toolName: "generateSlug",
    render: ({ result, status }) => (
      <GenerateSlugToolUI
        result={result as { slug?: string } | undefined}
        form={form}
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
            | {
                shortDescription?: string;
                seoTitle?: string;
                seoDescription?: string;
              }
            | undefined
        }
        status={status as ToolCallMessagePartStatus | undefined}
      />
    ),
  });

  return null;
}

function ThinkingIndicator() {
  return (
    <ThreadPrimitive.If running>
      <div className="flex items-center gap-2 px-1 py-2">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
        </div>
        <span className="text-xs text-muted-foreground">Thinking...</span>
      </div>
    </ThreadPrimitive.If>
  );
}

function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-smooth px-3 pt-4 pb-2">
        <ThreadWelcome />
        <ThreadPrimitive.Messages
          components={{ AssistantMessage, UserMessage }}
        />
        <ThinkingIndicator />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

function ThreadWelcome() {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">FTT Product Assistant</p>
          <p className="max-w-60 text-xs text-muted-foreground">
            I can help you name products, draft stories, suggest tags, and
            create marketing copy.
          </p>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="relative flex items-end gap-2 border-t bg-background px-3 py-3">
      <ComposerPrimitive.Input
        autoFocus
        placeholder="Ask for help with this listing..."
        className="min-h-10 flex-1 resize-none rounded-lg border bg-muted/40 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
        rows={1}
      />
      <ComposerPrimitive.Send asChild>
        <Button
          size="icon"
          variant="default"
          className="h-10 w-10 shrink-0"
          aria-label="Send message"
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm",
          "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
        )}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * Runtime hook that lives in the stepper — persists across Sheet open/close.
 * Generates a stable conversationId per stepper mount and passes it + productId
 * to the API so conversations are persisted and scoped per user.
 */
export function useProductAssistantRuntime({
  form,
  productId,
  stepIndex,
  uploaded,
}: {
  form: StepperForm;
  productId?: string | null;
  stepIndex: number;
  uploaded: ProductStepperMedia[];
}) {
  const [conversationId] = useState(() => crypto.randomUUID());

  const getFormContext = useCallback(
    () => ({
      conversationId,
      productId: productId ?? undefined,
      formContext: {
        currentStep: STEPS[stepIndex] ?? STEPS[0],
        values: form.state.values,
        uploadedImageCount: uploaded.length,
        uploadedImageFilenames: uploaded.map((m) => m.filename),
      },
    }),
    [conversationId, form, productId, stepIndex, uploaded],
  );

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: getFormContext,
      }),
    [getFormContext],
  );

  return useChatRuntime({
    transport,
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "AI request failed";
      toast.error(message);
    },
  });
}

export function AiAssistPanel({
  form,
  onOpenChange,
  open,
  stepIndex,
}: Omit<AiAssistPanelProps, "uploaded">) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Product Assistant
          </SheetTitle>
          <SheetDescription className="text-xs">
            Currently on: {STEPS[stepIndex]}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <ToolUIRegistrations form={form} />
          <ChatThread />
        </div>
      </SheetContent>
    </Sheet>
  );
}
