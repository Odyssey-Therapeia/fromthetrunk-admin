import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StepDetailsProps = {
  form: any;
};

export function StepDetails({
  form,
}: StepDetailsProps) {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<
    Array<{ category: string; id: number; name: string }>
  >([]);

  const handleSuggestTags = async () => {
    setIsSuggesting(true);
    try {
      const values = form.state.values;
      const response = await fetch("/api/v2/products/tag-suggestions", {
        body: JSON.stringify({
          detailsDesigner: values.detailsDesigner,
          detailsFabric: values.detailsFabric,
          storyEra: values.storyEra,
          storyNarrative: values.storyNarrative,
          storyProvenance: values.storyProvenance,
          storyTitle: values.storyTitle,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        setSuggestedTags([]);
        return;
      }

      const data = (await response.json()) as {
        suggestions?: Array<{ category: string; id: number; name: string }>;
      };
      setSuggestedTags(data.suggestions ?? []);
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form.Field name="name">
        {(field: any) => (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="product-name">Internal name</Label>
            <Input
              id="product-name"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Kanjeevaram Silk - Gold Border"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="slug">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="product-slug">Slug</Label>
            <Input
              id="product-slug"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="kanjeevaram-silk-gold-border"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="collectionId">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="collection-id">Collection ID</Label>
            <Input
              id="collection-id"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="UUID (optional)"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="detailsFabric">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="fabric">Fabric</Label>
            <Input
              id="fabric"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Pure Silk"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="detailsDesigner">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="designer">Designer</Label>
            <Input
              id="designer"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Nalli / Heritage House"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="detailsLength">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="length">Length</Label>
            <Input
              id="length"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder='e.g. 5.5"'
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="detailsWidth">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="width">Width</Label>
            <Input
              id="width"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder='e.g. 44"'
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="detailsCondition">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="condition">Condition</Label>
            <Input
              id="condition"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Excellent / Restored"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="tagsCsv">
        {(field: any) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tags">Tag IDs (comma separated)</Label>
              <Button
                onClick={handleSuggestTags}
                size="sm"
                type="button"
                variant="outline"
              >
                {isSuggesting ? "Suggesting..." : "Suggest Tags"}
              </Button>
            </div>
            <Input
              id="tags"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="1, 2, 7"
              value={field.state.value}
            />
            {suggestedTags.length > 0 ? (
              <div className="space-y-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <p>Suggested tags:</p>
                <p>
                  {suggestedTags
                    .map((tag) => `${tag.name} (#${tag.id})`)
                    .join(", ")}
                </p>
                <Button
                  onClick={() =>
                    field.handleChange(suggestedTags.map((tag) => tag.id).join(", "))
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Apply suggested IDs
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </form.Field>
    </div>
  );
}
