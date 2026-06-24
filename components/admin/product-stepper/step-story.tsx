import { useState } from "react";
import { Loader2, Sparkles, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { useNetworkStatus } from "./network-sync";
import type { ProductStepperValues } from "./types";

type StepStoryProps = {
  form: any;
};

type StoryGenerationContext = {
  name: string;
  storyTitle: string;
  storyNarrative: string;
  storyProvenance: string;
  storyEra: string;
  detailsFabric: string;
  detailsDesigner: string;
  detailsCondition: string;
  detailsLength: string;
  detailsWidth: string;
  priceRupees: number;
  attributeValues: Record<string, unknown>;
};

const toText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const hasUsefulContext = (context: StoryGenerationContext) => {
  const attributeText = Object.values(context.attributeValues ?? {})
    .map((value) => {
      if (Array.isArray(value)) return value.join(" ");
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return "";
    })
    .join(" ")
    .trim();

  return Boolean(
    context.name ||
    context.storyTitle ||
    context.storyNarrative ||
    context.storyProvenance ||
    context.storyEra ||
    context.detailsFabric ||
    context.detailsDesigner ||
    context.detailsCondition ||
    context.detailsLength ||
    context.detailsWidth ||
    attributeText,
  );
};

export function StepStory({ form }: StepStoryProps) {
  const isOnline = useNetworkStatus();
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);

  const buildStoryGenerationContext = (): StoryGenerationContext => {
    const values = form.state.values as ProductStepperValues;

    return {
      name: toText(values.name),
      storyTitle: toText(values.storyTitle),
      storyNarrative: toText(values.storyNarrative),
      storyProvenance: toText(values.storyProvenance),
      storyEra: toText(values.storyEra),
      detailsFabric: toText(values.detailsFabric),
      detailsDesigner: toText(values.detailsDesigner),
      detailsCondition: toText(values.detailsCondition),
      detailsLength: toText(values.detailsLength),
      detailsWidth: toText(values.detailsWidth),
      priceRupees: Number(values.priceRupees || 0),
      attributeValues: values.attributeValues ?? {},
    };
  };

  const handleGenerateStory = async () => {
    if (!isOnline) {
      toast.info("You’re offline. AI story generation needs internet.");
      return;
    }

    const context = buildStoryGenerationContext();

    if (!hasUsefulContext(context)) {
      toast.info(
        "Add a little context first — product name, fabric, provenance, era, or a rough note.",
      );
      return;
    }

    setIsGeneratingStory(true);

    try {
      const response = await fetch("/api/v2/product-story/generate", {
        body: JSON.stringify({ product: context }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json()) as {
        message?: string;
        storyNarrative?: string;
        storyTitle?: string;
      };

      if (!response.ok) {
        throw new Error(data.message || `Story generation failed.`);
      }

      if (!data.storyNarrative?.trim()) {
        throw new Error("The generated story was empty. Please try again.");
      }

      const currentValues = form.state.values as ProductStepperValues;

      if (!currentValues.storyTitle?.trim() && data.storyTitle?.trim()) {
        form.setFieldValue("storyTitle", data.storyTitle.trim());
      }

      form.setFieldValue("storyNarrative", data.storyNarrative.trim());

      toast.success(
        currentValues.storyNarrative?.trim()
          ? "Story improved."
          : "Story generated.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Story generation failed.";
      toast.error(message);
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const narrativeValue = toText(form.state.values?.storyNarrative);
  const generateButtonLabel = narrativeValue
    ? "Improve story"
    : "Generate story";

  return (
    <div className="space-y-4">
      <form.Field name="storyTitle">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="story-title">Story title</Label>
            <Input
              id="story-title"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="A Legacy Weave from Tanjore"
              value={field.state.value ?? ""}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="storyNarrative">
        {(field: any) => (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="story-narrative">Narrative</Label>
                <p className="text-xs text-muted-foreground">
                  Uses product details, provenance, era, attributes, and rough
                  notes to draft the FTT story.
                </p>
                {!isOnline ? (
                  <p className="text-xs text-orange-600">
                    AI story generation is unavailable offline. Manual edits are
                    still saved locally.
                  </p>
                ) : null}
              </div>

              <Button
                className="gap-1.5"
                disabled={!isOnline || isGeneratingStory}
                onClick={handleGenerateStory}
                size="sm"
                type="button"
                variant="outline"
              >
                {!isOnline ? (
                  <>
                    <WifiOff className="h-3.5 w-3.5" />
                    Offline
                  </>
                ) : isGeneratingStory ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Writing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {generateButtonLabel}
                  </>
                )}
              </Button>
            </div>

            <Textarea
              className="min-h-36"
              id="story-narrative"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Share provenance, previous owner story, restoration details..."
              value={field.state.value ?? ""}
            />
          </div>
        )}
      </form.Field>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="storyProvenance">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="story-provenance">Provenance</Label>
              <Input
                id="story-provenance"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Single-owner collection, Chennai"
                value={field.state.value ?? ""}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="storyEra">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="story-era">Era</Label>
              <Input
                id="story-era"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="1990s"
                value={field.state.value ?? ""}
              />
            </div>
          )}
        </form.Field>
      </div>
    </div>
  );
}
