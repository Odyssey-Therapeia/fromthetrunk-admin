"use client";

import { put } from "@vercel/blob/client";
import { Loader2, UploadCloud, XCircle } from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import type { ProductStepperMedia } from "./types";

type StepPhotosProps = {
  form: any;
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

export function StepPhotos({
  form,
  setUploaded,
  uploaded,
}: StepPhotosProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadProgress[]>([]);
  const [draggingMediaId, setDraggingMediaId] = useState<null | string>(null);

  const imageMediaIds = useMemo(
    () => (form.state.values.imageMediaIds ?? []) as string[],
    [form.state.values.imageMediaIds]
  );

  useEffect(() => {
    if (imageMediaIds.length === 0 || uploaded.length > 0) return;
    let cancelled = false;

    const hydrateExistingMedia = async () => {
      try {
        const response = await fetch("/api/v2/media");
        if (!response.ok) return;

        const mediaRows = (await response.json()) as Array<{
          filename: string;
          id: string;
          url: string;
        }>;
        const mediaById = new Map(mediaRows.map((row) => [row.id, row]));
        const ordered = imageMediaIds
          .map((id) => mediaById.get(id))
          .filter((row): row is ProductStepperMedia => Boolean(row));

        if (!cancelled) {
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
  }, [imageMediaIds, setUploaded, uploaded.length]);

  const updateQueueProgress = (id: string, progress: number) => {
    setUploadQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, progress } : item))
    );
  };

  const syncUploaded = (next: ProductStepperMedia[]) => {
    setUploaded(next);
    form.setFieldValue(
      "imageMediaIds",
      next.map((item) => item.id)
    );
  };

  const appendUploaded = (media: ProductStepperMedia) => {
    setUploaded((current) => {
      const next = [...current, media];
      form.setFieldValue(
        "imageMediaIds",
        next.map((item) => item.id)
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
          throw new Error(await readErrorMessage(uploadConfigResponse, `Upload URL failed for ${file.name}.`));
        }
        updateQueueProgress(uploadId, 30);

        const uploadConfig = (await uploadConfigResponse.json()) as UploadConfig;
        const blob = await put(uploadConfig.pathname, file, {
          access: "public",
          contentType: file.type || "application/octet-stream",
          token: uploadConfig.clientToken,
        });
        updateQueueProgress(uploadId, 80);

        const completeResponse = await fetch("/api/v2/media/complete", {
          body: JSON.stringify({
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
            await readErrorMessage(completeResponse, `Could not persist media ${file.name}.`)
          );
        }
        updateQueueProgress(uploadId, 100);

        const mediaResponse = (await completeResponse.json()) as Omit<ProductStepperMedia, "filename">;
        appendUploaded({
          ...mediaResponse,
          filename: file.name,
        });
        toast.success(`${file.name} uploaded.`);
        setUploadQueue((current) => current.filter((item) => item.id !== uploadId));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";
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

  const reorderMedia = (targetMediaId: string) => {
    if (!draggingMediaId || draggingMediaId === targetMediaId) return;
    const sourceIndex = uploaded.findIndex((item) => item.id === draggingMediaId);
    const targetIndex = uploaded.findIndex((item) => item.id === targetMediaId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const next = [...uploaded];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    syncUploaded(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-8 text-center">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Drag and drop or click to upload</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, WEBP up to 10MB each</p>
          </div>
          <input
            className="hidden"
            multiple
            onChange={(event) => void handleUpload(event.target.files)}
            type="file"
          />
        </label>

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
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Drag photos to reorder. The first photo is used as the product cover.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {uploaded.map((media, index) => (
                <div
                  className="group rounded-md border bg-card p-2"
                  draggable
                  key={media.id}
                  onDragEnd={() => setDraggingMediaId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggingMediaId(media.id)}
                  onDrop={() => reorderMedia(media.id)}
                >
                  <div className="relative overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={media.filename}
                      className="aspect-[4/5] w-full object-cover"
                      loading="lazy"
                      src={media.url}
                    />
                    <Button
                      className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleRemoveMedia(media.id)}
                      size="icon"
                      type="button"
                      variant="destructive"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <a
                      className="max-w-[80%] truncate text-primary underline-offset-4 hover:underline"
                      href={media.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {media.filename}
                    </a>
                    <span className="text-muted-foreground">#{index + 1}</span>
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
