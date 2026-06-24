"use client";

import gsap from "gsap";
import { useForm, useStore } from "@tanstack/react-form";
import {
  BookOpen,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toPaise } from "@/db/money";
import {
  PRODUCT_STORY_APPLIED_EVENT,
  type ProductStoryAppliedEventDetail,
} from "@/lib/products/story-application";
import { cn, slugify } from "@/lib/utils";

import { LivePreviewCard } from "./live-preview-card";
import { hasStepperChanges, serializeStepperValues } from "./autosave";
import { buildAttributePayload } from "./attributes";
import { getAvailabilitySaveFields } from "./availability";
import {
  clearProductStepperLocalDraft,
  formatLocalDraftAge,
  getProductStepperLocalDraftKey,
  readProductStepperLocalDraft,
  saveProductStepperLocalDraft,
  type ProductStepperLocalDraft,
} from "./local-draft";
import { useNetworkStatus } from "./network-sync";
import { StepAttributes } from "./step-attributes";
import { StepDetails } from "./step-details";
import { StepPhotos } from "./step-photos";
import { StepPreview } from "./step-preview";
import { StepPricing } from "./step-pricing";
import { StepStory } from "./step-story";
import { StepTypeSelection } from "./step-type-selection";
// TEMP debugging — remove together with _render-log.ts
import { useRenderLog, logEvent, onRenderProfiler } from "./_render-log";
import {
  defaultStepperValues,
  type ProductStepperMedia,
  type ProductStepperValues,
} from "./types";

type ProductStepperProps = {
  initialMedia?: ProductStepperMedia[];
  initialValues?: Partial<ProductStepperValues>;
  productId?: string;
};

const steps = [
  {
    id: "type",
    label: "Type",
    icon: Box,
  },
  {
    id: "photos",
    label: "Photos",
    icon: ImageIcon,
  },
  {
    id: "details",
    label: "Details",
    icon: FileText,
  },
  {
    id: "attributes",
    label: "Attributes",
    icon: ListChecks,
  },
  {
    id: "story",
    label: "Story",
    icon: BookOpen,
  },
  {
    id: "pricing",
    label: "Pricing",
    icon: DollarSign,
  },
  {
    id: "preview",
    label: "Preview",
    icon: Eye,
  },
] as const;

type StepId = (typeof steps)[number]["id"];

const emptyInitialMedia: ProductStepperMedia[] = [];
const QUEUED_SYNC_RETRY_DELAY_MS = 15_000;

