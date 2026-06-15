"use client";

/**
 * P3-05: Page editor — block composer.
 * P3-06: Added Publish / Unpublish / Preview controls.
 *
 * Shopify section-list model: ordered block list, no free-form canvas.
 * Add / remove / reorder (up/down buttons) blocks; edit per-block props via
 * SchemaForm; autosave to a draft page version.
 *
 * Route: /admin/pages/[id]/edit
 * Depends: P3-02 (registry + renderers), P3-04 (pages CRUD routes).
 *
 * BLOCK_COMPOSER_PAGE — grep anchor for wiring verification.
 * AUTOSAVE_POSTS_VERSION — autosave calls POST /api/v2/admin/pages/:id/versions.
 * PUBLISH_BUTTON_EDITOR — Publish/Unpublish wired to POST /api/v2/admin/pages/:id/publish|unpublish.
 * PREVIEW_BUTTON_EDITOR — Preview wired to GET /api/v2/admin/pages/:id/preview-token.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SchemaForm } from "@/components/admin/schema-form/schema-form";
import { BLOCK_REGISTRY } from "@/lib/content/blocks/registry";
import { BLOCK_EDITOR_SCHEMAS } from "@/lib/content/blocks/block-editor-schemas";
import {
  addBlock,
  blockCanBeAdded,
  blocksToVersionPayload,
  moveBlockDown,
  moveBlockUp,
  removeBlock,
  updateBlockProps,
  versionPayloadToBlocks,
  type ComposerBlock,
} from "@/lib/content/blocks/block-composer";

// ── Domain types ──────────────────────────────────────────────────────────────

type Page = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  publishedVersionId: string | null;
};

type PageVersion = {
  id: string;
  blocks: Array<{ type: string; props: Record<string, unknown> }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const readErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
  } catch {
    // fall through
  }
  return `Request failed with ${response.status}`;
};

// How long to wait after the last change before triggering autosave.
const AUTOSAVE_DEBOUNCE_MS = 1500;

// ── Block palette (add block dialog) ─────────────────────────────────────────

function BlockPalette({
  blocks,
  onAdd,
}: {
  blocks: ComposerBlock[];
  onAdd: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const entries = Array.from(BLOCK_REGISTRY.values());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-full" variant="outline">
          <Plus className="h-4 w-4" />
          Add block
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a block</DialogTitle>
          <DialogDescription>
            Choose a block type to add to the page.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          {entries.map((entry) => {
            const canAdd = blockCanBeAdded(blocks, entry.type);
            return (
              <button
                key={entry.type}
                type="button"
                disabled={!canAdd}
                onClick={() => {
                  onAdd(entry.type);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/70 p-4 text-left transition hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {entry.editorMeta.label}
                  </p>
                  {entry.editorMeta.maxPerPage !== undefined ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Max {entry.editorMeta.maxPerPage} per page
                      {!canAdd ? " — already added" : ""}
                    </p>
                  ) : null}
                  {entry.editorMeta.note ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.editorMeta.note}
                    </p>
                  ) : null}
                </div>
                <Badge variant="outline" className="text-xs">
                  {entry.editorMeta.icon}
                </Badge>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Single block row ──────────────────────────────────────────────────────────

function BlockRow({
  block,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPropsChange,
}: {
  block: ComposerBlock;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onPropsChange: (props: Record<string, unknown>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const entry = BLOCK_REGISTRY.get(block.type);
  const formSchema = BLOCK_EDITOR_SCHEMAS[block.type];
  const [localProps, setLocalProps] = useState<Record<string, unknown>>(
    block.props
  );

  const handleFieldChange = (key: string, value: unknown) => {
    const next = { ...localProps, [key]: value };
    setLocalProps(next);
    onPropsChange(next);
  };

  const label = entry?.editorMeta.label ?? block.type;

  return (
    <div className="rounded-xl border border-border/60 bg-background/70">
      {/* ── Block header row ── */}
      <div className="flex items-center gap-2 p-3">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move block up"
            type="button"
            aria-label="Move block up"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move block down"
            type="button"
            aria-label="Move block down"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>

        {/* Block label */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {label}
          </p>
          <p className="text-xs text-muted-foreground">
            {block.type}
          </p>
        </div>

        {/* Expand / remove */}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive/70 hover:text-destructive"
            onClick={onRemove}
            title="Remove block"
            type="button"
            aria-label="Remove block"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setIsOpen((prev) => !prev)}
            title={isOpen ? "Collapse" : "Edit block props"}
            type="button"
            aria-expanded={isOpen}
            aria-label="Toggle block editor"
          >
            {isOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Props editor (expanded) ── */}
      {isOpen ? (
        <div className="border-t border-border/40 p-4">
          {formSchema ? (
            <SchemaForm
              schema={formSchema}
              values={localProps}
              onChange={handleFieldChange}
              className="grid gap-4"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              No editor schema defined for this block type.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Main page editor ──────────────────────────────────────────────────────────

export default function PageEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pageId = params.id;

  const [blocks, setBlocks] = useState<ComposerBlock[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingPublish, setPendingPublish] = useState<
    "publish" | "unpublish" | "preview" | null
  >(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load page ────────────────────────────────────────────────────────────

  const {
    data: page,
    isLoading: isPageLoading,
    error: pageError,
    refetch: refetchPage,
  } = useQuery<Page>({
    queryKey: ["admin-page", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/v2/admin/pages/${pageId}`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as Page;
    },
  });

  // ── Load latest version blocks ───────────────────────────────────────────

  const { data: versions, isLoading: isVersionsLoading } = useQuery<
    PageVersion[]
  >({
    queryKey: ["admin-page-versions", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/versions`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as PageVersion[];
    },
    enabled: Boolean(page),
  });

  // Seed blocks from the latest saved version (once, on first load).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!versions || versions.length === 0) return;
    const latest = versions[0]; // newest first (listPageVersions order)
    if (!latest.blocks || latest.blocks.length === 0) return;
    seededRef.current = true;
    setBlocks(versionPayloadToBlocks(latest.blocks));
  }, [versions]);

  // ── Autosave ─────────────────────────────────────────────────────────────

  // AUTOSAVE_POSTS_VERSION — POSTs to /api/v2/admin/pages/:id/versions
  const saveVersion = useCallback(
    async (currentBlocks: ComposerBlock[]) => {
      setIsSaving(true);
      try {
        const res = await fetch(`/api/v2/admin/pages/${pageId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blocks: blocksToVersionPayload(currentBlocks),
          }),
        });
        if (!res.ok) {
          const msg = await readErrorMessage(res);
          toast.error(`Autosave failed: ${msg}`);
          return;
        }
        setLastSavedAt(new Date());
      } catch {
        toast.error("Autosave failed — check your connection.");
      } finally {
        setIsSaving(false);
      }
    },
    [pageId]
  );

  const scheduleAutosave = useCallback(
    (currentBlocks: ComposerBlock[]) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        void saveVersion(currentBlocks);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [saveVersion]
  );

  // ── Publish / Unpublish / Preview ─────────────────────────────────────────

  // PUBLISH_BUTTON_EDITOR
  const handlePublish = async () => {
    setPendingPublish("publish");
    try {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/publish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Page published.");
      await refetchPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to publish.");
    } finally {
      setPendingPublish(null);
    }
  };

  const handleUnpublish = async () => {
    setPendingPublish("unpublish");
    try {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/unpublish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Page unpublished.");
      await refetchPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to unpublish.");
    } finally {
      setPendingPublish(null);
    }
  };

  // PREVIEW_BUTTON_EDITOR
  const handlePreview = async () => {
    setPendingPublish("preview");
    try {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/preview-token`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const data = (await res.json()) as { previewUrl: string };
      window.open(data.previewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to generate preview link."
      );
    } finally {
      setPendingPublish(null);
    }
  };

  // ── Block mutations ──────────────────────────────────────────────────────

  const handleAddBlock = (type: string) => {
    const entry = BLOCK_REGISTRY.get(type);
    // Seed default props from block's propsSchema defaults if available
    const parseResult = entry?.propsSchema.safeParse({});
    const defaultProps =
      parseResult?.success ? (parseResult.data as Record<string, unknown>) : {};

    setBlocks((prev) => {
      const next = addBlock(prev, type, defaultProps);
      scheduleAutosave(next);
      return next;
    });
  };

  const handleRemoveBlock = (clientId: string) => {
    setBlocks((prev) => {
      const next = removeBlock(prev, clientId);
      scheduleAutosave(next);
      return next;
    });
  };

  const handleMoveUp = (clientId: string) => {
    setBlocks((prev) => {
      const next = moveBlockUp(prev, clientId);
      scheduleAutosave(next);
      return next;
    });
  };

  const handleMoveDown = (clientId: string) => {
    setBlocks((prev) => {
      const next = moveBlockDown(prev, clientId);
      scheduleAutosave(next);
      return next;
    });
  };

  const handlePropsChange = (
    clientId: string,
    props: Record<string, unknown>
  ) => {
    setBlocks((prev) => {
      const next = updateBlockProps(prev, clientId, props);
      scheduleAutosave(next);
      return next;
    });
  };

  // Manual save button
  const handleManualSave = () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    void saveVersion(blocks);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const isLoading = isPageLoading || isVersionsLoading;
  const isPublishPending = pendingPublish !== null;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.push("/admin/pages")}
            size="sm"
            type="button"
            variant="ghost"
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Pages
          </Button>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Page editor
            </p>
            {isPageLoading ? (
              <Skeleton className="mt-1 h-6 w-40" />
            ) : (
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {page?.title ?? "Untitled"}
              </h2>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Autosave status */}
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : lastSavedAt ? (
            <span className="text-xs text-muted-foreground">
              Saved{" "}
              {lastSavedAt.toLocaleTimeString("en-IN", { timeStyle: "short" })}
            </span>
          ) : null}

          {/* Page status badge */}
          {page ? (
            page.status === "published" ? (
              <Badge>Published</Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )
          ) : null}

          {/* PREVIEW_BUTTON_EDITOR */}
          <Button
            className="gap-2 rounded-full"
            disabled={isPublishPending || isLoading}
            onClick={() => void handlePreview()}
            type="button"
            variant="outline"
          >
            {pendingPublish === "preview" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview
          </Button>

          {/* Manual save */}
          <Button
            className="gap-2 rounded-full"
            disabled={isSaving || isLoading}
            onClick={handleManualSave}
            type="button"
            variant="outline"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save draft
          </Button>

          {/* PUBLISH_BUTTON_EDITOR */}
          {page?.status === "published" ? (
            <Button
              className="gap-2 rounded-full"
              disabled={isPublishPending || isLoading}
              onClick={() => void handleUnpublish()}
              type="button"
              variant="secondary"
            >
              {pendingPublish === "unpublish" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Unpublish
            </Button>
          ) : (
            <Button
              className="gap-2 rounded-full"
              disabled={isPublishPending || isLoading}
              onClick={() => void handlePublish()}
              type="button"
            >
              {pendingPublish === "publish" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Publish
            </Button>
          )}
        </div>
      </div>

      {/* ── Error state ── */}
      {pageError ? (
        <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-6">
          <p className="text-sm text-destructive">
            {pageError instanceof Error
              ? pageError.message
              : "Failed to load page."}
          </p>
          <Button
            className="mt-4 rounded-full"
            onClick={() => router.push("/admin/pages")}
            size="sm"
            variant="outline"
            type="button"
          >
            Back to pages
          </Button>
        </div>
      ) : null}

      {/* ── Block list ── */}
      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader className="flex flex-row items-end justify-between gap-4">
          <div>
            <CardTitle>Blocks</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading blocks…"
                : `${blocks.length} block${blocks.length === 1 ? "" : "s"} on this page.`}
            </CardDescription>
          </div>
          <BlockPalette blocks={blocks} onAdd={handleAddBlock} />
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))
          ) : blocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-8 text-center">
              <p className="text-base font-medium text-foreground">
                No blocks yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Click &ldquo;Add block&rdquo; above to start building your
                page.
              </p>
            </div>
          ) : (
            blocks.map((block, index) => (
              <BlockRow
                key={block.clientId}
                block={block}
                index={index}
                total={blocks.length}
                onMoveUp={() => handleMoveUp(block.clientId)}
                onMoveDown={() => handleMoveDown(block.clientId)}
                onRemove={() => handleRemoveBlock(block.clientId)}
                onPropsChange={(props) =>
                  handlePropsChange(block.clientId, props)
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Page info ── */}
      {page ? (
        <p className="text-xs text-muted-foreground">
          Slug:{" "}
          <span className="font-mono">/{page.slug}</span>
          {" · "}
          Changes autosave to a draft version.
        </p>
      ) : null}
    </div>
  );
}
