import { put } from "@vercel/blob/client";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Crop,
  ExternalLink,
  ImagePlus,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { ImageEditDialog } from "./image-edit-dialog";
import {
  deleteOfflineMediaQueueItem,
  listOfflineMediaQueueItems,
  markOfflineMediaQueueItemForAutoSync,
  updateOfflineMediaQueueItemAlt,
  upsertOfflineMediaQueueItem,
  type OfflineMediaQueueItem,
} from "./offline-media-queue";
import { useNetworkStatus } from "./network-sync";
import type { ProductStepperMedia, ProductStepperValues } from "./types";

type StepPhotosForm = {
  setFieldValue: (field: "imageMediaIds", value: string[]) => void;
  state: {
    values: Pick<ProductStepperValues, "imageMediaIds">;
  };
};

type StepPhotosProps = {
  form: StepPhotosForm;
  setUploaded: Dispatch<SetStateAction<ProductStepperMedia[]>>;
  uploaded: ProductStepperMedia[];
};

type UploadConfig =
  | {
      clientToken: string;
      mode?: "blob";
      pathname: string;
    }
  | {
      mode: "local";
    };

type UploadProgress = {
  filename: string;
  id: string;
  progress: number;
};

type PendingUploadDraft = {
  alt: string;
  file: File;
  id: string;
  previewUrl: string;
  queuedForAutoSync?: boolean;
  replaceMediaId?: string | null;
};

