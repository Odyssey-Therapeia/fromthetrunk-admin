"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SchemaForm } from "@/components/admin/schema-form/schema-form";
import { pageSettingsSchema } from "@/lib/content/page-settings.schema";
import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";

// ── Domain types ──────────────────────────────────────────────────────────────

type Page = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  seo: Record<string, unknown> | null;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};

type PageVersion = {
  id: string;
  pageId: string;
  blocks: unknown[];
  createdBy: string;
  createdAt: string;
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

const emptyDraft: Record<string, unknown> = {
  title: "",
  slug: "",
  seoTitle: "",
  seoDescription: "",
  status: "draft",
};

// ── Drift-detectable identifiers (grep targets for the verify step) ───────────

// SCHEMA_FORM_PAGES_ADMIN — SchemaForm is rendered below using pageSettingsSchema
// PAGE_SETTINGS_SCHEMA_DRIVEN — all SEO fields come from pageSettingsSchema
// PUBLISH_BUTTON_PAGES_ADMIN — Publish/Unpublish buttons wired to /publish and /unpublish
// PREVIEW_BUTTON_PAGES_ADMIN — Preview button wired to /preview-token

// ── Version history sheet ─────────────────────────────────────────────────────

function VersionHistorySheet({
  page,
  open,
  onOpenChange,
  onRestored,
}: {
  page: Page | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}) {
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

  const loadVersions = async (): Promise<PageVersion[]> => {
    if (!page) return [];
    const response = await fetch(`/api/v2/admin/pages/${page.id}/versions`);
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return (await response.json()) as PageVersion[];
  };

  const {
    data: versions = [],
    isLoading,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: ["admin-page-versions", page?.id],
    queryFn: loadVersions,
    enabled: open && page !== null,
  });

  const handleRestore = async (versionId: string) => {
    if (!page) return;
    setPendingRestoreId(versionId);
    try {
      const response = await fetch(
        `/api/v2/admin/pages/${page.id}/versions/${versionId}/restore`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error(await readErrorMessage(response));
      toast.success("Version restored and published.");
      onRestored();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to restore version."
      );
    } finally {
      setPendingRestoreId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Version history
          </SheetTitle>
          <SheetDescription>
            {page ? (
              <>
                Versions for <span className="font-medium">/{page.slug}</span> — newest first.
                Restore sets this version as the published content.
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">
                {loadError instanceof Error ? loadError.message : "Unable to load versions."}
              </p>
              <Button
                className="mt-3 rounded-full"
                onClick={() => void refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No versions yet. Create a version by editing content.
              </p>
            </div>
          ) : (
            versions.map((version) => {
              const isActive = page?.publishedVersionId === version.id;
              return (
                <div
                  key={version.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(version.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      by {version.createdBy}
                    </p>
                    {isActive ? (
                      <Badge className="mt-1" variant="secondary">
                        Current
                      </Badge>
                    ) : null}
                  </div>
                  {!isActive ? (
                    <Button
                      disabled={pendingRestoreId === version.id}
                      onClick={() => void handleRestore(version.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {pendingRestoreId === version.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      <span className="ml-1.5">Restore</span>
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Publish / Unpublish / Preview controls ─────────────────────────────────────
// PUBLISH_BUTTON_PAGES_ADMIN
// PREVIEW_BUTTON_PAGES_ADMIN

function PageActions({
  page,
  onChanged,
}: {
  page: Page;
  onChanged: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<
    "publish" | "unpublish" | "preview" | null
  >(null);

  const handlePublish = async () => {
    setPendingAction("publish");
    try {
      const res = await fetch(`/api/v2/admin/pages/${page.id}/publish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Page published.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to publish page.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleUnpublish = async () => {
    setPendingAction("unpublish");
    try {
      const res = await fetch(`/api/v2/admin/pages/${page.id}/unpublish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Page unpublished.");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to unpublish page."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handlePreview = async () => {
    setPendingAction("preview");
    try {
      const res = await fetch(`/api/v2/admin/pages/${page.id}/preview-token`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const data = (await res.json()) as { previewUrl: string };
      window.open(data.previewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to generate preview link."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const isLoading = pendingAction !== null;

  return (
    <div className="flex items-center gap-1">
      {/* Preview button */}
      <Button
        disabled={isLoading}
        onClick={() => void handlePreview()}
        size="sm"
        title="Preview draft"
        type="button"
        variant="ghost"
      >
        {pendingAction === "preview" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </Button>

      {/* Publish / Unpublish */}
      {page.status === "published" ? (
        <Button
          disabled={isLoading}
          onClick={() => void handleUnpublish()}
          size="sm"
          title="Unpublish page"
          type="button"
          variant="ghost"
        >
          {pendingAction === "unpublish" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      ) : (
        <Button
          disabled={isLoading}
          onClick={() => void handlePublish()}
          size="sm"
          title="Publish page"
          type="button"
          variant="ghost"
        >
          {pendingAction === "publish" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPagesPage() {
  // Create dialog state
  const [createDraft, setCreateDraft] = useState<Record<string, unknown>>(emptyDraft);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Version history sheet
  const [historyPage, setHistoryPage] = useState<Page | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const router = useRouter();
  const { error, nudge, success } = useUiHaptics();

  const loadPages = async (): Promise<Page[]> => {
    const response = await fetch("/api/v2/admin/pages");
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return (await response.json()) as Page[];
  };

  const {
    data: pages = [],
    error: loadError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: loadPages,
  });

  // ── Create handler ────────────────────────────────────────────────────────

  const handleCreate = async () => {
    // Basic client-side validation
    if (!createDraft.title || !createDraft.slug) {
      setCreateErrors({
        ...(createDraft.title ? {} : { title: "Title is required" }),
        ...(createDraft.slug ? {} : { slug: "Slug is required" }),
      });
      error();
      return;
    }

    setIsSaving(true);
    setCreateErrors({});

    try {
      const response = await fetch("/api/v2/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: String(createDraft.slug).trim(),
          title: String(createDraft.title).trim(),
          seo:
            createDraft.seoTitle || createDraft.seoDescription
              ? {
                  title: createDraft.seoTitle || undefined,
                  description: createDraft.seoDescription || undefined,
                }
              : null,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { code?: string; message?: string };
        if (errData.code === "SLUG_RESERVED") {
          setCreateErrors({ slug: errData.message ?? "Slug is reserved." });
          error();
          return;
        }
        throw new Error(errData.message ?? `Request failed (${response.status})`);
      }

      success();
      toast.success("Page created.");
      setCreateDraft(emptyDraft);
      setIsCreateOpen(false);
      await refetch();
    } catch (createError) {
      error();
      toast.error(
        createError instanceof Error ? createError.message : "Unable to create page."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openHistory = (page: Page) => {
    setHistoryPage(page);
    setIsHistoryOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Content management
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pages</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage CMS pages — create, edit SEO settings, and restore prior versions.
          </p>
        </div>

        {/* ── Create dialog ── */}
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setCreateDraft(emptyDraft);
              setCreateErrors({});
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full" onClick={nudge}>
              <Plus className="h-4 w-4" />
              Create page
            </Button>
          </DialogTrigger>

          <DialogContent className="border-border/70 bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New page</DialogTitle>
              <DialogDescription>
                Add a CMS page. Reserved slugs (checkout, cart, etc.) are rejected.
              </DialogDescription>
            </DialogHeader>

            {/*
             * SCHEMA_FORM_PAGES_ADMIN
             * PAGE_SETTINGS_SCHEMA_DRIVEN
             * SchemaForm renders all SEO fields from pageSettingsSchema — single source of truth.
             */}
            <SchemaForm
              className="grid gap-4"
              errors={createErrors}
              getFieldClassName={(key) => {
                if (key === "seoDescription") return "col-span-full";
                return undefined;
              }}
              onChange={(key, value) =>
                setCreateDraft((prev) => ({ ...prev, [key]: value }))
              }
              schema={pageSettingsSchema}
              values={createDraft}
            />

            <DialogFooter>
              <Button
                className="gap-2"
                disabled={isSaving}
                onClick={() => void handleCreate()}
                type="button"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Table ── */}
      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader className="flex flex-row items-end justify-between gap-4">
          <div>
            <CardTitle>All pages</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading pages..."
                : `${pages.length} page${pages.length === 1 ? "" : "s"} total.`}
            </CardDescription>
          </div>
          {isFetching && !isLoading ? (
            <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Refreshing
            </span>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  className="rounded-xl border border-border/60 bg-background/70 p-4"
                  key={`page-skeleton-${i}`}
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-3 h-3 w-28" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-foreground">
                {loadError instanceof Error ? loadError.message : "Unable to load pages."}
              </p>
              <Button
                className="mt-4 rounded-full"
                onClick={() => void refetch()}
                type="button"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          ) : pages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-base font-medium text-foreground">No pages yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first CMS page to get started.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-40">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pages.map((page) => (
                      <TableRow key={page.id}>
                        <TableCell className="font-medium">{page.title}</TableCell>
                        <TableCell className="text-muted-foreground">/{page.slug}</TableCell>
                        <TableCell>
                          {page.status === "published" ? (
                            <Badge variant="default">Published</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* PUBLISH_BUTTON_PAGES_ADMIN / PREVIEW_BUTTON_PAGES_ADMIN */}
                            <PageActions
                              page={page}
                              onChanged={() => void refetch()}
                            />
                            <Button
                              onClick={() => openHistory(page)}
                              size="sm"
                              title="Version history"
                              type="button"
                              variant="ghost"
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() =>
                                router.push(`/pages/${page.id}/edit`)
                              }
                              size="sm"
                              title="Edit page"
                              type="button"
                              variant="ghost"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            {page.status === "published" ? (
                              <a
                                href={`/${page.slug}`}
                                rel="noopener noreferrer"
                                target="_blank"
                                title="View published page"
                              >
                                <Button size="sm" type="button" variant="ghost">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {pages.map((page) => (
                  <div
                    className="rounded-xl border border-border/60 bg-background/70 p-4"
                    key={page.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{page.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">/{page.slug}</p>
                        <div className="mt-2">
                          {page.status === "published" ? (
                            <Badge variant="default">Published</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <PageActions
                          page={page}
                          onChanged={() => void refetch()}
                        />
                        <Button
                          onClick={() => openHistory(page)}
                          size="sm"
                          title="Version history"
                          type="button"
                          variant="ghost"
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() =>
                            router.push(`/pages/${page.id}/edit`)
                          }
                          size="sm"
                          title="Edit page"
                          type="button"
                          variant="ghost"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Version history sheet ── */}
      <VersionHistorySheet
        open={isHistoryOpen}
        page={historyPage}
        onOpenChange={setIsHistoryOpen}
        onRestored={() => void refetch()}
      />
    </div>
  );
}
