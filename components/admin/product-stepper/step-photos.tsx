import { put } from "@vercel/blob/client";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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

type UploadConfig = {
  clientToken: string;
  pathname: string;
};

type UploadProgress = {
  filename: string;
  id: string;
  progress: number;
};

export function StepPhotos({ form, setUploaded, uploaded }: StepPhotosProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadProgress[]>([]);
  const [draggingMediaId, setDraggingMediaId] = useState<null | string>(null);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [isLoadingMediaLibrary, setIsLoadingMediaLibrary] = useState(false);
  const [mediaLibrary, setMediaLibrary] = useState<ProductStepperMedia[]>([]);

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
          setUploaded(ordered);
        }
      } catch {
        // best effort only
      }
    };

    void hydrateExistingMedia();
    return () => {
      cancelled = true;
    };
  }, [fetchMediaRows, imageMediaIds, setUploaded, uploaded.length]);

  const updateQueueProgress = (id: string, progress: number) => {
    setUploadQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, progress } : item)),
    );
  };

  const syncUploaded = (next: ProductStepperMedia[]) => {
    setUploaded(next);
    form.setFieldValue(
      "imageMediaIds",
      next.map((item) => item.id),
    );
  };

  const appendUploaded = (media: ProductStepperMedia) => {
    setUploaded((current) => {
      if (current.some((item) => item.id === media.id)) {
        return current;
      }

      const next = [...current, media];
      form.setFieldValue(
        "imageMediaIds",
        next.map((item) => item.id),
      );
      return next;
    });
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

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        const uploadId = `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`;
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

        const uploadConfig =
          (await uploadConfigResponse.json()) as UploadConfig;
        const blob = await put(uploadConfig.pathname, file, {
          access: "public",
          contentType: file.type || "application/octet-stream",
          token: uploadConfig.clientToken,
        });
        updateQueueProgress(uploadId, 80);

        // Alt text is REQUIRED by the server. Prompt the user for a
        // descriptive label for each image before completing the upload.
        const altText = window.prompt(
          `Alt text for "${file.name}" (required for accessibility):`,
        );
        if (!altText || !altText.trim()) {
          toast.error(
            `Alt text is required for ${file.name}. Upload cancelled.`,
          );
          setUploadQueue((current) =>
            current.filter((item) => item.id !== uploadId),
          );
          continue;
        }

        const completeResponse = await fetch("/api/v2/media/complete", {
          body: JSON.stringify({
            alt: altText.trim(),
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
        const uploadedMedia = {
          ...mediaResponse,
          filename: file.name,
        };
        appendUploaded(uploadedMedia);
        setMediaLibrary((current) => [
          uploadedMedia,
          ...current.filter((item) => item.id !== uploadedMedia.id),
        ]);
        toast.success(`${file.name} uploaded.`);
        setUploadQueue((current) =>
          current.filter((item) => item.id !== uploadId),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Image upload failed.";
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
          </div>
          <input
            accept="image/*"
            className="hidden"
            multiple
            onChange={(event) => void handleUpload(event.target.files)}
            type="file"
          />
        </label>

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
                          sizes="(max-width: 768px) 50vw, 220px"
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
                      sizes="(max-width: 768px) 50vw, 260px"
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
                  <div className="mt-2 flex items-center gap-1">
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
      </CardContent>
    </Card>
  );
}
