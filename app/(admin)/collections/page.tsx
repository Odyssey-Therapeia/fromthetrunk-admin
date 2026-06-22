"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// ── P4-03: Rule condition types ───────────────────────────────────────────

type RuleConditionType = "type" | "tag" | "price-range" | "attribute-equals";

type RuleCondition =
  | { type: "type"; value: string }
  | { type: "tag"; value: string }
  | { type: "price-range"; min: number; max: number }
  | { type: "attribute-equals"; key: string; value: string };

const CONDITION_TYPE_LABELS: Record<RuleConditionType, string> = {
  type: "Product type",
  tag: "Tag",
  "price-range": "Price range (paise)",
  "attribute-equals": "Attribute equals",
};

type Collection = {
  id: string;
  name: string;
  slug: string;
  rules: RuleCondition[] | null;
};

const emptyDraft = {
  name: "",
  slug: "",
  rules: [] as RuleCondition[],
};

// ── Rule condition row editor ─────────────────────────────────────────────

function ConditionRow({
  condition,
  onUpdate,
  onRemove,
}: {
  condition: RuleCondition;
  onUpdate: (next: RuleCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="flex flex-1 flex-wrap items-start gap-2">
        <Select
          value={condition.type}
          onValueChange={(val) => {
            const t = val as RuleConditionType;
            if (t === "type") onUpdate({ type: "type", value: "" });
            else if (t === "tag") onUpdate({ type: "tag", value: "" });
            else if (t === "price-range") onUpdate({ type: "price-range", min: 0, max: 0 });
            else onUpdate({ type: "attribute-equals", key: "", value: "" });
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CONDITION_TYPE_LABELS) as RuleConditionType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {CONDITION_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {condition.type === "type" && (
          <Input
            className="w-40"
            placeholder="e.g. preloved-saree"
            value={condition.value}
            onChange={(e) => onUpdate({ type: "type", value: e.target.value })}
          />
        )}

        {condition.type === "tag" && (
          <Input
            className="w-40"
            placeholder="e.g. silk"
            value={condition.value}
            onChange={(e) => onUpdate({ type: "tag", value: e.target.value })}
          />
        )}

        {condition.type === "price-range" && (
          <>
            <Input
              className="w-28"
              placeholder="Min (paise)"
              type="number"
              value={condition.min}
              onChange={(e) =>
                onUpdate({ type: "price-range", min: Number(e.target.value), max: condition.max })
              }
            />
            <span className="self-center text-xs text-muted-foreground">–</span>
            <Input
              className="w-28"
              placeholder="Max (paise)"
              type="number"
              value={condition.max}
              onChange={(e) =>
                onUpdate({ type: "price-range", min: condition.min, max: Number(e.target.value) })
              }
            />
          </>
        )}

        {condition.type === "attribute-equals" && (
          <>
            <Input
              className="w-32"
              placeholder="Attribute key"
              value={condition.key}
              onChange={(e) =>
                onUpdate({ type: "attribute-equals", key: e.target.value, value: condition.value })
              }
            />
            <Input
              className="w-32"
              placeholder="Value"
              value={condition.value}
              onChange={(e) =>
                onUpdate({ type: "attribute-equals", key: condition.key, value: e.target.value })
              }
            />
          </>
        )}
      </div>

      <Button
        className="shrink-0"
        onClick={onRemove}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

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

  // ── Rules helpers ────────────────────────────────────────────────────────

  const addCondition = () => {
    setDraft((prev) => ({
      ...prev,
      rules: [...prev.rules, { type: "type", value: "" }],
    }));
  };

  const updateCondition = (index: number, next: RuleCondition) => {
    setDraft((prev) => {
      const updated = [...prev.rules];
      updated[index] = next;
      return { ...prev, rules: updated };
    });
  };

  const removeCondition = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  // ── CRUD handlers ────────────────────────────────────────────────────────

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
          rules: draft.rules.length > 0 ? draft.rules : null,
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
            Curate thematic drops — manual or smart-rule driven.
          </p>
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setDraft(emptyDraft);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full" onClick={nudge}>
              <Plus className="h-4 w-4" />
              Create Collection
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border/70 bg-card sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New Collection</DialogTitle>
              <DialogDescription>
                Add a collection. Optionally add smart rules — all conditions are ANDed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="collection-name">Name</Label>
                <Input
                  id="collection-name"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="e.g. Silk Heritage"
                  value={draft.name}
                />
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <Label htmlFor="collection-slug">Slug</Label>
                <Input
                  id="collection-slug"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, slug: event.target.value }))
                  }
                  placeholder="e.g. silk-heritage"
                  value={draft.slug}
                />
              </div>

              {/* Smart rules */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Smart rules</Label>
                  <Button
                    className="h-7 gap-1 rounded-full text-xs"
                    onClick={addCondition}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="h-3 w-3" />
                    Add condition
                  </Button>
                </div>

                {draft.rules.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 bg-background/50 px-4 py-3 text-xs text-muted-foreground">
                    No rules — this will be a manual collection. Add conditions to make it smart.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.rules.map((condition, index) => (
                      <ConditionRow
                        key={index}
                        condition={condition}
                        onUpdate={(next) => updateCondition(index, next)}
                        onRemove={() => removeCondition(index)}
                      />
                    ))}
                  </div>
                )}
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
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collections.map((collection) => (
                      <TableRow key={collection.id}>
                        <TableCell className="font-medium">{collection.name}</TableCell>
                        <TableCell className="text-muted-foreground">{collection.slug}</TableCell>
                        <TableCell>
                          {collection.rules && collection.rules.length > 0 ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Smart ({collection.rules.length} rule{collection.rules.length === 1 ? "" : "s"})
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Manual</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            disabled={pendingDeleteId === collection.id}
                            onClick={() => void handleDelete(collection.id)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {pendingDeleteId === collection.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
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
                        {collection.rules && collection.rules.length > 0 ? (
                          <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Smart ({collection.rules.length} rule{collection.rules.length === 1 ? "" : "s"})
                          </span>
                        ) : (
                          <span className="mt-2 inline-block text-xs text-muted-foreground">
                            Manual
                          </span>
                        )}
                      </div>
                      <Button
                        disabled={pendingDeleteId === collection.id}
                        onClick={() => void handleDelete(collection.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {pendingDeleteId === collection.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
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