const toNullableText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function ProductStepper({
  initialMedia = emptyInitialMedia,
  initialValues,
  productId,
}: ProductStepperProps) {
  const router = useRouter();
  const [activeProductId, setActiveProductId] = useState(productId ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBlockingSave, setIsBlockingSave] = useState(false);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [uploaded, setUploaded] = useState<ProductStepperMedia[]>(
    () => initialMedia,
  );

  const [syncedMedia, setSyncedMedia] = useState(initialMedia);
  const [availableLocalDraft, setAvailableLocalDraft] =
    useState<ProductStepperLocalDraft | null>(null);
  const [availableLocalDraftAge, setAvailableLocalDraftAge] = useState("");
  const [isLocalDraftHydrated, setIsLocalDraftHydrated] = useState(false);
  const [localDraftStatus, setLocalDraftStatus] = useState<string | null>(null);
  const [pendingServerSync, setPendingServerSync] = useState(false);
  const [isSyncingQueuedDraft, setIsSyncingQueuedDraft] = useState(false);

  const isOnline = useNetworkStatus();

  const aiStoryPendingSaveRef = useRef(false);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const lastLocalDraftSnapshotRef = useRef<string | null>(null);
  const lastLocalDraftStepRef = useRef<number | null>(null);
  const nextQueuedSyncAttemptAtRef = useRef(0);

  const [localDraftKey] = useState(() =>
    getProductStepperLocalDraftKey(productId ?? null),
  );

  const mergedInitialValues = useMemo<ProductStepperValues>(
    () => ({
      ...defaultStepperValues,
      ...initialValues,
    }),
    [initialValues],
  );

  const initialSnapshotValues = useMemo<ProductStepperValues>(
    () => ({
      ...mergedInitialValues,
      imageMediaIds: initialMedia.map((media) => media.id),
    }),
    [initialMedia, mergedInitialValues],
  );

  const initialPersistedSnapshot = useMemo(
    () => serializeStepperValues(initialSnapshotValues),
    [initialSnapshotValues],
  );

  const [persistedSnapshot, setPersistedSnapshot] = useState(
    initialPersistedSnapshot,
  );

  const lastPersistedSnapshotRef = useRef(initialPersistedSnapshot);
  const lastPersistedValuesRef = useRef<ProductStepperValues>(
    initialSnapshotValues,
  );
  const lastPersistedMediaRef = useRef<ProductStepperMedia[]>(initialMedia);

  useEffect(() => {
    lastPersistedSnapshotRef.current = initialPersistedSnapshot;
    lastPersistedValuesRef.current = initialSnapshotValues;
    lastPersistedMediaRef.current = initialMedia;
  }, [initialPersistedSnapshot, initialMedia, initialSnapshotValues]);

  const persistProduct = useCallback(
    async (values: ProductStepperValues, forceDraft: boolean) => {
      setIsSaving(true);
      setSaveState(forceDraft ? "Auto-saving draft..." : "Saving product...");

      const visibleImageMediaIds = uploaded.map((media) => media.id);
      const valuesForSnapshot: ProductStepperValues = {
        ...values,
        imageMediaIds: visibleImageMediaIds,
      };
      const currentSnapshot = serializeStepperValues(valuesForSnapshot);

      const availability = getAvailabilitySaveFields(values);
      const attributePayload = buildAttributePayload(values);

      const payload = {
        attributes: attributePayload.attributes,
        typeId: attributePayload.typeId,
        collectionId: values.collectionId.trim() || null,
        detailsCondition: toNullableText(values.detailsCondition),
        detailsDesigner: toNullableText(values.detailsDesigner),
        detailsFabric: toNullableText(values.detailsFabric),
        detailsLength: toNullableText(values.detailsLength),
        detailsWidth: toNullableText(values.detailsWidth),
        featured: values.featured,
        imageMediaIds: visibleImageMediaIds,
        name:
          values.name.trim() || values.storyTitle.trim() || "Untitled Product",
        originalPricePaise:
          values.originalPriceRupees > 0
            ? toPaise(values.originalPriceRupees)
            : null,
        pricePaise: toPaise(values.priceRupees || 0),
        slug:
          values.slug.trim().length > 0
            ? values.slug.trim()
            : slugify(values.storyTitle || values.name || "untitled-product"),
        status: forceDraft ? "draft" : values.status,
        reservedUntil: availability.reservedUntil,
        soldAt: availability.soldAt,
        stockStatus: availability.stockStatus,
        storyEra: toNullableText(values.storyEra),
        storyNarrative: toNullableText(values.storyNarrative),
        storyProvenance: toNullableText(values.storyProvenance),
        storyTitle: values.storyTitle.trim() || "Untitled Product",
        tagIds: values.tagsCsv
          .split(",")
          .map((item) => Number(item.trim()))
          .filter((value) => Number.isInteger(value) && value > 0),
      };

      let shouldKeepSaveOverlay = false;

      try {
        const endpoint = activeProductId
          ? `/api/v2/products/${activeProductId}`
          : "/api/v2/products";
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
        }

        lastPersistedSnapshotRef.current = currentSnapshot;
        lastPersistedValuesRef.current = valuesForSnapshot;
        lastPersistedMediaRef.current = uploaded;
        nextQueuedSyncAttemptAtRef.current = 0;
        setPersistedSnapshot(currentSnapshot);
        setPendingServerSync(false);
        setIsSyncingQueuedDraft(false);

        const didPersistAiStory = aiStoryPendingSaveRef.current;
        if (didPersistAiStory) {
          aiStoryPendingSaveRef.current = false;
        }

        setSaveState(
          didPersistAiStory
            ? "AI story saved"
            : forceDraft
              ? "Draft auto-saved"
              : "Saved",
        );

        if (forceDraft) {
          setLocalDraftStatus("Server draft saved");
        }

        if (didPersistAiStory) {
          toast.success("AI story saved.", { duration: 1200 });
        } else if (forceDraft) {
          toast.success("Draft auto-saved.", { duration: 1200 });
        } else if (isCreate) {
          toast.success("Product created.");
        } else {
          toast.success("Changes saved.");
        }

        if (!forceDraft) {
          clearProductStepperLocalDraft(localDraftKey);
          setLocalDraftStatus(null);
          setPendingServerSync(false);
          setSaveState("Saved. Taking you back to products...");
          shouldKeepSaveOverlay = true;
          router.push("/products");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Save failed";

        if (forceDraft) {
          nextQueuedSyncAttemptAtRef.current =
            Date.now() + QUEUED_SYNC_RETRY_DELAY_MS;
          setPendingServerSync(true);
          setIsSyncingQueuedDraft(false);
          setLocalDraftStatus(
            isOnline
              ? "Sync failed — saved locally"
              : "Offline — changes saved locally",
          );
          setSaveState("Server autosave failed. Changes are saved locally.");
          toast.error(message, { duration: 1600 });
        } else {
          setSaveState(message);
          setIsBlockingSave(false);
          toast.error(message);
        }
      } finally {
        if (!shouldKeepSaveOverlay) {
          setIsSaving(false);
          setIsBlockingSave(false);
        }
      }
    },
    [activeProductId, isOnline, localDraftKey, router, uploaded],
  );

  const form = useForm({
    defaultValues: mergedInitialValues,
    onSubmit: async ({ value }) => {
      if (!isOnline) {
        const offlineValues: ProductStepperValues = {
          ...value,
          imageMediaIds: uploaded.map((media) => media.id),
        };
        const offlineSnapshot = serializeStepperValues(offlineValues);

        saveProductStepperLocalDraft(localDraftKey, {
          media: uploaded,
          productId: activeProductId,
          stepIndex,
          values: offlineValues,
        });

        lastLocalDraftSnapshotRef.current = offlineSnapshot;
        lastLocalDraftStepRef.current = stepIndex;
        nextQueuedSyncAttemptAtRef.current = 0;

        setPendingServerSync(true);
        setLocalDraftStatus("Offline — changes saved locally");
        setSaveState("Offline — changes saved locally");

        toast.info(
          "You're offline. Changes are saved locally and will sync when you're back online.",
        );
        return;
      }

      setIsBlockingSave(true);
      await persistProduct(value, false);
    },
  });

  const setProductFieldValue = form.setFieldValue;

  if (syncedMedia !== initialMedia) {
    setSyncedMedia(initialMedia);
    setUploaded(initialMedia);
  }

  useEffect(() => {
    setProductFieldValue(
      "imageMediaIds",
      initialMedia.map((media) => media.id),
    );
  }, [initialMedia, setProductFieldValue]);

  const liveValues = useStore(form.store, (state) => state.values);

  const previewImageUrls = useMemo(
    () => uploaded.map((media) => ({ id: media.id, url: media.url })),
    [uploaded],
  );

  const [previewValues, setPreviewValues] = useState(liveValues);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const draft = readProductStepperLocalDraft(localDraftKey);

      if (!draft) {
        setIsLocalDraftHydrated(true);
        return;
      }

      const safeStepIndex = Math.min(
        Math.max(0, draft.stepIndex),
        steps.length - 1,
      );

      const draftSnapshotValues: ProductStepperValues = {
        ...draft.values,
        imageMediaIds: draft.media.map((media) => media.id),
      };
      const draftSnapshot = serializeStepperValues(draftSnapshotValues);

      setStepIndex(safeStepIndex);

      if (draftSnapshot !== initialPersistedSnapshot) {
        setAvailableLocalDraft(draft);
        setAvailableLocalDraftAge(formatLocalDraftAge(draft.updatedAt));
        setSaveState("Local draft found");
      }

      setIsLocalDraftHydrated(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [initialPersistedSnapshot, localDraftKey]);

  const handleResumeLocalDraft = useCallback(() => {
    if (!availableLocalDraft) return;

    const safeStepIndex = Math.min(
      Math.max(0, availableLocalDraft.stepIndex),
      steps.length - 1,
    );

    form.reset(availableLocalDraft.values);
    setUploaded(availableLocalDraft.media);
    setPreviewValues(availableLocalDraft.values);
    setStepIndex(safeStepIndex);
    setAvailableLocalDraft(null);
    setPendingServerSync(true);
    setLocalDraftStatus(
      isOnline
        ? `Resumed local draft from ${availableLocalDraftAge}. Waiting to sync.`
        : `Resumed local draft from ${availableLocalDraftAge}. Saved locally.`,
    );
    setSaveState("Local draft resumed");

    toast.success("Local draft resumed.");
  }, [availableLocalDraft, availableLocalDraftAge, form, isOnline]);

  const handleDiscardLocalDraft = useCallback(() => {
    clearProductStepperLocalDraft(localDraftKey);
    setAvailableLocalDraft(null);
    setAvailableLocalDraftAge("");
    setLocalDraftStatus(null);
    setPendingServerSync(false);
    setIsSyncingQueuedDraft(false);
    setSaveState("Local draft discarded");

    toast.info("Local draft discarded.");
  }, [localDraftKey]);

  const goToPreviousStep = useCallback(() => {
    setStepIndex((value) => Math.max(0, value - 1));
  }, []);

  const goToNextStep = useCallback(() => {
    setStepIndex((value) => Math.min(steps.length - 1, value + 1));
  }, []);

  const handleStoryApplied = useCallback(
    (event: Event) => {
      const { detail } = event as CustomEvent<ProductStoryAppliedEventDetail>;
      if (!detail || detail.productId !== activeProductId) return;

      if (detail.values.storyTitle) {
        setProductFieldValue("storyTitle", detail.values.storyTitle);
      }
      if (detail.values.storyNarrative) {
        setProductFieldValue("storyNarrative", detail.values.storyNarrative);
      }
      if (detail.values.storyProvenance) {
        setProductFieldValue("storyProvenance", detail.values.storyProvenance);
      }
      if (detail.values.storyEra) {
        setProductFieldValue("storyEra", detail.values.storyEra);
      }

      aiStoryPendingSaveRef.current = true;
      setSaveState("AI story updated locally");
    },
    [activeProductId, setProductFieldValue],
  );

  useEffect(() => {
    window.addEventListener(PRODUCT_STORY_APPLIED_EVENT, handleStoryApplied);
    return () => {
      window.removeEventListener(
        PRODUCT_STORY_APPLIED_EVENT,
        handleStoryApplied,
      );
    };
  }, [handleStoryApplied]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (
        isBlockingSave ||
        isSyncingQueuedDraft ||
        pendingServerSync ||
        !isOnline
      ) {
        return;
      }

      const autosaveValues: ProductStepperValues = {
        ...form.state.values,
        imageMediaIds: uploaded.map((media) => media.id),
      };

      if (
        !hasStepperChanges(autosaveValues, lastPersistedSnapshotRef.current)
      ) {
        return;
      }

      void persistProduct(autosaveValues, true);
    }, 30_000);

    return () => {
      window.clearInterval(id);
    };
  }, [
    form,
    isBlockingSave,
    isOnline,
    isSyncingQueuedDraft,
    pendingServerSync,
    persistProduct,
    uploaded,
  ]);

  useEffect(() => {
    if (!isLocalDraftHydrated || availableLocalDraft || isBlockingSave) {
      return;
    }

    const localValues: ProductStepperValues = {
      ...liveValues,
      imageMediaIds: uploaded.map((media) => media.id),
    };
    const localSnapshot = serializeStepperValues(localValues);

    if (
      localSnapshot === lastLocalDraftSnapshotRef.current &&
      stepIndex === lastLocalDraftStepRef.current
    ) {
      return;
    }

    const id = window.setTimeout(() => {
      saveProductStepperLocalDraft(localDraftKey, {
        media: uploaded,
        productId: activeProductId,
        stepIndex,
        values: localValues,
      });

      const hasServerChanges = hasStepperChanges(
        localValues,
        lastPersistedSnapshotRef.current,
      );

      lastLocalDraftSnapshotRef.current = localSnapshot;
      lastLocalDraftStepRef.current = stepIndex;

      if (!isOnline && hasServerChanges) {
        nextQueuedSyncAttemptAtRef.current = 0;
        setPendingServerSync(true);
        setLocalDraftStatus("Offline — changes saved locally");
      } else {
        setLocalDraftStatus("Saved locally");
      }
    }, 500);

    return () => {
      window.clearTimeout(id);
    };
  }, [
    activeProductId,
    availableLocalDraft,
    isBlockingSave,
    isLocalDraftHydrated,
    isOnline,
    liveValues,
    localDraftKey,
    stepIndex,
    uploaded,
  ]);

  useEffect(() => {
    if (
      !isOnline ||
      !pendingServerSync ||
      isBlockingSave ||
      isSaving ||
      availableLocalDraft
    ) {
      return;
    }

    const delayMs = Math.max(
      0,
      nextQueuedSyncAttemptAtRef.current - Date.now(),
    );

    const id = window.setTimeout(() => {
      const syncValues: ProductStepperValues = {
        ...form.state.values,
        imageMediaIds: uploaded.map((media) => media.id),
      };

      if (!hasStepperChanges(syncValues, lastPersistedSnapshotRef.current)) {
        setPendingServerSync(false);
        setIsSyncingQueuedDraft(false);
        setLocalDraftStatus("Server draft saved");
        return;
      }

      setIsSyncingQueuedDraft(true);
      setLocalDraftStatus("Syncing local draft...");

      void persistProduct(syncValues, true).finally(() => {
        setIsSyncingQueuedDraft(false);
      });
    }, delayMs);

    return () => {
      window.clearTimeout(id);
    };
  }, [
    availableLocalDraft,
    form,
    isBlockingSave,
    isOnline,
    isSaving,
    pendingServerSync,
    persistProduct,
    uploaded,
  ]);

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
      },
    );
  }, [stepIndex]);

  useEffect(() => {
    logEvent("debounce armed (liveValues ref changed)");
    const id = window.setTimeout(() => {
      logEvent("debounce -> setPreviewValues fired");
      setPreviewValues(liveValues);
    }, 200);

    return () => window.clearTimeout(id);
  }, [liveValues]);

  useRenderLog("ProductStepper", {
    "form.state.values": liveValues,
    previewValues,
    previewImageUrls,
  });

  const stepCompletion = useMemo<Record<StepId, boolean>>(
    () => ({
      type: Boolean(liveValues.typeId),
      photos:
        uploaded.length > 0 || (liveValues.imageMediaIds?.length ?? 0) > 0,
      details: Boolean(
        liveValues.name.trim() &&
        liveValues.slug.trim() &&
        liveValues.detailsFabric.trim() &&
        liveValues.detailsCondition.trim(),
      ),
      attributes: Boolean(liveValues.typeId),
      story: Boolean(
        liveValues.storyTitle.trim() || liveValues.storyNarrative.trim(),
      ),
      pricing: liveValues.priceRupees > 0,
      preview: Boolean(
        liveValues.typeId &&
        (uploaded.length > 0 || (liveValues.imageMediaIds?.length ?? 0) > 0) &&
        liveValues.name.trim() &&
        liveValues.slug.trim() &&
        liveValues.priceRupees > 0,
      ),
    }),
    [liveValues, uploaded.length],
  );

  const liveValuesForDirtyCheck = useMemo<ProductStepperValues>(
    () => ({
      ...liveValues,
      imageMediaIds: uploaded.map((media) => media.id),
    }),
    [liveValues, uploaded],
  );

  const hasUnsavedChanges = hasStepperChanges(
    liveValuesForDirtyCheck,
    persistedSnapshot,
  );

  const currentStep = steps[stepIndex] ?? steps[0];
  const isEditingProduct = Boolean(activeProductId);
  const canCreateFromPreview =
    !isEditingProduct && stepIndex === steps.length - 1;

  const saveStatusLabel = isSyncingQueuedDraft
    ? "Syncing local draft..."
    : isSaving
      ? saveState || "Saving..."
      : !isOnline && hasUnsavedChanges
        ? "Offline — changes saved locally"
        : pendingServerSync
          ? isOnline
            ? "Waiting to sync local draft..."
            : "Offline — changes saved locally"
          : hasUnsavedChanges
            ? (localDraftStatus ?? "Unsaved changes")
            : (saveState ??
              localDraftStatus ??
              "Changes auto-save after edits");

  const handleDiscardChanges = useCallback(() => {
    const persistedValues = lastPersistedValuesRef.current;
    const persistedMedia = lastPersistedMediaRef.current;

    clearProductStepperLocalDraft(localDraftKey);
    form.reset(persistedValues);
    setUploaded(persistedMedia);
    setPreviewValues(persistedValues);
    setLocalDraftStatus(null);
    setPendingServerSync(false);
    setIsSyncingQueuedDraft(false);
    setSaveState("Changes discarded");

    toast.info("Changes discarded.");
  }, [form, localDraftKey]);

  const handleBackToProducts = useCallback(() => {
    router.push("/products");
  }, [router]);

  return (
    <>
      {isBlockingSave ? (
        <div className="fixed inset-0 z-100 grid place-items-center bg-background/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Saving product...</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Please wait while we save the product and take you back to the
              products page.
            </p>
          </div>
        </div>
      ) : null}

      <div
        aria-busy={isBlockingSave}
        className="@container grid gap-6 @5xl:grid-cols-[1fr_320px]"
      >
        <div className="space-y-4">
          {availableLocalDraft ? (
            <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-4 text-amber-950 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Local draft found</p>
                  <p className="text-sm text-amber-900/80">
                    A browser draft from {availableLocalDraftAge} is available.
                    Resume it to recover unsynced changes, or discard it to keep
                    the server version.
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    onClick={handleDiscardLocalDraft}
                    type="button"
                    variant="outline"
                  >
                    Discard local draft
                  </Button>
                  <Button onClick={handleResumeLocalDraft} type="button">
                    Resume local draft
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {!isOnline || pendingServerSync || isSyncingQueuedDraft ? (
            <div
              className={cn(
                "rounded-2xl border p-3 text-sm shadow-sm",
                !isOnline
                  ? "border-orange-300/70 bg-orange-50 text-orange-950"
                  : "border-blue-300/70 bg-blue-50 text-blue-950",
              )}
            >
              <div className="flex items-start gap-2">
                {!isOnline ? (
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <RefreshCw
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      isSyncingQueuedDraft && "animate-spin",
                    )}
                  />
                )}
                <div>
                  <p className="font-medium">
                    {!isOnline
                      ? "Offline mode"
                      : isSyncingQueuedDraft
                        ? "Syncing local draft"
                        : "Local draft waiting to sync"}
                  </p>
                  <p className="mt-1 opacity-80">
                    {!isOnline
                      ? "Changes are being saved locally. They will sync to the server when your connection returns."
                      : "Your browser draft is saved locally and will be pushed to the server shortly."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <div className="grid gap-3 xl:grid-cols-[1fr_auto_1fr] xl:items-center">
              <div className="hidden min-w-0 xl:block">
                <p className="truncate text-xs text-muted-foreground">
                  Step {stepIndex + 1} of {steps.length}
                </p>
                <p className="truncate text-sm font-medium">
                  {currentStep.label}
                </p>
              </div>

              <TooltipProvider delayDuration={120}>
                <div className="flex min-w-0 justify-center">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label="Previous step"
                          className="h-10 w-10 rounded-full"
                          disabled={stepIndex === 0 || isBlockingSave}
                          onClick={goToPreviousStep}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Previous step</p>
                      </TooltipContent>
                    </Tooltip>

                    {steps.map((step, index) => {
                      const Icon = step.icon;
                      const isCurrent = stepIndex === index;
                      const isComplete = stepCompletion[step.id];

                      return (
                        <Tooltip key={step.id}>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label={step.label}
                              className={cn(
                                "relative h-10 w-10 rounded-full transition",
                                !isCurrent &&
                                  !isComplete &&
                                  "opacity-35 hover:opacity-70",
                                isCurrent &&
                                  "animate-pulse ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
                              )}
                              disabled={isBlockingSave}
                              onClick={() => setStepIndex(index)}
                              size="icon"
                              type="button"
                              variant={
                                isCurrent
                                  ? "default"
                                  : isComplete
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              <Icon className="h-4 w-4" />
                              {isComplete ? (
                                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                                  <CheckCircle2 className="h-3 w-3" />
                                </span>
                              ) : null}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>
                              {index + 1}. {step.label}
                              {isComplete ? " · Complete" : " · Incomplete"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label="Next step"
                          className="h-10 w-10 rounded-full"
                          disabled={
                            stepIndex === steps.length - 1 || isBlockingSave
                          }
                          onClick={goToNextStep}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Next step</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </TooltipProvider>

              <div className="flex flex-wrap items-center justify-center gap-2 xl:justify-end">
                {isEditingProduct ? (
                  hasUnsavedChanges ? (
                    <>
                      <Button
                        disabled={isBlockingSave || isSaving}
                        onClick={handleDiscardChanges}
                        type="button"
                        variant="outline"
                      >
                        Discard changes
                      </Button>
                      <Button
                        disabled={isBlockingSave || isSaving}
                        onClick={() => void form.handleSubmit()}
                        type="button"
                      >
                        {isBlockingSave ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : !isOnline ? (
                          "Save locally"
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={isBlockingSave || isSaving}
                      onClick={handleBackToProducts}
                      type="button"
                      variant="outline"
                    >
                      Back to products
                    </Button>
                  )
                ) : canCreateFromPreview ? (
                  <Button
                    disabled={isBlockingSave || isSaving}
                    onClick={() => void form.handleSubmit()}
                    type="button"
                  >
                    {isBlockingSave ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : !isOnline ? (
                      "Save locally"
                    ) : (
                      "Save Product"
                    )}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground xl:hidden">
              <span>
                Step {stepIndex + 1} of {steps.length}: {currentStep.label}
              </span>
              <span>{saveStatusLabel}</span>
            </div>

            <div className="mt-3 hidden flex-wrap items-center justify-end gap-2 border-t pt-3 text-xs text-muted-foreground xl:flex">
              <span>{saveStatusLabel}</span>
            </div>

            {/*
              AI Assist temporarily hidden.
            */}
          </div>

          <Profiler id="step-area" onRender={onRenderProfiler}>
            <div ref={stepContainerRef}>
              {stepIndex === 0 ? (
                <StepTypeSelection
                  autoAdvanceOnSelect={!activeProductId}
                  form={form}
                  onTypeSelected={goToNextStep}
                />
              ) : null}
              {stepIndex === 1 ? (
                <StepPhotos
                  form={form}
                  setUploaded={setUploaded}
                  uploaded={uploaded}
                />
              ) : null}
              {stepIndex === 2 ? <StepDetails form={form} /> : null}
              {stepIndex === 3 ? <StepAttributes form={form} /> : null}
              {stepIndex === 4 ? <StepStory form={form} /> : null}
              {stepIndex === 5 ? <StepPricing form={form} /> : null}
              {stepIndex === 6 ? <StepPreview values={liveValues} /> : null}
            </div>
          </Profiler>
        </div>

        <Profiler id="live-preview" onRender={onRenderProfiler}>
          <LivePreviewCard
            imageUrls={previewImageUrls}
            values={previewValues}
          />
        </Profiler>
      </div>
    </>
  );
}

export { mapProductToStepperValues } from "./types";
