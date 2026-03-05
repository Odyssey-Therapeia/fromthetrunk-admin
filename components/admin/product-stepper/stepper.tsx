"use client";

import gsap from "gsap";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toPaise, toRupees } from "@/db/money";

import { LivePreviewCard } from "./live-preview-card";
import { StepDetails } from "./step-details";
import { StepPhotos } from "./step-photos";
import { StepPreview } from "./step-preview";
import { StepPricing } from "./step-pricing";
import { StepStory } from "./step-story";
import { defaultStepperValues, ProductStepperValues } from "./types";

type ProductStepperProps = {
  initialValues?: Partial<ProductStepperValues>;
  productId?: string;
};

const steps = ["Photos", "Details", "Story", "Pricing", "Preview"] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
  const stepContainerRef = useRef<HTMLDivElement>(null);

  const mergedInitialValues = useMemo<ProductStepperValues>(
    () => ({
      ...defaultStepperValues,
      ...initialValues,
    }),
    [initialValues]
  );

  const form = useForm({
    defaultValues: mergedInitialValues,
    onSubmit: async ({ value }) => {
      await persistProduct(value, false);
    },
  });

  const persistProduct = async (values: ProductStepperValues, forceDraft: boolean) => {
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

      const response = await fetch(endpoint, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method,
      });

      if (!response.ok) {
        throw new Error(`Save failed with ${response.status}`);
      }

      const data = await response.json();
      if (!activeProductId && data.id) {
        setActiveProductId(data.id);
        router.replace(`/admin/products/${data.id}`);
      }

      setSaveState(forceDraft ? "Draft auto-saved" : "Saved");
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      void persistProduct(form.state.values, true);
    }, 30_000);

    return () => {
      window.clearInterval(id);
    };
  }, [form, activeProductId]);

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
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
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
        </div>

        <div ref={stepContainerRef}>
          {stepIndex === 0 ? <StepPhotos form={form} /> : null}
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

      <LivePreviewCard values={form.state.values} />
    </div>
  );
}

export const mapProductToStepperValues = (product: {
  collectionId?: null | string;
  detailsCondition?: null | string;
  detailsDesigner?: null | string;
  detailsFabric?: null | string;
  detailsLength?: null | string;
  detailsWidth?: null | string;
  featured?: boolean;
  images?: Array<{ media: { id: string } }>;
  name?: string;
  originalPricePaise?: null | number;
  pricePaise?: number;
  slug?: string;
  status?: "draft" | "published";
  storyEra?: null | string;
  storyNarrative?: null | string;
  storyProvenance?: null | string;
  storyTitle?: string;
  tags?: Array<{ id: number }>;
}): ProductStepperValues => ({
  collectionId: product.collectionId ?? "",
  detailsCondition: product.detailsCondition ?? "",
  detailsDesigner: product.detailsDesigner ?? "",
  detailsFabric: product.detailsFabric ?? "",
  detailsLength: product.detailsLength ?? "",
  detailsWidth: product.detailsWidth ?? "",
  featured: Boolean(product.featured),
  imageMediaIds: product.images?.map((image) => image.media.id) ?? [],
  name: product.name ?? "",
  originalPriceRupees: product.originalPricePaise ? toRupees(product.originalPricePaise) : 0,
  priceRupees: product.pricePaise ? toRupees(product.pricePaise) : 0,
  slug: product.slug ?? "",
  status: product.status ?? "draft",
  storyEra: product.storyEra ?? "",
  storyNarrative: product.storyNarrative ?? "",
  storyProvenance: product.storyProvenance ?? "",
  storyTitle: product.storyTitle ?? "",
  tagsCsv: product.tags?.map((tag) => tag.id).join(", ") ?? "",
});