export function StepPhotos({ form, setUploaded, uploaded }: StepPhotosProps) {
  const isOnline = useNetworkStatus();

  const [isUploading, setIsUploading] = useState(false);
  const [isSyncingOfflineQueue, setIsSyncingOfflineQueue] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [offlineQueueError, setOfflineQueueError] = useState<string | null>(
    null,
  );
  const [offlineQueueStatus, setOfflineQueueStatus] = useState<string | null>(
    null,
  );
  const [offlineQueuedCount, setOfflineQueuedCount] = useState(0);
  const [isOfflineQueueHydrated, setIsOfflineQueueHydrated] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadProgress[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUploadDraft[]>(
    [],
  );
  const [draggingMediaId, setDraggingMediaId] = useState<null | string>(null);
  const [editingMedia, setEditingMedia] = useState<null | ProductStepperMedia>(
    null,
  );
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [isLoadingMediaLibrary, setIsLoadingMediaLibrary] = useState(false);
  const [mediaLibrary, setMediaLibrary] = useState<ProductStepperMedia[]>([]);

  const objectUrlsRef = useRef<Set<string>>(new Set());
  const uploadedRef = useRef(uploaded);
  const pendingUploadsRef = useRef<PendingUploadDraft[]>(pendingUploads);
  const autoUploadQueuedRef = useRef<() => void>(() => {});
  const localIdCounterRef = useRef(0);

  const [offlineQueueKey] = useState(() => {
    if (typeof window === "undefined") {
      return "ftt-admin:product-stepper:offline-media:server";
    }

    return `ftt-admin:product-stepper:offline-media:${window.location.pathname}`;
  });

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  useEffect(() => {
    uploadedRef.current = uploaded;
  }, [uploaded]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  const imageMediaIds = useMemo(
    () => form.state.values.imageMediaIds ?? [],
    [form.state.values.imageMediaIds],
  );

  const fetchMediaRows = useCallback(async () => {
    const response = await fetch("/api/v2/media");
    if (!response.ok) {
      throw new Error("Could not load media library.");
    }

    return (await response.json()) as ProductStepperMedia[];
  }, []);

  const refreshMediaLibrary = useCallback(async () => {
    setIsLoadingMediaLibrary(true);
    try {
      const mediaRows = await fetchMediaRows();
      setMediaLibrary(mediaRows);
      return mediaRows;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not load media library.";
      toast.error(message);
      return [];
    } finally {
      setIsLoadingMediaLibrary(false);
    }
  }, [fetchMediaRows]);

  const syncUploaded = useCallback(
    (next: ProductStepperMedia[]) => {
      uploadedRef.current = next;
      setUploaded(next);
      form.setFieldValue(
        "imageMediaIds",
        next.map((item) => item.id),
      );
    },
    [form, setUploaded],
  );

  useEffect(() => {
    if (imageMediaIds.length === 0 || uploaded.length > 0) return;
    let cancelled = false;

    const hydrateExistingMedia = async () => {
      try {
        const mediaRows = await fetchMediaRows();
        const mediaById = new Map(mediaRows.map((row) => [row.id, row]));
        const ordered = imageMediaIds
          .map((id) => mediaById.get(id))
          .filter((row): row is ProductStepperMedia => Boolean(row));

        if (!cancelled) {
          setMediaLibrary(mediaRows);
          syncUploaded(ordered);
        }
      } catch {
        // best effort only
      }
    };

    void hydrateExistingMedia();

    return () => {
      cancelled = true;
    };
  }, [fetchMediaRows, imageMediaIds, syncUploaded, uploaded.length]);

  const updateQueueProgress = (id: string, progress: number) => {
    setUploadQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, progress } : item)),
    );
  };

  const createLocalId = (label: string) => {
    const safeLabel =
      label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "upload";

    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${safeLabel}-${crypto.randomUUID()}`;
    }

    localIdCounterRef.current += 1;
    return `${safeLabel}-${localIdCounterRef.current}`;
  };

  const appendUploaded = (media: ProductStepperMedia) => {
    const current = uploadedRef.current;

    if (current.some((item) => item.id === media.id)) {
      return;
    }

    syncUploaded([...current, media]);
  };

  const generateAltTextFromFilename = (filename: string) => {
    const withoutExtension = filename.replace(/\.[^/.]+$/, "");
    const normalized = withoutExtension
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return normalized || "Product image";
  };

  const shouldBypassNextImageOptimization = (url: string) =>
    url.startsWith("/dev-uploads/") ||
    url.includes(".public.blob.vercel-storage.com");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const readErrorMessage = async (response: Response, fallback: string) => {
    try {
      const data = (await response.json()) as { message?: string };
      if (typeof data.message === "string" && data.message.length > 0) {
        return data.message;
      }
    } catch {
      // fall through
    }

    return fallback;
  };

  const toQueueItem = ({
    draft,
    queuedForAutoSync,
    source,
  }: {
    draft: PendingUploadDraft;
    queuedForAutoSync: boolean;
    source: OfflineMediaQueueItem["source"];
  }): OfflineMediaQueueItem => {
    const now = new Date().toISOString();

    return {
      alt: draft.alt,
      createdAt: now,
      file: draft.file,
      filename: draft.file.name,
      id: draft.id,
      mimeType: draft.file.type || "application/octet-stream",
      queueKey: offlineQueueKey,
      queuedForAutoSync,
      replaceMediaId: draft.replaceMediaId ?? null,
      size: draft.file.size,
      source,
      updatedAt: now,
    };
  };

  const refreshOfflineQueueCount = async () => {
    const items = await listOfflineMediaQueueItems(offlineQueueKey);
    setOfflineQueuedCount(items.length);
    return items.length;
  };

  useEffect(() => {
    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const queuedItems = await listOfflineMediaQueueItems(offlineQueueKey);

          if (cancelled) return;

          const restoredDrafts = queuedItems.map((item) => {
            const previewUrl = URL.createObjectURL(item.file);
            objectUrlsRef.current.add(previewUrl);

            return {
              alt: item.alt,
              file: item.file,
              id: item.id,
              previewUrl,
              queuedForAutoSync: item.queuedForAutoSync,
              replaceMediaId: item.replaceMediaId ?? null,
            } satisfies PendingUploadDraft;
          });

          setPendingUploads((current) => {
            const existingIds = new Set(current.map((item) => item.id));
            return [
              ...current,
              ...restoredDrafts.filter((item) => !existingIds.has(item.id)),
            ];
          });

          setOfflineQueuedCount(queuedItems.length);

          if (queuedItems.length > 0) {
            const autoSyncCount = queuedItems.filter(
              (item) => item.queuedForAutoSync,
            ).length;

            setOfflineQueueStatus(
              autoSyncCount > 0
                ? `${autoSyncCount} queued image${
                    autoSyncCount === 1 ? "" : "s"
                  } will upload when online.`
                : `${queuedItems.length} pending image${
                    queuedItems.length === 1 ? "" : "s"
                  } restored for review.`,
            );
          }

          setIsOfflineQueueHydrated(true);
        } catch (error) {
          if (cancelled) return;

          const message =
            error instanceof Error
              ? error.message
              : "Could not restore queued images.";
          setOfflineQueueError(message);
          setIsOfflineQueueHydrated(true);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [offlineQueueKey]);

  const enqueueUploads = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const queuedForAutoSync = !isOnline;

    const drafts = Array.from(files).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);

      return {
        alt: generateAltTextFromFilename(file.name),
        file,
        id: createLocalId(file.name),
        previewUrl,
        queuedForAutoSync,
        replaceMediaId: null,
      } satisfies PendingUploadDraft;
    });

    setUploadError(null);
    setOfflineQueueError(null);
    setPendingUploads((current) => [...current, ...drafts]);

    try {
      await Promise.all(
        drafts.map((draft) =>
          upsertOfflineMediaQueueItem(
            toQueueItem({
              draft,
              queuedForAutoSync,
              source: "selected",
            }),
          ),
        ),
      );

      const count = await refreshOfflineQueueCount();

      if (queuedForAutoSync) {
        setOfflineQueueStatus(
          `${drafts.length} image${drafts.length === 1 ? "" : "s"} saved locally and queued for upload.`,
        );
        toast.info(
          `${drafts.length} image${drafts.length === 1 ? "" : "s"} queued locally. They will upload when online.`,
        );
      } else if (count > 0) {
        setOfflineQueueStatus(
          `${count} pending image${count === 1 ? "" : "s"} saved locally until upload.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not save images for offline recovery.";
      setOfflineQueueError(message);
      toast.error(message);
    }
  };

  const updatePendingAlt = (id: string, alt: string) => {
    setPendingUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, alt } : item)),
    );

    void updateOfflineMediaQueueItemAlt(id, alt);
  };

  const removePendingUpload = (id: string) => {
    void deleteOfflineMediaQueueItem(id);
    setOfflineQueuedCount((count) => Math.max(0, count - 1));

    setPendingUploads((current) => {
      const target = current.find((item) => item.id === id);

      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrlsRef.current.delete(target.previewUrl);
      }

      return current.filter((item) => item.id !== id);
    });
  };

  const uploadFileToMedia = async ({
    alt,
    file,
    uploadId,
  }: {
    alt: string;
    file: File;
    uploadId: string;
  }) => {
    if (!isOnline) {
      throw new Error(
        "You are offline. The image is saved locally and will upload when online.",
      );
    }

    setUploadQueue((current) => [
      ...current,
      {
        filename: file.name,
        id: uploadId,
        progress: 5,
      },
    ]);

    const uploadConfigResponse = await fetch("/api/v2/media/upload", {
      body: JSON.stringify({
        contentType: file.type || "application/octet-stream",
        filename: file.name,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!uploadConfigResponse.ok) {
      throw new Error(
        await readErrorMessage(
          uploadConfigResponse,
          `Upload URL failed for ${file.name}.`,
        ),
      );
    }

    updateQueueProgress(uploadId, 30);

    const uploadConfig = (await uploadConfigResponse.json()) as UploadConfig;

    if (uploadConfig.mode === "local") {
      updateQueueProgress(uploadId, 60);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", alt.trim());

      const localUploadResponse = await fetch("/api/v2/media/local-upload", {
        body: formData,
        method: "POST",
      });

      if (!localUploadResponse.ok) {
        throw new Error(
          await readErrorMessage(
            localUploadResponse,
            `Local upload failed for ${file.name}.`,
          ),
        );
      }

      updateQueueProgress(uploadId, 100);

      const mediaResponse =
        (await localUploadResponse.json()) as ProductStepperMedia;

      return {
        ...mediaResponse,
        filename: file.name,
      };
    }

    const blob = await put(uploadConfig.pathname, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      token: uploadConfig.clientToken,
    });

    updateQueueProgress(uploadId, 80);

    const completeResponse = await fetch("/api/v2/media/complete", {
      body: JSON.stringify({
        alt: alt.trim(),
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        pathname: blob.pathname,
        size: file.size,
        url: blob.url,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!completeResponse.ok) {
      throw new Error(
        await readErrorMessage(
          completeResponse,
          `Could not persist media ${file.name}.`,
        ),
      );
    }

    updateQueueProgress(uploadId, 100);

    const mediaResponse =
      (await completeResponse.json()) as ProductStepperMedia;

    return {
      ...mediaResponse,
      filename: file.name,
    };
  };

  const handleUpload = async (
    drafts: PendingUploadDraft[],
    options: { autoSync?: boolean } = {},
  ) => {
    if (drafts.length === 0) return;

    if (!isOnline) {
      try {
        await Promise.all(
          drafts.map(async (draft) => {
            await markOfflineMediaQueueItemForAutoSync(draft.id);
          }),
        );
      } catch {
        // best effort only
      }

      setPendingUploads((current) =>
        current.map((draft) =>
          drafts.some((target) => target.id === draft.id)
            ? { ...draft, queuedForAutoSync: true }
            : draft,
        ),
      );
      setOfflineQueueStatus(
        `${drafts.length} image${drafts.length === 1 ? "" : "s"} queued for upload.`,
      );
      toast.info("You are offline. Images are saved locally.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    if (options.autoSync) {
      setIsSyncingOfflineQueue(true);
      setOfflineQueueStatus("Uploading queued images...");
    }

    try {
      for (const draft of drafts) {
        const file = draft.file;
        const altText =
          draft.alt.trim() || generateAltTextFromFilename(file.name);
        const uploadId = `upload-${draft.id}`;

        const uploadedMedia = await uploadFileToMedia({
          alt: altText,
          file,
          uploadId,
        });

        if (draft.replaceMediaId) {
          const current = uploadedRef.current;
          const hasSource = current.some(
            (item) => item.id === draft.replaceMediaId,
          );

          syncUploaded(
            hasSource
              ? current.map((item) =>
                  item.id === draft.replaceMediaId ? uploadedMedia : item,
                )
              : [...current, uploadedMedia],
          );
        } else {
          appendUploaded(uploadedMedia);
        }

        setMediaLibrary((current) => [
          uploadedMedia,
          ...current.filter((item) => item.id !== uploadedMedia.id),
        ]);

        await deleteOfflineMediaQueueItem(draft.id);
        toast.success(`${file.name} uploaded.`);
        removePendingUpload(draft.id);
        setUploadQueue((current) =>
          current.filter((item) => item.id !== uploadId),
        );
      }

      const remainingQueuedCount = await refreshOfflineQueueCount();

      setOfflineQueueStatus(
        remainingQueuedCount > 0
          ? `${remainingQueuedCount} image${
              remainingQueuedCount === 1 ? "" : "s"
            } still pending.`
          : null,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Image upload failed.";
      setUploadError(message);
      setOfflineQueueStatus("Upload failed. Images remain saved locally.");
      toast.error(message);
    } finally {
      setIsUploading(false);
      setIsSyncingOfflineQueue(false);
      setUploadQueue([]);
    }
  };

  useEffect(() => {
    autoUploadQueuedRef.current = () => {
      const queuedDrafts = pendingUploadsRef.current.filter(
        (draft) => draft.queuedForAutoSync,
      );

      if (queuedDrafts.length > 0) {
        void handleUpload(queuedDrafts, { autoSync: true });
      }
    };
  });

  useEffect(() => {
    if (
      !isOnline ||
      !isOfflineQueueHydrated ||
      isUploading ||
      isSyncingOfflineQueue
    ) {
      return;
    }

    const queuedDraftCount = pendingUploads.filter(
      (draft) => draft.queuedForAutoSync,
    ).length;

    if (queuedDraftCount === 0) return;

    const id = window.setTimeout(() => {
      autoUploadQueuedRef.current();
    }, 1500);

    return () => {
      window.clearTimeout(id);
    };
  }, [
    isOfflineQueueHydrated,
    isOnline,
    isSyncingOfflineQueue,
    isUploading,
    pendingUploads,
  ]);

  const handleApplyEditedMedia = async (
    sourceMedia: ProductStepperMedia,
    editedFile: File,
  ) => {
    const altText = generateAltTextFromFilename(sourceMedia.filename);

    if (!isOnline) {
      const previewUrl = URL.createObjectURL(editedFile);
      objectUrlsRef.current.add(previewUrl);

      const draft: PendingUploadDraft = {
        alt: altText,
        file: editedFile,
        id: createLocalId(editedFile.name),
        previewUrl,
        queuedForAutoSync: true,
        replaceMediaId: sourceMedia.id,
      };

      setPendingUploads((current) => [...current, draft]);

      try {
        await upsertOfflineMediaQueueItem(
          toQueueItem({
            draft,
            queuedForAutoSync: true,
            source: "edited",
          }),
        );
        await refreshOfflineQueueCount();
        setOfflineQueueStatus(
          "Edited crop saved locally and queued for upload.",
        );
        toast.info("Image edit saved locally. It will upload when online.");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not save edited image locally.";
        setOfflineQueueError(message);
        toast.error(message);
      }

      setEditingMedia(null);
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const uploadId = `edit-${sourceMedia.id}`;

    try {
      const uploadedMedia = await uploadFileToMedia({
        alt: altText,
        file: editedFile,
        uploadId,
      });

      const next = uploadedRef.current.map((item) =>
        item.id === sourceMedia.id ? uploadedMedia : item,
      );

      syncUploaded(next);
      setMediaLibrary((current) => [
        uploadedMedia,
        ...current.filter((item) => item.id !== uploadedMedia.id),
      ]);
      toast.success("Image crop updated.");
      setEditingMedia(null);
      setUploadQueue((current) =>
        current.filter((item) => item.id !== uploadId),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Image edit failed.";
      setUploadError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
      setUploadQueue([]);
    }
  };

  const handleRemoveMedia = (mediaId: string) => {
    if (!window.confirm("Remove this photo from the product?")) return;
    const next = uploaded.filter((item) => item.id !== mediaId);
    syncUploaded(next);
    toast.success("Photo removed.");
  };

  const handleAttachExistingMedia = (media: ProductStepperMedia) => {
    if (uploaded.some((item) => item.id === media.id)) {
      toast.info("That image is already attached to this product.");
      return;
    }

    appendUploaded(media);
    toast.success(`${media.filename} attached.`);
  };

  const handleToggleMediaLibrary = () => {
    const nextOpen = !isMediaLibraryOpen;
    setIsMediaLibraryOpen(nextOpen);
    if (nextOpen && mediaLibrary.length === 0) {
      void refreshMediaLibrary();
    }
  };

  const setCoverMedia = (mediaId: string) => {
    const sourceIndex = uploaded.findIndex((item) => item.id === mediaId);
    if (sourceIndex <= 0) return;

    const next = [...uploaded];
    const [cover] = next.splice(sourceIndex, 1);
    if (!cover) return;
    syncUploaded([cover, ...next]);
    toast.success("Cover image updated.");
  };

  const moveMedia = (mediaId: string, direction: -1 | 1) => {
    const sourceIndex = uploaded.findIndex((item) => item.id === mediaId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= uploaded.length) {
      return;
    }

    const next = [...uploaded];
    const [moved] = next.splice(sourceIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    syncUploaded(next);
  };

  const reorderMedia = (targetMediaId: string) => {
    if (!draggingMediaId || draggingMediaId === targetMediaId) return;
    const sourceIndex = uploaded.findIndex(
      (item) => item.id === draggingMediaId,
    );
    const targetIndex = uploaded.findIndex((item) => item.id === targetMediaId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const next = [...uploaded];
    const [moved] = next.splice(sourceIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    syncUploaded(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Product Photos</CardTitle>
      </CardHeader>
      <CardContent className="@container space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-8 text-center">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Upload product images</p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WEBP, or AVIF up to 10MB each
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Offline selections are stored in this browser and uploaded when
              you reconnect.
            </p>
          </div>
          <input
            accept="image/*"
            className="hidden"
            multiple
            onChange={(event) => {
              void enqueueUploads(event.target.files);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>

        {!isOnline || offlineQueuedCount > 0 || isSyncingOfflineQueue ? (
          <div
            className={cn(
              "rounded-md border p-3 text-sm",
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
                    isSyncingOfflineQueue && "animate-spin",
                  )}
                />
              )}
              <div>
                <p className="font-medium">
                  {!isOnline
                    ? "Offline image queue"
                    : isSyncingOfflineQueue
                      ? "Uploading queued images"
                      : "Image queue ready"}
                </p>
                <p className="mt-1 opacity-80">
                  {offlineQueueStatus ??
                    "Pending images are saved in this browser until upload."}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {offlineQueueError ? (
          <p className="text-sm text-destructive">{offlineQueueError}</p>
        ) : null}

        {pendingUploads.length > 0 ? (
          <div className="space-y-4 rounded-md border border-border/70 bg-background/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  Review images before upload
                </p>
                <p className="text-xs text-muted-foreground">
                  Alt text is generated from the filename. Edit it before
                  uploading.
                </p>
              </div>

              <Button
                disabled={isUploading || !isOnline}
                onClick={() => void handleUpload(pendingUploads)}
                size="sm"
                type="button"
              >
                {!isOnline
                  ? `Queued ${pendingUploads.length} image${
                      pendingUploads.length === 1 ? "" : "s"
                    } locally`
                  : isUploading
                    ? "Uploading..."
                    : `Upload ${pendingUploads.length} image${
                        pendingUploads.length === 1 ? "" : "s"
                      }`}
              </Button>
            </div>

            <div className="space-y-3">
              {pendingUploads.map((draft) => (
                <div
                  className="grid gap-4 rounded-md border border-border/70 bg-card p-3 md:grid-cols-[7rem_1fr_auto]"
                  key={draft.id}
                >
                  <div
                    aria-label={`Preview of ${draft.file.name}`}
                    className="h-32 w-full rounded-md border bg-muted bg-cover bg-center md:h-28 md:w-28"
                    role="img"
                    style={{ backgroundImage: `url(${draft.previewUrl})` }}
                  />

                  <div className="min-w-0 space-y-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="truncate text-sm font-medium"
                          title={draft.file.name}
                        >
                          {draft.file.name}
                        </p>
                        {draft.queuedForAutoSync ? (
                          <Badge variant="outline">Queued offline</Badge>
                        ) : null}
                        {draft.replaceMediaId ? (
                          <Badge variant="secondary">Edit replacement</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {draft.file.type || "image"} ·{" "}
                        {formatFileSize(draft.file.size)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`alt-${draft.id}`}>Alt text</Label>
                      <Input
                        id={`alt-${draft.id}`}
                        value={draft.alt}
                        placeholder="Describe the image"
                        onChange={(event) =>
                          updatePendingAlt(draft.id, event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <Button
                    className="self-start md:self-end"
                    disabled={isUploading}
                    onClick={() => removePendingUpload(draft.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove image
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="gap-1.5"
            onClick={handleToggleMediaLibrary}
            size="sm"
            type="button"
            variant="outline"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {isMediaLibraryOpen
              ? "Hide media library"
              : "Add from media library"}
          </Button>
          {isMediaLibraryOpen ? (
            <Button
              disabled={isLoadingMediaLibrary}
              onClick={() => void refreshMediaLibrary()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isLoadingMediaLibrary ? "Refreshing..." : "Refresh"}
            </Button>
          ) : null}
        </div>

        {isMediaLibraryOpen ? (
          <div className="rounded-md border border-border/70 bg-background/70 p-3">
            {isLoadingMediaLibrary ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading media...
              </div>
            ) : mediaLibrary.length > 0 ? (
              <div className="grid max-h-90 gap-3 overflow-y-auto pr-1 @md:grid-cols-2 @3xl:grid-cols-3">
                {mediaLibrary.map((asset) => {
                  const alreadyAttached = uploaded.some(
                    (item) => item.id === asset.id,
                  );

                  return (
                    <div
                      className={cn(
                        "rounded-md border border-border/70 bg-card p-2",
                        alreadyAttached && "border-primary/60 bg-primary/5",
                      )}
                      key={asset.id}
                    >
                      <div className="relative aspect-4/5 overflow-hidden rounded-md border bg-muted/20">
                        <Image
                          alt={asset.filename}
                          src={asset.url}
                          fill
                          sizes="(max-width: 768px) 50vw, 520px"
                          quality={90}
                          unoptimized={shouldBypassNextImageOptimization(
                            asset.url,
                          )}
                          className="object-cover"
                        />
                        {alreadyAttached ? (
                          <Badge className="absolute left-2 top-2 bg-background/90 text-foreground">
                            Attached
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 space-y-2">
                        <p className="truncate text-xs" title={asset.filename}>
                          {asset.filename}
                        </p>
                        <Button
                          className="w-full"
                          disabled={alreadyAttached}
                          onClick={() => handleAttachExistingMedia(asset)}
                          size="sm"
                          type="button"
                          variant={alreadyAttached ? "secondary" : "outline"}
                        >
                          {alreadyAttached
                            ? "Already attached"
                            : "Attach image"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No media assets found.
              </p>
            )}
          </div>
        ) : null}

        {isUploading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading assets...
          </div>
        ) : null}

        {uploadQueue.length > 0 ? (
          <div className="space-y-2">
            {uploadQueue.map((item) => (
              <div className="rounded-md border p-2" key={item.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="max-w-[80%] truncate">{item.filename}</span>
                  <span>{item.progress}%</span>
                </div>
                <Progress value={item.progress} />
              </div>
            ))}
          </div>
        ) : null}

        {uploadError ? (
          <p className="text-sm text-destructive">{uploadError}</p>
        ) : null}

        {uploaded.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Storefront gallery</p>
                <p className="text-xs text-muted-foreground">
                  Position 1 is the cover image shown on product cards.
                </p>
              </div>
              <Badge variant="outline">{uploaded.length} attached</Badge>
            </div>
            <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
              {uploaded.map((media, index) => (
                <div
                  className={cn(
                    "group rounded-md border bg-card p-2",
                    index === 0 && "border-primary/70 ring-1 ring-primary/30",
                  )}
                  draggable
                  key={media.id}
                  onDragEnd={() => setDraggingMediaId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggingMediaId(media.id)}
                  onDrop={() => reorderMedia(media.id)}
                >
                  <div className="relative aspect-4/5 overflow-hidden rounded-md border">
                    <Image
                      alt={media.filename}
                      src={media.url}
                      fill
                      sizes="(max-width: 768px) 50vw, 640px"
                      quality={90}
                      unoptimized={shouldBypassNextImageOptimization(media.url)}
                      className="object-cover"
                    />
                    {index === 0 ? (
                      <Badge className="absolute left-2 top-2 gap-1 bg-background/90 text-foreground">
                        <Star className="h-3 w-3" />
                        Cover
                      </Badge>
                    ) : (
                      <Button
                        className="absolute left-2 top-2 h-8 bg-background/90 px-2 text-xs text-foreground hover:bg-background"
                        onClick={() => setCoverMedia(media.id)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Set cover
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <a
                      className="flex max-w-[75%] items-center gap-1 truncate text-primary underline-offset-4 hover:underline"
                      href={media.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="truncate">{media.filename}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <span className="text-muted-foreground">#{index + 1}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button
                      aria-label={`Edit crop for ${media.filename}`}
                      className="h-8 px-2"
                      onClick={() => setEditingMedia(media)}
                      size="sm"
                      title="Edit crop"
                      type="button"
                      variant="outline"
                    >
                      <Crop className="mr-1 h-3.5 w-3.5" />
                      Edit crop
                    </Button>
                    <Button
                      aria-label={`Move ${media.filename} up`}
                      disabled={index === 0}
                      onClick={() => moveMedia(media.id, -1)}
                      size="icon"
                      title="Move earlier"
                      type="button"
                      variant="outline"
                      className="h-8 w-8"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      aria-label={`Move ${media.filename} down`}
                      disabled={index === uploaded.length - 1}
                      onClick={() => moveMedia(media.id, 1)}
                      size="icon"
                      title="Move later"
                      type="button"
                      variant="outline"
                      className="h-8 w-8"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      aria-label={`Remove ${media.filename}`}
                      className="ml-auto h-8 w-8"
                      onClick={() => handleRemoveMedia(media.id)}
                      size="icon"
                      title="Remove from product"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <ImageEditDialog
          media={editingMedia}
          open={Boolean(editingMedia)}
          onApply={handleApplyEditedMedia}
          onOpenChange={(open) => {
            if (!open) {
              setEditingMedia(null);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
