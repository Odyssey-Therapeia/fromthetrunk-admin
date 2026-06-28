"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { put } from "@Vercel/blob/client";
import {
  Copy,
  ExternalLink,
  Grid3X3,
  ImageIcon,
  LayoutPanelTop,
  List,
  Loader2,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Image from "next/image";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MediaAsset = {
  filename: string;
  id: string;
  url: string;
};

type PendingUpload = {
  alt: string;
  file: File;
  id: string;
  previewUrl: string;
};

type UploadConfig = {
  clientToken: string;
  pathname: string;
};

type UploadProgress = {
  current: number;
  filename: string;
  total: number;
};

type ViewMode = "grid" | "large" | "list";

const MEDIA_QUERY_KEY = ["admin-media"] as const;

const EMPTY_MEDIA: MediaAsset[] = [];

const viewModes: {
  icon: typeof Grid3X3;
  label: string;
  value: ViewMode;
}[] = [
  {
    icon: Grid3X3,
    label: "Grid",
    value: "grid",
  },
  {
    icon: LayoutPanelTop,
    label: "Large",
    value: "large",
  },
  {
    icon: List,
    label: "List",
    value: "list",
  },
];

const fetchMedia = async (): Promise<MediaAsset[]> => {
  const response = await fetch("/api/v2/media");
  if (!response.ok) {
    throw new Error(`Failed to load media (${response.status}).`);
  }

  return (await response.json()) as MediaAsset[];
};

const isImageFile = (file: File) =>
  file.type.startsWith("image/") ||
  /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.name);

const inferAltText = (filename: string) =>
  filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
};

const createPendingUpload = (file: File): PendingUpload => ({
  alt: inferAltText(file.name),
  file,
  id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
  previewUrl: URL.createObjectURL(file),
});

