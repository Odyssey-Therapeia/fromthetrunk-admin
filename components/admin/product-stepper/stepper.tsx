"use client";

import gsap from "gsap";
import { useForm } from "@tanstack/react-form";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { toPaise } from "@/db/money";
import { useAgentStore } from "@/lib/store/agent-store";
import { slugify } from "@/lib/utils";

import { LivePreviewCard } from "./live-preview-card";
import { StepDetails } from "./step-details";
import { StepPhotos } from "./step-photos";
import { StepPreview } from "./step-preview";
import { StepPricing } from "./step-pricing";
import { StepStory } from "./step-story";
import {
  defaultStepperValues,
  type ProductStepperMedia,
  type ProductStepperValues,
} from "./types";

type ProductStepperProps = {
  initialValues?: Partial<ProductStepperValues>;
  productId?: string;
};

const steps = ["Photos", "Details", "Story", "Pricing", "Preview"] as const;

const toNullableText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function ProductStepper({
  initialValues,
  productId,
}: ProductStepperProps) {
  const router = useRouter();
  const [activeProductId, setActiveProductId] = useState(productId ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [uploaded, setUploaded] = useState<ProductStepperMedia[]>([]);
  const stepContainerRef = useRef<HTMLDivElement>(null);

  const { open: openAgent, anchorProduct } = useAgentStore();

  const mergedInitialValues = useMemo<ProductStepperValues>(
    () => ({
      ...defaultStepperValues,
      ...initialValues,
    }),
    [initialValues]
  );

  const persistProduct = useCallback(async (values: ProductStepperValues, forceDraft: boolean) => {
    setIsSaving(true);
    setSaveState("Saving...");

    const payload = {
      collectionId: values.collectionId.trim() || null,
      detailsCondition: toNullableText(values.detailsCondition),
      detailsDesigner: toNullableText(values.detailsDesigner),
      detailsFabric: toNullableText(values.detailsFabric),
      detailsLength: toNullableText(values.detailsLength),
      detailsWidth: toNullableText(values.detailsWidth),
      featured: values.featured,
      imageMediaIds: values.imageMediaIds,
      name: values.name.trim() || values.storyTitle.trim() || "Untitled Product",
      originalPricePaise:
        values.originalPriceRupees > 0 ? toPaise(values.originalPriceRupees) : null,
      pricePaise: toPaise(values.priceRupees || 0),
      slug:
        values.slug.trim().length > 0
          ? values.slug.trim()
          : slugify(values.storyTitle || values.name || "untitled-product"),
      status: forceDraft ? "draft" : values.status,
      stockStatus: "available",
      storyEra: toNullableText(values.storyEra),
      storyNarrative: toNullableText(values.storyNarrative),
      storyProvenance: toNullableText(values.storyProvenance),
      storyTitle: values.storyTitle.trim() || "Untitled Product",
      tagIds: values.tagsCsv
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    };

    try {
      const endpoint = activeProductId ? `/api/v2/products/${activeProductId}` : "/api/v2/products";
      const method = activeProductId ? "PATCH" : "POST";
      const isCreate = !activeProductId;

      const response = await fetch(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method,
      });

      if (!response.ok) {
        let message = `Save failed with ${response.status}`;
        try {
          const data = (await response.json()) as { message?: string };
          if (typeof data.message === "string" && data.message.length > 0) {
            message = data.message;
          }
        } catch {
          // no-op
        }
        throw new Error(message);
      }

      const data = await response.json();
      if (!activeProductId && data.id) {
        setActiveProductId(data.id);
        router.replace(`/admin/products/${data.id}`);
      }

      setSaveState(forceDraft ? "Draft auto-saved" : "Saved");
      if (forceDraft) {
        toast.success("Draft auto-saved.", { duration: 1200 });
      } else if (isCreate) {
        toast.success("Product created.");
      } else {
        toast.success("Changes saved.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setSaveState(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [activeProductId, router]);

  const form = useForm({
    defaultValues: mergedInitialValues,
    onSubmit: async ({ value }) => {
      await persistProduct(value, false);
    },
  });

  const handleAiAssist = () => {
    const name =
      form.state.values.name.trim() ||
      form.state.values.storyTitle.trim() ||
      "Untitled Product";
    anchorProduct(activeProductId, name);
    openAgent();
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      void persistProduct(form.state.values, true);
    }, 30_000);

    return () => {
      window.clearInterval(id);
    };
  }, [form, persistProduct]);

  useEffect(() => {
    if (!stepContainerRef.current) return;
    gsap.fromTo(
      stepContainerRef.current,
      {
        opacity: 0,
        x: 24,
      },
      {
        duration: 0.25,
        opacity: 1,
        x: 0,
      }
    );
  }, [stepIndex]);

  return (
    <div className="@container grid gap-6 @5xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((step, index) => (
            <Button
              key={step}
              onClick={() => setStepIndex(index)}
              size="sm"
              type="button"
              variant={stepIndex === index ? "default" : "outline"}
            >
              {index + 1}. {step}
            </Button>
          ))}
          <div className="ml-auto">
            <Button
              onClick={handleAiAssist}
              size="sm"
              type="button"
              variant="outline"
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Assist
            </Button>
          </div>
        </div>

        <div ref={stepContainerRef}>
          {stepIndex === 0 ? (
            <StepPhotos form={form} setUploaded={setUploaded} uploaded={uploaded} />
          ) : null}
          {stepIndex === 1 ? <StepDetails form={form} /> : null}
          {stepIndex === 2 ? <StepStory form={form} /> : null}
          {stepIndex === 3 ? <StepPricing form={form} /> : null}
          {stepIndex === 4 ? <StepPreview values={form.state.values} /> : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {isSaving ? "Saving..." : saveState ?? "Changes auto-save every 30 seconds"}
          </div>
          <div className="flex gap-2">
            <Button
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
              type="button"
              variant="outline"
            >
              Back
            </Button>
            {stepIndex < steps.length - 1 ? (
              <Button
                onClick={() => setStepIndex((value) => Math.min(steps.length - 1, value + 1))}
                type="button"
              >
                Next
              </Button>
            ) : (
              <Button onClick={() => void form.handleSubmit()} type="button">
                Save Product
              </Button>
            )}
          </div>
        </div>
      </div>

      <LivePreviewCard
        imageUrls={uploaded.map((media) => ({
          id: media.id,
          url: media.url,
        }))}
        values={form.state.values}
      />
    </div>
  );
}

export { mapProductToStepperValues } from "./types";
