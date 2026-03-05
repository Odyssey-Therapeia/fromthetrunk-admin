"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUiHaptics } from "@/lib/haptics/use-ui-haptics";

type Collection = {
  id: string;
  name: string;
  slug: string;
};

const emptyDraft = {
  name: "",
  slug: "",
};

export default function AdminCollectionsPage() {
  const [draft, setDraft] = useState(emptyDraft);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<null | string>(null);
  const { error, nudge, success } = useUiHaptics();

  const readErrorMessage = async (response: Response) => {
    try {
      const data = (await response.json()) as { message?: string };
      if (typeof data.message === "string" && data.message.length > 0) {
        return data.message;
      }
    } catch {
      // fall back to generic response message
    }

    return `Request failed with ${response.status}`;
  };

  const loadCollections = async (): Promise<Collection[]> => {
    const response = await fetch("/api/v2/collections");
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    return (await response.json()) as Collection[];
  };

  const {
    data: collections = [],
    error: loadError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin-collections"],
    queryFn: loadCollections,
  });

  const handleCreate = async () => {
    if (!draft.name.trim() || !draft.slug.trim()) {
      toast.error("Name and slug are required.");
      error();
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/v2/collections", {
        body: JSON.stringify({
          name: draft.name.trim(),
          slug: draft.slug.trim(),
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      success();
      toast.success("Collection created.");
      setDraft(emptyDraft);
      setIsCreateOpen(false);
      await refetch();
    } catch (createError) {
      error();
      toast.error(
        createError instanceof Error
          ? createError.message
          : "Unable to create collection."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (collectionId: string) => {
    setPendingDeleteId(collectionId);

    try {
      const response = await fetch(`/api/v2/collections/${collectionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      success();
      toast.success("Collection deleted.");
      await refetch();
    } catch (deleteError) {
      error();
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete collection."
      );
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Storefront curation
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Collections</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Curate thematic drops without losing visual polish or context.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full" onClick={nudge}>
              <Plus className="h-4 w-4" />
              Create Collection
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border/70 bg-card">
            <DialogHeader>
              <DialogTitle>New Collection</DialogTitle>
              <DialogDescription>
                Add a new collection visible on the storefront.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="collection-name">Name</Label>
                <Input
                  id="collection-name"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  value={draft.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection-slug">Slug</Label>
                <Input
                  id="collection-slug"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, slug: event.target.value }))
                  }
                  value={draft.slug}
                />
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
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader className="flex flex-row items-end justify-between gap-4">
          <div>
            <CardTitle>Live collection index</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading your storefront collections..."
                : `${collections.length} collection${collections.length === 1 ? "" : "s"} currently available.`}
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
                  key={`collection-skeleton-${index}`}
                >
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-3 h-3 w-24" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-foreground">
                {loadError instanceof Error ? loadError.message : "Unable to load collections."}
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
          ) : collections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
              <p className="text-base font-medium text-foreground">No collections yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first themed drop to give the storefront stronger structure.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead className="w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collections.map((collection) => (
                      <TableRow key={collection.id}>
                        <TableCell className="font-medium">{collection.name}</TableCell>
                        <TableCell className="text-muted-foreground">{collection.slug}</TableCell>
                        <TableCell>
                          <Button
                            disabled={pendingDeleteId === collection.id}
                            onClick={() => void handleDelete(collection.id)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {pendingDeleteId === collection.id ? "Deleting..." : "Delete"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {collections.map((collection) => (
                  <div
                    className="rounded-xl border border-border/60 bg-background/70 p-4"
                    key={collection.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{collection.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">/{collection.slug}</p>
                      </div>
                      <Button
                        disabled={pendingDeleteId === collection.id}
                        onClick={() => void handleDelete(collection.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {pendingDeleteId === collection.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
