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
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
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

type PageDraft = {
  seoDescription: string;
  seoTitle: string;
  slug: string;
  title: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEO_TITLE_MAX = 70;
const SEO_DESCRIPTION_MAX = 160;

const emptyDraft = (): PageDraft => ({
  title: "",
  slug: "",
  seoTitle: "",
  seoDescription: "",
});

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

const slugifyPageTitle = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");

const trimToLength = (value: string, maxLength: number) =>
  value.length > maxLength ? value.slice(0, maxLength).trim() : value;

const createSeoSuggestions = (title: string, slug: string) => {
  const cleanTitle = title.trim();
  const fallbackTitle = slug
    ? slug
        .split("-")
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ")
    : "From The Trunk";

  const pageTitle = cleanTitle || fallbackTitle;

  const seoTitle = trimToLength(`${pageTitle} | From The Trunk`, SEO_TITLE_MAX);

  const seoDescription = trimToLength(
    `Explore ${pageTitle.toLowerCase()} at From The Trunk — hand-curated vintage sarees, thoughtful stories, and a refined online shopping experience.`,
    SEO_DESCRIPTION_MAX,
  );

  return {
    seoTitle,
    seoDescription,
  };
};

// ── Drift-detectable identifiers (grep targets for the verify step) ───────────

// PAGE_CREATE_DRAFT_ONLY — create dialog never exposes published status
// PAGE_SLUG_AUTO_GENERATED — slug is generated from title until manually edited
// PAGE_SEO_GENERATE_BUTTON — SEO title and description suggestion button
// PUBLISH_BUTTON_PAGES_ADMIN — Publish/Unpublish buttons wired to /publish and /unpublish
// PREVIEW_BUTTON_PAGES_ADMIN — Preview button wired to /preview-token
// DELETE_BUTTON_PAGES_ADMIN — Delete buttons wired to DELETE /api/v2/admin/pages/:id
// DELETE_DIALOG_PAGES_ADMIN — shadcn AlertDialog confirmation for deleting pages

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
        { method: "POST" },
      );

      if (!response.ok) throw new Error(await readErrorMessage(response));

      toast.success("Version restored and published.");
      onRestored();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to restore version.",
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
                Versions for <span className="font-medium">/{page.slug}</span> —
                newest first. Restore sets this version as the published
                content.
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <Skeleton
                className="h-16 w-full rounded-xl"
                key={`version-skeleton-${index}`}
              />
            ))
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">
                {loadError instanceof Error
                  ? loadError.message
                  : "Unable to load versions."}
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
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 p-4"
                  key={version.id}
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
      const response = await fetch(`/api/v2/admin/pages/${page.id}/publish`, {
        method: "POST",
      });

      if (!response.ok) throw new Error(await readErrorMessage(response));

      toast.success("Page published.");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to publish page.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleUnpublish = async () => {
    setPendingAction("unpublish");

    try {
      const response = await fetch(`/api/v2/admin/pages/${page.id}/unpublish`, {
        method: "POST",
      });

      if (!response.ok) throw new Error(await readErrorMessage(response));

      toast.success("Page unpublished.");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to unpublish page.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handlePreview = async () => {
    setPendingAction("preview");

    try {
      const response = await fetch(
        `/api/v2/admin/pages/${page.id}/preview-token`,
      );

      if (!response.ok) throw new Error(await readErrorMessage(response));

      const data = (await response.json()) as { previewUrl: string };
      window.open(data.previewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to generate preview link.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const isLoading = pendingAction !== null;

  return (
    <div className="flex items-center gap-1">
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
  const [createDraft, setCreateDraft] = useState<PageDraft>(() => emptyDraft());
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Page | null>(null);

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

  const resetCreateDialog = () => {
    setCreateDraft(emptyDraft());
    setCreateErrors({});
    setIsSlugManuallyEdited(false);
    setIsGeneratingSeo(false);
  };

  const openCreateDialog = () => {
    resetCreateDialog();
    setIsCreateOpen(true);
    nudge();
  };

  const handleTitleChange = (value: string) => {
    setCreateDraft((prev) => ({
      ...prev,
      title: value,
      slug: isSlugManuallyEdited ? prev.slug : slugifyPageTitle(value),
    }));

    setCreateErrors((prev) => ({
      ...prev,
      title: "",
      slug: "",
    }));
  };

  const handleSlugChange = (value: string) => {
    setIsSlugManuallyEdited(true);

    setCreateDraft((prev) => ({
      ...prev,
      slug: slugifyPageTitle(value),
    }));

    setCreateErrors((prev) => ({
      ...prev,
      slug: "",
    }));
  };

  const handleGenerateSeo = () => {
    const title = createDraft.title.trim();
    const slug = createDraft.slug.trim();

    if (!title && !slug) {
      setCreateErrors((prev) => ({
        ...prev,
        title: "Add a page title before generating SEO.",
      }));
      error();
      return;
    }

    setIsGeneratingSeo(true);

    try {
      const suggestions = createSeoSuggestions(title, slug);

      setCreateDraft((prev) => ({
        ...prev,
        seoTitle: suggestions.seoTitle,
        seoDescription: suggestions.seoDescription,
      }));

      setCreateErrors((prev) => ({
        ...prev,
        seoTitle: "",
        seoDescription: "",
      }));

      success();
      toast.success("SEO suggestions generated.");
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const handleCreate = async () => {
    const nextErrors: Record<string, string> = {};

    if (!createDraft.title.trim()) {
      nextErrors.title = "Title is required.";
    }

    if (!createDraft.slug.trim()) {
      nextErrors.slug = "Slug is required.";
    }

    if (createDraft.seoTitle.length > SEO_TITLE_MAX) {
      nextErrors.seoTitle = `SEO title must be ${SEO_TITLE_MAX} characters or fewer.`;
    }

    if (createDraft.seoDescription.length > SEO_DESCRIPTION_MAX) {
      nextErrors.seoDescription = `SEO description must be ${SEO_DESCRIPTION_MAX} characters or fewer.`;
    }

    if (Object.keys(nextErrors).length > 0) {
      setCreateErrors(nextErrors);
      error();
      return;
    }

    setIsSaving(true);
    setCreateErrors({});

    try {
      const seoTitle = createDraft.seoTitle.trim();
      const seoDescription = createDraft.seoDescription.trim();

      const response = await fetch("/api/v2/admin/pages", {
        body: JSON.stringify({
          slug: createDraft.slug.trim(),
          title: createDraft.title.trim(),
          seo:
            seoTitle || seoDescription
              ? {
                  title: seoTitle || undefined,
                  description: seoDescription || undefined,
                }
              : null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const errData = (await response.json()) as {
          code?: string;
          message?: string;
        };

        if (errData.code === "SLUG_RESERVED") {
          setCreateErrors({ slug: errData.message ?? "Slug is reserved." });
          error();
          return;
        }

        throw new Error(
          errData.message ?? `Request failed (${response.status})`,
        );
      }

      success();
      toast.success("Draft page created.");
      resetCreateDialog();
      setIsCreateOpen(false);
      await refetch();
    } catch (createError) {
      error();
      toast.error(
        createError instanceof Error
          ? createError.message
          : "Unable to create page.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openHistory = (page: Page) => {
    setHistoryPage(page);
    setIsHistoryOpen(true);
  };

  const openDeleteDialog = (page: Page) => {
    setDeleteTarget(page);
  };

  const handleConfirmDeletePage = async () => {
    if (!deleteTarget) return;

    setPendingDeleteId(deleteTarget.id);

    try {
      const response = await fetch(`/api/v2/admin/pages/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      success();
      toast.success("Page deleted.");
      setDeleteTarget(null);
      await refetch();
    } catch (deleteError) {
      error();
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete page.",
      );
    } finally {
      setPendingDeleteId(null);
    }
  };

  const getStorefrontPageUrl = (slug: string) => {
    const origin = process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN?.replace(
      /\/+$/,
      "",
    );
    return origin ? `${origin}/${slug}` : `/${slug}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Content management
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pages</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage CMS pages — create drafts, edit SEO settings, and restore
            prior versions.
          </p>
        </div>

        <Button className="gap-2 rounded-full" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Create page
        </Button>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetCreateDialog();
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-card sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New page</DialogTitle>
              <DialogDescription>
                New CMS pages are always saved as drafts. Publish them later
                after content and SEO are ready.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Page identity
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The slug is generated from the title and can be edited before
                  creation. Reserved slugs like checkout and cart are rejected.
                </p>

                <div className="mt-4 grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="page-title">Page title</Label>
                    <Input
                      id="page-title"
                      onChange={(event) =>
                        handleTitleChange(event.target.value)
                      }
                      placeholder="e.g. About Us"
                      value={createDraft.title}
                    />
                    {createErrors.title ? (
                      <p className="text-xs text-destructive">
                        {createErrors.title}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This is the visible page title in the admin and on the
                        storefront.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="page-slug">Slug</Label>
                    <Input
                      id="page-slug"
                      onChange={(event) => handleSlugChange(event.target.value)}
                      placeholder="auto-generated from title"
                      value={createDraft.slug}
                    />
                    {createErrors.slug ? (
                      <p className="text-xs text-destructive">
                        {createErrors.slug}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        URL path segment. Use lowercase letters, numbers, and
                        hyphens only.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      SEO
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Generate SEO copy from the page title, then edit it before
                      saving.
                    </p>
                  </div>

                  <Button
                    className="gap-2"
                    disabled={isGeneratingSeo}
                    onClick={handleGenerateSeo}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isGeneratingSeo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Generate SEO
                  </Button>
                </div>

                <div className="mt-4 grid gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="seo-title">SEO title</Label>
                      <span className="text-xs text-muted-foreground">
                        {createDraft.seoTitle.length}/{SEO_TITLE_MAX}
                      </span>
                    </div>
                    <Input
                      id="seo-title"
                      maxLength={SEO_TITLE_MAX}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({
                          ...prev,
                          seoTitle: event.target.value,
                        }))
                      }
                      placeholder="e.g. About Us | From The Trunk"
                      value={createDraft.seoTitle}
                    />
                    {createErrors.seoTitle ? (
                      <p className="text-xs text-destructive">
                        {createErrors.seoTitle}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Overrides the browser title. Keep it direct and under{" "}
                        {SEO_TITLE_MAX} characters.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="seo-description">SEO description</Label>
                      <span className="text-xs text-muted-foreground">
                        {createDraft.seoDescription.length}/
                        {SEO_DESCRIPTION_MAX}
                      </span>
                    </div>
                    <Textarea
                      id="seo-description"
                      maxLength={SEO_DESCRIPTION_MAX}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({
                          ...prev,
                          seoDescription: event.target.value,
                        }))
                      }
                      placeholder="A short summary of this page for search engines."
                      rows={4}
                      value={createDraft.seoDescription}
                    />
                    {createErrors.seoDescription ? (
                      <p className="text-xs text-destructive">
                        {createErrors.seoDescription}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Meta description. Keep it helpful and under{" "}
                        {SEO_DESCRIPTION_MAX} characters.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Status
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This page will be created as a draft. Use the publish action
                  from the table when it is ready to go live.
                </p>
                <Badge className="mt-3" variant="secondary">
                  Draft
                </Badge>
              </div>
            </div>

            <DialogFooter>
              <Button
                className="gap-2"
                disabled={isSaving}
                onClick={() => void handleCreate()}
                type="button"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  className="rounded-xl border border-border/60 bg-background/70 p-4"
                  key={`page-skeleton-${index}`}
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-3 h-3 w-28" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-foreground">
                {loadError instanceof Error
                  ? loadError.message
                  : "Unable to load pages."}
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
              <p className="mt-3 text-base font-medium text-foreground">
                No pages yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first CMS page to get started.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-52">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pages.map((page) => (
                      <TableRow key={page.id}>
                        <TableCell className="font-medium">
                          {page.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          /{page.slug}
                        </TableCell>
                        <TableCell>
                          {page.status === "published" ? (
                            <Badge variant="default">Published</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell>
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

                            <Button
                              disabled={pendingDeleteId === page.id}
                              onClick={() => openDeleteDialog(page)}
                              size="sm"
                              title="Delete page"
                              type="button"
                              variant="ghost"
                            >
                              {pendingDeleteId === page.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>

                            {page.status === "published" ? (
                              <a
                                href={getStorefrontPageUrl(page.slug)}
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

              <div className="space-y-3 md:hidden">
                {pages.map((page) => (
                  <div
                    className="rounded-xl border border-border/60 bg-background/70 p-4"
                    key={page.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {page.title}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          /{page.slug}
                        </p>
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
                          onClick={() => router.push(`/pages/${page.id}/edit`)}
                          size="sm"
                          title="Edit page"
                          type="button"
                          variant="ghost"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>

                        <Button
                          disabled={pendingDeleteId === page.id}
                          onClick={() => openDeleteDialog(page)}
                          size="sm"
                          title="Delete page"
                          type="button"
                          variant="ghost"
                        >
                          {pendingDeleteId === page.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && pendingDeleteId === null) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="border-border/70 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete page?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  This will permanently delete{" "}
                  <span className="font-medium text-foreground">
                    {deleteTarget.title}
                  </span>{" "}
                  at{" "}
                  <span className="font-mono text-foreground">
                    /{deleteTarget.slug}
                  </span>
                  . This action cannot be undone.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Deleting a page may remove content that is linked from navigation,
            redirects, or marketing materials. Unpublish the page instead if you
            only want to hide it from customers.
          </div>

          <AlertDialogFooter className="gap-2 sm:justify-end">
            <AlertDialogCancel
              className="mt-0"
              disabled={pendingDeleteId !== null}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              className="gap-2"
              disabled={pendingDeleteId !== null}
              onClick={() => void handleConfirmDeletePage()}
              type="button"
              variant="destructive"
            >
              {pendingDeleteId !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete page
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VersionHistorySheet
        open={isHistoryOpen}
        page={historyPage}
        onOpenChange={setIsHistoryOpen}
        onRestored={() => void refetch()}
      />
    </div>
  );
}
