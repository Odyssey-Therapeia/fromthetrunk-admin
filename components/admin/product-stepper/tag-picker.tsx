/**
 * components/admin/product-stepper/tag-picker.tsx
 *
 * Multi-select tag chooser with inline creation. Works in `number[]` (tag IDs);
 * the caller bridges to/from the stepper's `tagsCsv` string field. Because every
 * emitted ID comes from a real tag row, the product save can no longer hit the
 * product_tags → tags foreign-key violation that the old free-text field caused.
 */
import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCreateTag, useTags } from "@/lib/hooks/use-tags";

type TagPickerProps = {
  value: number[];
  onChange: (ids: number[]) => void;
};

export function TagPicker({ value, onChange }: TagPickerProps) {
  const { data: tags, isLoading } = useTags();
  const createTag = useCreateTag();
  const [draft, setDraft] = useState("");

  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange([...next]);
  };

  const handleCreate = async () => {
    const name = draft.trim();
    if (!name || createTag.isPending) return;
    try {
      const tag = await createTag.mutateAsync({ name });
      setDraft("");
      if (!selected.has(tag.id)) onChange([...value, tag.id]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create tag.",
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading tags…</p>
        ) : (tags?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tags yet — create your first one below.
          </p>
        ) : (
          tags?.map((tag) => {
            const isSelected = selected.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {isSelected ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <TagIcon className="h-3.5 w-3.5" />
                )}
                {tag.name}
              </button>
            );
          })
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="Create a tag (e.g. Silk)"
          className="h-9"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleCreate()}
          disabled={!draft.trim() || createTag.isPending}
          className="h-9 shrink-0 gap-1.5"
        >
          {createTag.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </Button>
      </div>
    </div>
  );
}