function AssetImage({
  asset,
  className = "",
  sizes,
}: {
  asset: MediaAsset;
  className?: string;
  sizes: string;
}) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-muted/30 ${className}`}
      >
        <div className="space-y-2 text-center text-muted-foreground">
          <ImageIcon className="mx-auto h-8 w-8" />
          <p className="text-xs">Preview unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      alt={asset.filename}
      className={`object-cover ${className}`}
      fill
      onError={() => setHasFailed(true)}
      sizes={sizes}
      src={asset.url}
      unoptimized
    />
  );
}

function MediaAssetActions({
  asset,
  isDeleting,
  onCopy,
  onDelete,
}: {
  asset: MediaAsset;
  isDeleting: boolean;
  onCopy: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        className="gap-1"
        onClick={() => onCopy(asset)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Copy className="h-4 w-4" />
        Copy URL
      </Button>

      <Button asChild className="gap-1" size="sm" type="button" variant="ghost">
        <a href={asset.url} rel="noreferrer" target="_blank">
          <ExternalLink className="h-4 w-4" />
          Open
        </a>
      </Button>

      <Button
        className="gap-1 text-destructive hover:text-destructive"
        disabled={isDeleting}
        onClick={() => onDelete(asset)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Delete
      </Button>
    </div>
  );
}

export default function AdminMediaPage() {
  const queryClient = useQueryClient();

  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<PendingUpload[]>([]);

  const mediaQuery = useQuery({
    queryFn: fetchMedia,
    queryKey: MEDIA_QUERY_KEY,
  });

  const media = mediaQuery.data ?? EMPTY_MEDIA;

  const filteredMedia = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return media;

    return media.filter((asset) =>
      [asset.filename, asset.url]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [media, query]);

  const selectedAsset =
    filteredMedia.find((asset) => asset.id === selectedAssetId) ??
    filteredMedia[0] ??
    null;

  const hasPendingFiles = pendingFiles.length > 0;
  const hasMissingAlt = pendingFiles.some((entry) => !entry.alt.trim());

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(
    () => () => {
      pendingFilesRef.current.forEach((entry) =>
        URL.revokeObjectURL(entry.previewUrl),
      );
    },
    [],
  );

  const clearPendingFiles = () => {
    pendingFilesRef.current.forEach((entry) =>
      URL.revokeObjectURL(entry.previewUrl),
    );
    pendingFilesRef.current = [];
    setPendingFiles([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const incomingFiles = Array.from(files);
    const imageFiles = incomingFiles.filter(isImageFile);
    const skippedCount = incomingFiles.length - imageFiles.length;

    if (imageFiles.length === 0) {
      toast.error("Please choose image files only.");
      return;
    }

    if (skippedCount > 0) {
      toast.warning(
        `${skippedCount} non-image file${skippedCount === 1 ? "" : "s"} skipped.`,
      );
    }

    setPendingFiles((current) => [
      ...current,
      ...imageFiles.map(createPendingUpload),
    ]);
  };

  const uploadMutation = useMutation({
    mutationFn: async (entries: PendingUpload[]) => {
      setUploadProgress({
        current: 0,
        filename: "Preparing upload",
        total: entries.length,
      });

      for (const [index, { alt, file }] of entries.entries()) {
        setUploadProgress({
          current: index + 1,
          filename: file.name,
          total: entries.length,
        });

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
    onSettled: () => {
      setUploadProgress(null);
    },
    onSuccess: async () => {
      toast.success("Upload complete.");
      clearPendingFiles();
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
      toast.success("Media deleted.");
      await queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
    },
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    addFiles(files);
    event.target.value = "";
  };

  const updateAlt = (id: string, alt: string) => {
    setPendingFiles((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, alt } : entry)),
    );
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((current) => {
      const target = current.find((entry) => entry.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);

      return current.filter((entry) => entry.id !== id);
    });
  };

  const handleUpload = () => {
    if (pendingFiles.length === 0) return;

    if (hasMissingAlt) {
      toast.error("Please provide alt text for every image before uploading.");
      return;
    }

    uploadMutation.mutate(pendingFiles);
  };

  const copyAssetUrl = async (asset: MediaAsset) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      toast.success("Media URL copied.");
    } catch {
      toast.error("Unable to copy URL.");
    }
  };

  const handleDeleteAsset = (asset: MediaAsset) => {
    if (!window.confirm(`Delete "${asset.filename}"?`)) return;
    deleteMutation.mutate(asset.id);
  };

  const isDeletingAsset = (assetId: string) =>
    deleteMutation.isPending && deleteMutation.variables === assetId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Content assets
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Media Library
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload, preview, copy, and manage product visuals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {media.length} asset{media.length === 1 ? "" : "s"}
          </Badge>
          <Button
            className="gap-2 rounded-full"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <UploadCloud className="h-4 w-4" />
            Add images
          </Button>
        </div>
      </div>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <CardTitle>Upload images</CardTitle>
          <CardDescription>
            Drag images here or choose files. Alt text is required before upload
            and is pre-filled from the file name.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div
            className={`rounded-2xl border border-dashed p-6 transition ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border/70 bg-background/60"
            }`}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);

              if (event.dataTransfer.files.length > 0) {
                addFiles(event.dataTransfer.files);
              }
            }}
          >
            <input
              accept="image/*"
              className="sr-only"
              id="media-file-input"
              multiple
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />

            <div className="flex flex-col gap-4 text-center sm:items-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-card">
                <UploadCloud className="h-5 w-5 text-muted-foreground" />
              </div>

              <div>
                <Label
                  className="text-base font-medium text-foreground"
                  htmlFor="media-file-input"
                >
                  Drop images here or choose files
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Supports PNG, JPG, WebP, GIF, AVIF, and SVG.
                </p>
              </div>

              <Button
                className="rounded-full"
                onClick={() => fileInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                Choose images
              </Button>
            </div>
          </div>

          {hasPendingFiles ? (
            <div className="space-y-4 rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Ready to upload
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pendingFiles.length} selected image
                    {pendingFiles.length === 1 ? "" : "s"}. Review alt text
                    before upload.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={uploadMutation.isPending}
                    onClick={clearPendingFiles}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Clear selection
                  </Button>
                  <Button
                    className="gap-2"
                    disabled={
                      uploadMutation.isPending ||
                      pendingFiles.length === 0 ||
                      hasMissingAlt
                    }
                    onClick={handleUpload}
                    size="sm"
                    type="button"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    Upload images
                  </Button>
                </div>
              </div>

              {uploadProgress ? (
                <div className="rounded-xl border border-border/70 bg-card p-3 text-sm text-muted-foreground">
                  Uploading {uploadProgress.current} of {uploadProgress.total}:{" "}
                  <span className="font-medium text-foreground">
                    {uploadProgress.filename}
                  </span>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                {pendingFiles.map((entry) => (
                  <div
                    className="rounded-xl border border-border/70 bg-card p-3"
                    key={entry.id}
                  >
                    <div className="flex gap-3">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted/20">
                        <Image
                          alt={entry.alt || entry.file.name}
                          className="object-cover"
                          fill
                          sizes="96px"
                          src={entry.previewUrl}
                          unoptimized
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {entry.file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(entry.file.size)}
                            </p>
                          </div>

                          <Button
                            disabled={uploadMutation.isPending}
                            onClick={() => removePendingFile(entry.id)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`alt-${entry.id}`}>Alt text</Label>
                          <Input
                            id={`alt-${entry.id}`}
                            onChange={(event) =>
                              updateAlt(entry.id, event.target.value)
                            }
                            placeholder="Describe this image"
                            value={entry.alt}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {hasMissingAlt ? (
                <p className="text-sm text-destructive">
                  Add alt text for every image before uploading.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>Uploaded media</CardTitle>
              <CardDescription>
                Search visuals, copy URLs, open originals, or delete unused
                assets.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {viewModes.map((mode) => {
                const Icon = mode.icon;
                const isActive = viewMode === mode.value;

                return (
                  <Button
                    className="gap-2"
                    key={mode.value}
                    onClick={() => setViewMode(mode.value)}
                    size="sm"
                    type="button"
                    variant={isActive ? "default" : "outline"}
                  >
                    <Icon className="h-4 w-4" />
                    {mode.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search media"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search filename or URL"
              value={query}
            />
          </div>
        </CardHeader>

        <CardContent>
          {mediaQuery.isError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">
                {mediaQuery.error instanceof Error
                  ? mediaQuery.error.message
                  : "Failed to load media."}
              </p>
            </div>
          ) : mediaQuery.isPending ? (
            <div className="rounded-xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
              Loading media…
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
              <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-base font-medium text-foreground">
                No media found
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {query.trim()
                  ? "Try a different search."
                  : "Upload your first image to start building the library."}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {filteredMedia.map((asset) => (
                <Card className="overflow-hidden" key={asset.id}>
                  <CardContent className="space-y-3 p-3">
                    <button
                      className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted/20"
                      onClick={() => {
                        setSelectedAssetId(asset.id);
                        setViewMode("large");
                      }}
                      type="button"
                    >
                      <AssetImage
                        asset={asset}
                        sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                      />
                    </button>

                    <div className="space-y-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {asset.filename}
                      </p>

                      <MediaAssetActions
                        asset={asset}
                        isDeleting={isDeletingAsset(asset.id)}
                        onCopy={copyAssetUrl}
                        onDelete={handleDeleteAsset}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : viewMode === "large" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                {selectedAsset ? (
                  <div className="space-y-4">
                    <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted/20">
                      <AssetImage
                        asset={selectedAsset}
                        sizes="(min-width: 1280px) 60vw, 100vw"
                      />
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">
                          {selectedAsset.filename}
                        </p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {selectedAsset.url}
                        </p>
                      </div>

                      <MediaAssetActions
                        asset={selectedAsset}
                        isDeleting={isDeletingAsset(selectedAsset.id)}
                        onCopy={copyAssetUrl}
                        onDelete={handleDeleteAsset}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 rounded-2xl border border-border/70 bg-background/60 p-3">
                <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Library
                </p>

                <div className="max-h-136 space-y-2 overflow-y-auto pr-1">
                  {filteredMedia.map((asset) => {
                    const isSelected = selectedAsset?.id === asset.id;

                    return (
                      <button
                        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/70 bg-card hover:bg-muted/50"
                        }`}
                        key={asset.id}
                        onClick={() => setSelectedAssetId(asset.id)}
                        type="button"
                      >
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted/20">
                          <AssetImage asset={asset} sizes="56px" />
                        </div>
                        <p className="line-clamp-2 text-sm text-foreground">
                          {asset.filename}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMedia.map((asset) => (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={asset.id}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted/20">
                      <AssetImage asset={asset} sizes="64px" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {asset.filename}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {asset.url}
                      </p>
                    </div>
                  </div>

                  <MediaAssetActions
                    asset={asset}
                    isDeleting={isDeletingAsset(asset.id)}
                    onCopy={copyAssetUrl}
                    onDelete={handleDeleteAsset}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
