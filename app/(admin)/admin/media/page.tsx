"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { put } from "@vercel/blob/client";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MediaAsset = {
  filename: string;
  id: string;
  url: string;
};

type PendingAlt = {
  alt: string;
  file: File;
};

type UploadConfig = {
  clientToken: string;
  pathname: string;
};

const MEDIA_QUERY_KEY = ["admin-media"] as const;

const EMPTY_MEDIA: MediaAsset[] = [];

const fetchMedia = async (): Promise<MediaAsset[]> => {
  const response = await fetch("/api/v2/media");
  if (!response.ok) {
    throw new Error(`Failed to load media (${response.status}).`);
  }

  return (await response.json()) as MediaAsset[];
};

export default function AdminMediaPage() {
  const queryClient = useQueryClient();

  const [pendingFiles, setPendingFiles] = useState<PendingAlt[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaQuery = useQuery({
    queryFn: fetchMedia,
    queryKey: MEDIA_QUERY_KEY,
  });

  const media = mediaQuery.data ?? EMPTY_MEDIA;

  const uploadMutation = useMutation({
    mutationFn: async (entries: PendingAlt[]) => {
      for (const { alt, file } of entries) {
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
          throw new Error(`Failed to start upload for "${file.name}".`);
        }

        const uploadConfig =
          (await uploadConfigResponse.json()) as UploadConfig;

        const blob = await put(uploadConfig.pathname, file, {
          access: "public",
          contentType: file.type || "application/octet-stream",
          token: uploadConfig.clientToken,
        });

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
          throw new Error(`Failed to finalize "${file.name}".`);
        }
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    },
    onSuccess: async () => {
      toast.success("Upload complete.");
      setPendingFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v2/media/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Failed to delete media (${response.status}).`);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete media.",
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const entries: PendingAlt[] = Array.from(files).map((file) => ({
      alt: "",
      file,
    }));
    setPendingFiles(entries);
  };

  const updateAlt = (index: number, alt: string) => {
    setPendingFiles((current) =>
      current.map((entry, i) => (i === index ? { ...entry, alt } : entry)),
    );
  };

  const handleUpload = () => {
    if (pendingFiles.length === 0) return;
    if (pendingFiles.some((entry) => !entry.alt.trim())) {
      toast.error("Please provide alt text for every image before uploading.");
      return;
    }
    uploadMutation.mutate(pendingFiles);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Media Library
          </h2>
          <p className="text-sm text-muted-foreground">
            Upload and manage product visuals.
          </p>
        </div>
      </div>

      {/* File picker + alt-text inputs */}
      <div className="space-y-3 rounded-md border p-4">
        <div>
          <Label htmlFor="media-file-input">Choose files</Label>
          <input
            id="media-file-input"
            className="mt-1 block w-full text-sm"
            multiple
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {pendingFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Alt text (required for each image)
            </p>
            {pendingFiles.map((entry, index) => (
              <div
                className="flex items-center gap-3"
                key={`${entry.file.name}-${index}`}
              >
                <span className="w-40 truncate text-xs text-muted-foreground">
                  {entry.file.name}
                </span>
                <Input
                  className="flex-1"
                  onChange={(e) => updateAlt(index, e.target.value)}
                  placeholder="Describe the image for screen readers"
                  type="text"
                  value={entry.alt}
                />
              </div>
            ))}

            <Button
              disabled={
                uploadMutation.isPending ||
                pendingFiles.some((e) => !e.alt.trim())
              }
              onClick={handleUpload}
              type="button"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload files"}
            </Button>
          </div>
        )}

        {pendingFiles.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Select one or more image files. You will be prompted to enter alt
            text before uploading.
          </p>
        )}
      </div>

      {mediaQuery.isError ? (
        <p className="text-sm text-destructive">
          {mediaQuery.error instanceof Error
            ? mediaQuery.error.message
            : "Failed to load media."}
        </p>
      ) : mediaQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Loading media…</p>
      ) : media.length === 0 ? (
        <p className="text-sm text-muted-foreground">No media uploaded yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {media.map((asset) => (
            <Card key={asset.id}>
              <CardContent className="space-y-2 p-3">
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted/20">
                  <Image
                    alt={asset.filename}
                    className="object-cover"
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    src={asset.url}
                    unoptimized
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs">{asset.filename}</p>
                  <Button
                    disabled={
                      deleteMutation.isPending &&
                      deleteMutation.variables === asset.id
                    }
                    onClick={() => deleteMutation.mutate(asset.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
