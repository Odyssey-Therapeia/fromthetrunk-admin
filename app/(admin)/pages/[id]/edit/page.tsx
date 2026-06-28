"use client";

/**
 * P3-05: Page editor — block composer.
 * P3-06: Added Publish / Unpublish / Preview controls.
 *
 * Shopify section-list model: ordered block list, no free-form canvas.
 * Add / remove / reorder (up/down buttons) blocks; edit per-block props via
 * a right-side editor pane; autosave to a draft page version.
 *
 * Route: /admin/pages/[id]/edit
 * Depends: P3-02 (registry + renderers), P3-04 (pages CRUD routes).
 *
 * BLOCK_COMPOSER_PAGE — grep anchor for wiring verification.
 * AUTOSAVE_POSTS_VERSION — autosave calls POST /api/v2/admin/pages/:id/versions.
 * PUBLISH_BUTTON_EDITOR — Publish/Unpublish wired to POST /api/v2/admin/pages/:id/publish|unpublish.
 * PREVIEW_BUTTON_EDITOR — Preview wired to GET /api/v2/admin/pages/:id/preview-token.
 * MEDIA_PICKER_PAGE_EDITOR — image/media fields can pick from media library or upload new media.
 * RIGHT_PANE_BLOCK_EDITOR — block settings open in a right-side editor pane.
 */

import { put } from "@Vercel/blob/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Eye,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { SchemaForm } from "@/components/admin/schema-form/schema-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addBlock,
  blockCanBeAdded,
  blocksToVersionPayload,
  moveBlockDown,
  moveBlockUp,
  removeBlock,
  updateBlockProps,
  versionPayloadToBlocks,
  type ComposerBlock,
} from "@/lib/content/blocks/block-composer";
import { BLOCK_EDITOR_SCHEMAS } from "@/lib/content/blocks/block-editor-schemas";
import { BLOCK_REGISTRY } from "@/lib/content/blocks/registry";

// ── Domain types ──────────────────────────────────────────────────────────────

type Page = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  publishedVersionId: string | null;
};

type PageVersion = {
  id: string;
  blocks: Array<{ type: string; props: Record<string, unknown> }>;
};

type MediaAsset = {
  alt?: string | null;
  filename: string;
  id: string;
  url: string;
};

type UploadConfig = {
  clientToken: string;
  pathname: string;
};

type PendingMediaFile = {
  alt: string;
  file: File;
  previewUrl: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUTOSAVE_DEBOUNCE_MS = 1500;
const MEDIA_QUERY_KEY = ["admin-media"] as const;
const EMPTY_MEDIA: MediaAsset[] = [];

const KNOWN_MEDIA_FIELD_KEYS_BY_BLOCK_TYPE: Record<string, string[]> = {
  hero: ["backgroundImage"],
  banner: ["backgroundImage"],
  "image-text-split": ["image"],
  "image-text": ["image"],
  "featured-image": ["image"],
  gallery: ["image"],
};

const MEDIA_ALT_FIELD_CANDIDATES_BY_MEDIA_FIELD: Record<string, string[]> = {
  backgroundImage: [
    "backgroundImageAlt",
    "backgroundImageAltText",
    "imageAlt",
    "imageAltText",
    "alt",
    "altText",
  ],
  image: ["imageAlt", "imageAltText", "alt", "altText"],
  imageId: ["imageAlt", "imageAltText", "alt", "altText"],
  mediaId: ["imageAlt", "imageAltText", "alt", "altText"],
};

const readErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
  } catch {
    // fall through
  }

  return `Request failed with ${response.status}`;
};

const fetchMedia = async (): Promise<MediaAsset[]> => {
  const response = await fetch("/api/v2/media");

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as MediaAsset[];
};

const inferAltText = (filename: string) =>
  filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const readMediaAltText = (asset: MediaAsset) =>
  asset.alt?.trim() || inferAltText(asset.filename);

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;

  return `${(kilobytes / 1024).toFixed(1)} MB`;
};

const isImageFile = (file: File) =>
  file.type.startsWith("image/") ||
  /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.name);

const formatFieldLabel = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const isLikelyAltFieldKey = (key: string) => {
  const normalized = key.toLowerCase();

  return (
    normalized === "alt" ||
    normalized === "alttext" ||
    normalized.includes("imagealt") ||
    normalized.includes("backgroundimagealt")
  );
};

const isMediaFieldKey = (key: string) => {
  const normalized = key.toLowerCase();

  if (
    normalized.includes("alt") ||
    normalized.includes("caption") ||
    normalized.includes("heading") ||
    normalized.includes("description") ||
    normalized.includes("title") ||
    normalized.includes("text") ||
    normalized.includes("copy")
  ) {
    return false;
  }

  return (
    normalized === "image" ||
    normalized === "imageid" ||
    normalized === "media" ||
    normalized === "mediaid" ||
    normalized === "asset" ||
    normalized === "assetid" ||
    normalized === "backgroundimage" ||
    normalized === "backgroundimageid" ||
    normalized.endsWith("image") ||
    normalized.endsWith("imageid") ||
    normalized.endsWith("mediaid") ||
    normalized.endsWith("assetid") ||
    normalized.endsWith("thumbnail") ||
    normalized.endsWith("thumbnailid") ||
    normalized.endsWith("poster") ||
    normalized.endsWith("posterid") ||
    normalized.endsWith("logo") ||
    normalized.endsWith("logoid") ||
    normalized.endsWith("photo") ||
    normalized.endsWith("photoid") ||
    normalized.endsWith("visual") ||
    normalized.endsWith("visualid")
  );
};

const shouldStoreMediaIdForField = (fieldKey: string) => {
  const normalized = fieldKey.toLowerCase();

  return (
    normalized === "id" ||
    normalized === "imageid" ||
    normalized === "mediaid" ||
    normalized === "assetid" ||
    normalized === "backgroundimageid" ||
    normalized.endsWith("mediaid") ||
    normalized.endsWith("assetid") ||
    normalized.endsWith("imageid") ||
    normalized.endsWith("logoid") ||
    normalized.endsWith("photoid") ||
    normalized.endsWith("posterid") ||
    normalized.endsWith("thumbnailid") ||
    normalized.endsWith("visualid")
  );
};

const getMediaValueForField = (fieldKey: string, asset: MediaAsset) =>
  shouldStoreMediaIdForField(fieldKey) ? asset.id : asset.url;

const resolveShapeKeys = (shape: unknown): string[] => {
  const resolvedShape = typeof shape === "function" ? shape() : shape;

  return resolvedShape && typeof resolvedShape === "object"
    ? Object.keys(resolvedShape as Record<string, unknown>)
    : [];
};

const getSchemaKeys = (schema: unknown): string[] => {
  if (!schema || typeof schema !== "object") return [];

  const schemaObject = schema as {
    def?: { shape?: unknown };
    shape?: unknown;
    _def?: {
      innerType?: unknown;
      schema?: unknown;
      shape?: unknown;
    };
  };

  const directShapeKeys = resolveShapeKeys(schemaObject.shape);
  if (directShapeKeys.length > 0) return directShapeKeys;

  const defShapeKeys = resolveShapeKeys(schemaObject.def?.shape);
  if (defShapeKeys.length > 0) return defShapeKeys;

  const legacyDefShapeKeys = resolveShapeKeys(schemaObject._def?.shape);
  if (legacyDefShapeKeys.length > 0) return legacyDefShapeKeys;

  return getSchemaKeys(
    schemaObject._def?.schema ?? schemaObject._def?.innerType,
  );
};

const getMediaFieldKeys = (
  blockType: string,
  schema: unknown,
  props: Record<string, unknown>,
): string[] => {
  const schemaKeys = getSchemaKeys(schema);
  const propKeys = Object.keys(props);
  const detectedKeys = [...schemaKeys, ...propKeys].filter(isMediaFieldKey);

  const fallbackKeys =
    detectedKeys.length > 0
      ? []
      : (KNOWN_MEDIA_FIELD_KEYS_BY_BLOCK_TYPE[blockType] ?? []);

  const keys = new Set([...detectedKeys, ...fallbackKeys]);

  return Array.from(keys);
};

const getAltFieldKeyForMediaField = (
  fieldKey: string,
  schemaKeys: string[],
  props: Record<string, unknown>,
) => {
  const availableKeys = new Set([...schemaKeys, ...Object.keys(props)]);
  const candidates = MEDIA_ALT_FIELD_CANDIDATES_BY_MEDIA_FIELD[fieldKey] ?? [
    `${fieldKey}Alt`,
    `${fieldKey}AltText`,
    "imageAlt",
    "imageAltText",
    "alt",
    "altText",
  ];

  return candidates.find((candidate) => availableKeys.has(candidate)) ?? null;
};

const getHiddenSchemaFieldKeys = (
  mediaFieldKeys: string[],
  schemaKeys: string[],
  props: Record<string, unknown>,
) => {
  const hiddenKeys = new Set<string>();

  mediaFieldKeys.forEach((fieldKey) => {
    hiddenKeys.add(fieldKey);

    const altFieldKey = getAltFieldKeyForMediaField(
      fieldKey,
      schemaKeys,
      props,
    );

    if (altFieldKey) {
      hiddenKeys.add(altFieldKey);
    }
  });

  schemaKeys.forEach((key) => {
    if (!isLikelyAltFieldKey(key)) return;

    const hasMediaField = mediaFieldKeys.some((mediaFieldKey) => {
      const normalizedMediaFieldKey = mediaFieldKey.toLowerCase();
      const normalizedAltKey = key.toLowerCase();

      return (
        normalizedAltKey.includes(normalizedMediaFieldKey) ||
        normalizedAltKey === "alt" ||
        normalizedAltKey === "alttext"
      );
    });

    if (hasMediaField) {
      hiddenKeys.add(key);
    }
  });

  return Array.from(hiddenKeys);
};

const omitSchemaKeys = (schema: unknown, keys: string[]) => {
  if (!schema || keys.length === 0 || typeof schema !== "object") {
    return schema;
  }

  const schemaWithOmit = schema as {
    omit?: (shape: Record<string, true>) => unknown;
  };

  if (typeof schemaWithOmit.omit !== "function") {
    return schema;
  }

  return schemaWithOmit.omit(
    Object.fromEntries(keys.map((key) => [key, true])),
  );
};

// ── Media picker ──────────────────────────────────────────────────────────────

function MediaAssetPreview({
  asset,
  className = "",
  sizes,
}: {
  asset: MediaAsset;
  className?: string;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-muted/30 ${className}`}
      >
        <div className="space-y-1 text-center text-muted-foreground">
          <ImageIcon className="mx-auto h-6 w-6" />
          <p className="text-xs">Preview unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      alt={readMediaAltText(asset)}
      className={`object-cover ${className}`}
      fill
      onError={() => setFailed(true)}
      sizes={sizes}
      src={asset.url}
      unoptimized
    />
  );
}

function MediaPickerDialog({
  fieldLabel,
  onOpenChange,
  onSelect,
  open,
}: {
  fieldLabel: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: MediaAsset) => void;
  open: boolean;
}) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [pendingFile, setPendingFile] = useState<PendingMediaFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: media = EMPTY_MEDIA,
    error: mediaError,
    isLoading,
    refetch,
  } = useQuery({
    enabled: open,
    queryFn: fetchMedia,
    queryKey: MEDIA_QUERY_KEY,
  });

  const filteredMedia = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return media;

    return media.filter((asset) =>
      [asset.filename, asset.url]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [media, search]);

  useEffect(() => {
    return () => {
      if (pendingFile) {
        URL.revokeObjectURL(pendingFile.previewUrl);
      }
    };
  }, [pendingFile]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!isImageFile(file)) {
      toast.error("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (pendingFile) {
      URL.revokeObjectURL(pendingFile.previewUrl);
    }

    setPendingFile({
      alt: inferAltText(file.name),
      file,
      previewUrl: URL.createObjectURL(file),
    });

    event.target.value = "";
  };

  const clearPendingFile = () => {
    if (pendingFile) {
      URL.revokeObjectURL(pendingFile.previewUrl);
    }

    setPendingFile(null);
  };

  const handleUploadAndSelect = async () => {
    if (!pendingFile) return;

    if (!pendingFile.alt.trim()) {
      toast.error("Please add alt text before uploading.");
      return;
    }

    setIsUploading(true);

    try {
      const uploadConfigResponse = await fetch("/api/v2/media/upload", {
        body: JSON.stringify({
          contentType: pendingFile.file.type || "application/octet-stream",
          filename: pendingFile.file.name,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!uploadConfigResponse.ok) {
        throw new Error(
          `Failed to start upload for "${pendingFile.file.name}".`,
        );
      }

      const uploadConfig = (await uploadConfigResponse.json()) as UploadConfig;

      const blob = await put(uploadConfig.pathname, pendingFile.file, {
        access: "public",
        contentType: pendingFile.file.type || "application/octet-stream",
        token: uploadConfig.clientToken,
      });

      const completeResponse = await fetch("/api/v2/media/complete", {
        body: JSON.stringify({
          alt: pendingFile.alt.trim(),
          filename: pendingFile.file.name,
          mimeType: pendingFile.file.type || "application/octet-stream",
          pathname: blob.pathname,
          size: pendingFile.file.size,
          url: blob.url,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!completeResponse.ok) {
        throw new Error(`Failed to finalize "${pendingFile.file.name}".`);
      }

      const completedAsset = (await completeResponse
        .json()
        .catch(() => null)) as Partial<MediaAsset> | null;

      await queryClient.invalidateQueries({ queryKey: MEDIA_QUERY_KEY });
      const refreshed = await refetch();

      const uploadedAsset =
        refreshed.data?.find((asset) => asset.url === blob.url) ??
        refreshed.data?.find(
          (asset) => asset.filename === pendingFile.file.name,
        ) ??
        (completedAsset?.id && completedAsset.url
          ? {
              alt: completedAsset.alt ?? pendingFile.alt,
              id: completedAsset.id,
              filename: completedAsset.filename ?? pendingFile.file.name,
              url: completedAsset.url,
            }
          : null);

      if (!uploadedAsset) {
        toast.success(
          "Image uploaded. Select it from the media library after refresh.",
        );
        clearPendingFile();
        return;
      }

      toast.success("Image uploaded.");
      clearPendingFile();
      onSelect({
        ...uploadedAsset,
        alt: uploadedAsset.alt ?? pendingFile.alt,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-card sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Select media</DialogTitle>
          <DialogDescription>
            Choose an uploaded asset for {fieldLabel}, or upload a new image and
            use it immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search filename or URL"
                value={search}
              />
            </div>

            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton
                    className="aspect-square rounded-xl"
                    key={`media-picker-skeleton-${index}`}
                  />
                ))}
              </div>
            ) : mediaError ? (
              <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {mediaError instanceof Error
                  ? mediaError.message
                  : "Unable to load media."}
              </div>
            ) : filteredMedia.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-6 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  No media found
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a new image from the panel on the right.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredMedia.map((asset) => (
                  <button
                    className="group overflow-hidden rounded-xl border border-border/70 bg-background/60 p-2 text-left transition hover:border-primary/40 hover:bg-muted/40"
                    key={asset.id}
                    onClick={() => {
                      onSelect(asset);
                      onOpenChange(false);
                    }}
                    type="button"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted/20">
                      <MediaAssetPreview
                        asset={asset}
                        sizes="(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 100vw"
                      />
                    </div>
                    <p className="mt-2 truncate text-xs font-medium text-foreground">
                      {asset.filename}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {readMediaAltText(asset)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-border/70 bg-background/60 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Upload new
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a new image to the media library and select it for this
                field.
              </p>
            </div>

            <input
              accept="image/*"
              className="sr-only"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />

            <Button
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
              type="button"
              variant="outline"
            >
              <UploadCloud className="h-4 w-4" />
              Choose image
            </Button>

            {pendingFile ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted/20">
                  <Image
                    alt={pendingFile.alt || pendingFile.file.name}
                    className="object-cover"
                    fill
                    sizes="320px"
                    src={pendingFile.previewUrl}
                    unoptimized
                  />
                </div>

                <div>
                  <p className="truncate text-sm font-medium text-foreground">
                    {pendingFile.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(pendingFile.file.size)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-media-alt">Alt text</Label>
                  <Input
                    id="new-media-alt"
                    onChange={(event) =>
                      setPendingFile((current) =>
                        current
                          ? {
                              ...current,
                              alt: event.target.value,
                            }
                          : current,
                      )
                    }
                    placeholder="Describe this image"
                    value={pendingFile.alt}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-2"
                    disabled={isUploading}
                    onClick={() => void handleUploadAndSelect()}
                    size="sm"
                    type="button"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    Upload & use
                  </Button>

                  <Button
                    disabled={isUploading}
                    onClick={clearPendingFile}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaFieldEditor({
  altValue,
  fieldKey,
  onClear,
  onSelectAsset,
  value,
}: {
  altValue: unknown;
  fieldKey: string;
  onClear: () => void;
  onSelectAsset: (asset: MediaAsset) => void;
  value: unknown;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);

  const { data: media = EMPTY_MEDIA } = useQuery({
    queryFn: fetchMedia,
    queryKey: MEDIA_QUERY_KEY,
  });

  const stringValue = typeof value === "string" ? value : "";
  const stringAltValue = typeof altValue === "string" ? altValue : "";
  const fieldLabel = formatFieldLabel(fieldKey);

  const resolvedAsset =
    selectedAsset ??
    media.find(
      (asset) => asset.id === stringValue || asset.url === stringValue,
    ) ??
    null;

  const displayedAltText = resolvedAsset
    ? readMediaAltText(resolvedAsset)
    : stringAltValue;

  const storesMediaId = shouldStoreMediaIdForField(fieldKey);
  const expectedStoredValue = resolvedAsset
    ? getMediaValueForField(fieldKey, resolvedAsset)
    : "";

  const shouldNormalizeStoredValue =
    Boolean(resolvedAsset) &&
    stringValue.length > 0 &&
    expectedStoredValue.length > 0 &&
    stringValue !== expectedStoredValue;

  const expectedValueLabel = storesMediaId ? "Media asset ID" : "Media URL";

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{fieldLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose from uploaded media or upload a new image. The media value
            and alt text are filled automatically.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            onClick={() => setIsPickerOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <ImageIcon className="h-4 w-4" />
            Choose media
          </Button>

          {stringValue ? (
            <Button
              onClick={() => {
                setSelectedAsset(null);
                onClear();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {resolvedAsset && shouldNormalizeStoredValue ? (
        <div className="mt-3 rounded-xl border border-amber-300/50 bg-amber-50/70 p-3 text-sm text-amber-950">
          <p className="font-medium">Old media value detected</p>
          <p className="mt-1 text-xs leading-5">
            This field is still storing the old media value format. Convert it
            to the correct {expectedValueLabel.toLowerCase()} so the website can
            render the image.
          </p>
          <Button
            className="mt-3"
            onClick={() => onSelectAsset(resolvedAsset)}
            size="sm"
            type="button"
            variant="outline"
          >
            Convert to {expectedValueLabel}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]">
        <div className="relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/20">
          {resolvedAsset ? (
            <MediaAssetPreview asset={resolvedAsset} sizes="128px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`media-field-${fieldKey}`}>
              {expectedValueLabel}
            </Label>
            <Input
              className="w-full min-w-0 truncate font-mono text-xs sm:text-sm"
              id={`media-field-${fieldKey}`}
              placeholder="Choose media to fill this automatically"
              readOnly
              value={stringValue}
            />
            <p className="text-xs text-muted-foreground">
              This field is locked so media values are not accidentally
              mistyped.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`media-alt-${fieldKey}`}>Image alt text</Label>
            <Input
              id={`media-alt-${fieldKey}`}
              placeholder="Alt text comes from the selected media asset"
              readOnly
              value={displayedAltText}
            />
            <p className="text-xs text-muted-foreground">
              Alt text is pulled from the media library upload metadata.
            </p>
          </div>

          {resolvedAsset ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 max-w-full truncate">
                {resolvedAsset.filename}
              </span>
              <a
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                href={resolvedAsset.url}
                rel="noreferrer"
                target="_blank"
              >
                Open
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : null}
        </div>
      </div>

      <MediaPickerDialog
        fieldLabel={fieldLabel}
        onOpenChange={setIsPickerOpen}
        onSelect={(asset) => {
          setSelectedAsset(asset);
          onSelectAsset(asset);
        }}
        open={isPickerOpen}
      />
    </div>
  );
}

// ── Block editor pane ─────────────────────────────────────────────────────────

function BlockEditorPane({
  block,
  onPropsChange,
}: {
  block: ComposerBlock;
  onPropsChange: (props: Record<string, unknown>) => void;
}) {
  const formSchema = BLOCK_EDITOR_SCHEMAS[block.type];
  const [localProps, setLocalProps] = useState<Record<string, unknown>>(
    block.props,
  );

  const schemaKeys = useMemo(() => getSchemaKeys(formSchema), [formSchema]);

  const mediaFieldKeys = useMemo(
    () => getMediaFieldKeys(block.type, formSchema, localProps),
    [block.type, formSchema, localProps],
  );

  const hiddenSchemaFieldKeys = useMemo(
    () => getHiddenSchemaFieldKeys(mediaFieldKeys, schemaKeys, localProps),
    [localProps, mediaFieldKeys, schemaKeys],
  );

  const handleFieldChange = (key: string, value: unknown) => {
    const next = { ...localProps, [key]: value };
    setLocalProps(next);
    onPropsChange(next);
  };

  const shouldHideSchemaFieldKey = (
    key: string,
    mediaFieldKeys: string[],
  ): boolean => {
    if (mediaFieldKeys.includes(key)) return true;

    if (mediaFieldKeys.length > 0 && isLikelyAltFieldKey(key)) {
      return true;
    }

    return false;
  };

  const handleSelectMediaAsset = (fieldKey: string, asset: MediaAsset) => {
    const altFieldKey = getAltFieldKeyForMediaField(
      fieldKey,
      schemaKeys,
      localProps,
    );

    const next = {
      ...localProps,
      [fieldKey]: getMediaValueForField(fieldKey, asset),
      ...(altFieldKey ? { [altFieldKey]: readMediaAltText(asset) } : {}),
    };

    setLocalProps(next);
    onPropsChange(next);
  };

  const handleClearMediaAsset = (fieldKey: string) => {
    const altFieldKey = getAltFieldKeyForMediaField(
      fieldKey,
      schemaKeys,
      localProps,
    );

    const next = {
      ...localProps,
      [fieldKey]: "",
      ...(altFieldKey ? { [altFieldKey]: "" } : {}),
    };

    setLocalProps(next);
    onPropsChange(next);
  };

  const getAltValue = (fieldKey: string) => {
    const altFieldKey = getAltFieldKeyForMediaField(
      fieldKey,
      schemaKeys,
      localProps,
    );

    return altFieldKey ? localProps[altFieldKey] : "";
  };

  return (
    <div className="space-y-6">
      {mediaFieldKeys.length > 0 ? (
        <section className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Media fields
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the picker instead of hunting for UUIDs in the Media Library.
              The media value and alt text are locked after selection.
            </p>
          </div>

          {mediaFieldKeys.map((fieldKey) => (
            <MediaFieldEditor
              altValue={getAltValue(fieldKey)}
              fieldKey={fieldKey}
              key={fieldKey}
              onClear={() => handleClearMediaAsset(fieldKey)}
              onSelectAsset={(asset) => handleSelectMediaAsset(fieldKey, asset)}
              value={localProps[fieldKey]}
            />
          ))}
        </section>
      ) : null}

      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Block settings
        </p>

        {formSchema ? (
          <SchemaForm
            className="grid gap-4"
            getFieldClassName={(key) =>
              shouldHideSchemaFieldKey(String(key), mediaFieldKeys)
                ? "hidden"
                : undefined
            }
            onChange={handleFieldChange}
            schema={formSchema}
            values={localProps}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
            No editor schema is defined for this block.
          </p>
        )}
      </section>
    </div>
  );
}

// ── Block palette (add block dialog) ─────────────────────────────────────────

function BlockPalette({
  blocks,
  onAdd,
}: {
  blocks: ComposerBlock[];
  onAdd: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const entries = Array.from(BLOCK_REGISTRY.values());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-full" variant="outline">
          <Plus className="h-4 w-4" />
          Add block
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a block</DialogTitle>
          <DialogDescription>
            Choose a block type to add to the page.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          {entries.map((entry) => {
            const canAdd = blockCanBeAdded(blocks, entry.type);

            return (
              <button
                className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/70 p-4 text-left transition hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canAdd}
                key={entry.type}
                onClick={() => {
                  onAdd(entry.type);
                  setOpen(false);
                }}
                type="button"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {entry.editorMeta.label}
                  </p>
                  {entry.editorMeta.maxPerPage !== undefined ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Max {entry.editorMeta.maxPerPage} per page
                      {!canAdd ? " — already added" : ""}
                    </p>
                  ) : null}
                  {entry.editorMeta.note ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.editorMeta.note}
                    </p>
                  ) : null}
                </div>
                <Badge className="text-xs" variant="outline">
                  {entry.editorMeta.icon}
                </Badge>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Single block row ──────────────────────────────────────────────────────────

function BlockRow({
  block,
  index,
  isEditing,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
  total,
}: {
  block: ComposerBlock;
  index: number;
  isEditing: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  total: number;
}) {
  const entry = BLOCK_REGISTRY.get(block.type);
  const formSchema = BLOCK_EDITOR_SCHEMAS[block.type];

  const mediaFieldKeys = useMemo(
    () => getMediaFieldKeys(block.type, formSchema, block.props),
    [block.props, block.type, formSchema],
  );

  const label = entry?.editorMeta.label ?? block.type;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-background/70 transition ${
        isEditing ? "border-primary/60 shadow-sm" : "border-border/60"
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <Button
            aria-label="Move block up"
            className="h-6 w-6"
            disabled={index === 0}
            onClick={onMoveUp}
            size="icon"
            title="Move block up"
            type="button"
            variant="ghost"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            aria-label="Move block down"
            className="h-6 w-6"
            disabled={index === total - 1}
            onClick={onMoveDown}
            size="icon"
            title="Move block down"
            type="button"
            variant="ghost"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>

        <button
          className="min-w-0 flex-1 text-left"
          onClick={onEdit}
          type="button"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {label}
            </p>
            {mediaFieldKeys.length > 0 ? (
              <Badge variant="secondary">
                {mediaFieldKeys.length} media field
                {mediaFieldKeys.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {isEditing ? <Badge>Editing</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">{block.type}</p>
        </button>

        <div className="flex items-center gap-1">
          <Button
            className="gap-2"
            onClick={onEdit}
            size="sm"
            title="Edit block"
            type="button"
            variant={isEditing ? "default" : "outline"}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>

          <Button
            aria-label="Remove block"
            className="h-8 w-8 text-destructive/70 hover:text-destructive"
            onClick={onRemove}
            size="icon"
            title="Remove block"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page editor ──────────────────────────────────────────────────────────

export default function PageEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pageId = params.id;

  const [blocks, setBlocks] = useState<ComposerBlock[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingPublish, setPendingPublish] = useState<
    "publish" | "unpublish" | "preview" | null
  >(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: page,
    isLoading: isPageLoading,
    error: pageError,
    refetch: refetchPage,
  } = useQuery<Page>({
    queryFn: async () => {
      const res = await fetch(`/api/v2/admin/pages/${pageId}`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as Page;
    },
    queryKey: ["admin-page", pageId],
  });

  const { data: versions, isLoading: isVersionsLoading } = useQuery<
    PageVersion[]
  >({
    enabled: Boolean(page),
    queryFn: async () => {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/versions`);
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as PageVersion[];
    },
    queryKey: ["admin-page-versions", pageId],
  });

  const [seededPageId, setSeededPageId] = useState<string | null>(null);
  if (versions !== undefined && seededPageId !== pageId) {
    const latest = versions[0];
    setSeededPageId(pageId);
    setBlocks(
      latest?.blocks?.length ? versionPayloadToBlocks(latest.blocks) : [],
    );
    setEditingBlockId(null);
  }

  const editingBlock =
    blocks.find((block) => block.clientId === editingBlockId) ?? null;

  const saveVersion = useCallback(
    async (currentBlocks: ComposerBlock[]) => {
      setIsSaving(true);

      try {
        const res = await fetch(`/api/v2/admin/pages/${pageId}/versions`, {
          body: JSON.stringify({
            blocks: blocksToVersionPayload(currentBlocks),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!res.ok) {
          const msg = await readErrorMessage(res);
          toast.error(`Autosave failed: ${msg}`);
          return;
        }

        setLastSavedAt(new Date());
      } catch {
        toast.error("Autosave failed — check your connection.");
      } finally {
        setIsSaving(false);
      }
    },
    [pageId],
  );

  const scheduleAutosave = useCallback(
    (currentBlocks: ComposerBlock[]) => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      autosaveTimerRef.current = setTimeout(() => {
        void saveVersion(currentBlocks);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [saveVersion],
  );

  const handlePublish = async () => {
    setPendingPublish("publish");

    try {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/publish`, {
        method: "POST",
      });

      if (!res.ok) throw new Error(await readErrorMessage(res));

      toast.success("Page published.");
      await refetchPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to publish.");
    } finally {
      setPendingPublish(null);
    }
  };

  const handleUnpublish = async () => {
    setPendingPublish("unpublish");

    try {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/unpublish`, {
        method: "POST",
      });

      if (!res.ok) throw new Error(await readErrorMessage(res));

      toast.success("Page unpublished.");
      await refetchPage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to unpublish.");
    } finally {
      setPendingPublish(null);
    }
  };

  const handlePreview = async () => {
    setPendingPublish("preview");

    try {
      const res = await fetch(`/api/v2/admin/pages/${pageId}/preview-token`);
      if (!res.ok) throw new Error(await readErrorMessage(res));

      const data = (await res.json()) as { previewUrl: string };
      window.open(data.previewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to generate preview link.",
      );
    } finally {
      setPendingPublish(null);
    }
  };

  const clearRepeatableDefaultProps = (
    blockType: string,
    props: Record<string, unknown>,
  ): Record<string, unknown> => {
    const editorSchema = BLOCK_EDITOR_SCHEMAS[blockType];

    if (!editorSchema) {
      return props;
    }

    const repeatableKeys = Object.entries(editorSchema.fields)
      .filter(
        ([, field]) =>
          field.meta.type === "list-of-group" ||
          field.meta.type === "list-of-text",
      )
      .map(([key]) => key);

    if (repeatableKeys.length === 0) {
      return props;
    }

    return {
      ...props,
      ...Object.fromEntries(repeatableKeys.map((key) => [key, []])),
    };
  };

  const handleAddBlock = (type: string) => {
    const entry = BLOCK_REGISTRY.get(type);
    const parseResult = entry?.propsSchema.safeParse({});

    const schemaDefaultProps = parseResult?.success
      ? (parseResult.data as Record<string, unknown>)
      : {};

    const defaultProps = createNewBlockDefaultProps(type, schemaDefaultProps);

    setBlocks((prev) => {
      const next = addBlock(prev, type, defaultProps);
      const createdBlock = next.at(-1);

      if (createdBlock) {
        setEditingBlockId(createdBlock.clientId);
      }

      scheduleAutosave(next);
      return next;
    });
  };

  const createNewBlockDefaultProps = (
    blockType: string,
    schemaDefaultProps: Record<string, unknown>,
  ): Record<string, unknown> => {
    const editorSchema = BLOCK_EDITOR_SCHEMAS[blockType];

    if (!editorSchema) {
      return schemaDefaultProps;
    }

    const nextProps = { ...schemaDefaultProps };

    Object.entries(editorSchema.fields).forEach(([key, field]) => {
      switch (field.meta.type) {
        case "text":
        case "textarea":
        case "rich-text":
        case "conditional":
          nextProps[key] = "";
          break;

        case "image-ref":
          nextProps[key] = field.meta.multiple ? [] : "";
          break;

        case "list-of-group":
        case "list-of-text":
          nextProps[key] = [];
          break;

        default:
          break;
      }
    });

    return nextProps;
  };

  const handleRemoveBlock = (clientId: string) => {
    setBlocks((prev) => {
      const next = removeBlock(prev, clientId);

      if (editingBlockId === clientId) {
        setEditingBlockId(null);
      }

      scheduleAutosave(next);
      return next;
    });
  };

  const handleMoveUp = (clientId: string) => {
    setBlocks((prev) => {
      const next = moveBlockUp(prev, clientId);
      scheduleAutosave(next);
      return next;
    });
  };

  const handleMoveDown = (clientId: string) => {
    setBlocks((prev) => {
      const next = moveBlockDown(prev, clientId);
      scheduleAutosave(next);
      return next;
    });
  };

  const handlePropsChange = (
    clientId: string,
    props: Record<string, unknown>,
  ) => {
    setBlocks((prev) => {
      const next = updateBlockProps(prev, clientId, props);
      scheduleAutosave(next);
      return next;
    });
  };

  const handleManualSave = () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    void saveVersion(blocks);
  };

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const isLoading = isPageLoading || isVersionsLoading;
  const isPublishPending = pendingPublish !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            className="gap-1.5"
            onClick={() => router.push("/pages")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="h-4 w-4" />
            Pages
          </Button>

          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Page editor
            </p>
            {isPageLoading ? (
              <Skeleton className="mt-1 h-6 w-40" />
            ) : (
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {page?.title ?? "Untitled"}
              </h2>
            )}
            {page ? (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-mono">/{page.slug}</span> · Changes
                autosave into draft versions.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : lastSavedAt ? (
            <span className="text-xs text-muted-foreground">
              Saved{" "}
              {lastSavedAt.toLocaleTimeString("en-IN", { timeStyle: "short" })}
            </span>
          ) : null}

          {page ? (
            page.status === "published" ? (
              <Badge>Published</Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )
          ) : null}

          <Button
            className="gap-2 rounded-full"
            disabled={isPublishPending || isLoading}
            onClick={() => void handlePreview()}
            type="button"
            variant="outline"
          >
            {pendingPublish === "preview" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview
          </Button>

          <Button
            className="gap-2 rounded-full"
            disabled={isSaving || isLoading}
            onClick={handleManualSave}
            type="button"
            variant="outline"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save draft
          </Button>

          {page?.status === "published" ? (
            <Button
              className="gap-2 rounded-full"
              disabled={isPublishPending || isLoading}
              onClick={() => void handleUnpublish()}
              type="button"
              variant="secondary"
            >
              {pendingPublish === "unpublish" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Unpublish
            </Button>
          ) : (
            <Button
              className="gap-2 rounded-full"
              disabled={isPublishPending || isLoading}
              onClick={() => void handlePublish()}
              type="button"
            >
              {pendingPublish === "publish" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Publish
            </Button>
          )}
        </div>
      </div>

      {pageError ? (
        <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-6">
          <p className="text-sm text-destructive">
            {pageError instanceof Error
              ? pageError.message
              : "Failed to load page."}
          </p>
          <Button
            className="mt-4 rounded-full"
            onClick={() => router.push("/pages")}
            size="sm"
            type="button"
            variant="outline"
          >
            Back to pages
          </Button>
        </div>
      ) : null}

      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader className="flex flex-row items-end justify-between gap-4">
          <div>
            <CardTitle>Blocks</CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading blocks…"
                : `${blocks.length} block${
                    blocks.length === 1 ? "" : "s"
                  } on this page.`}
            </CardDescription>
          </div>
          <BlockPalette blocks={blocks} onAdd={handleAddBlock} />
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 2 }, (_, index) => (
              <Skeleton
                className="h-14 w-full rounded-xl"
                key={`block-skeleton-${index}`}
              />
            ))
          ) : blocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-8 text-center">
              <p className="text-base font-medium text-foreground">
                No blocks yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Click &ldquo;Add block&rdquo; above to start building your page.
              </p>
            </div>
          ) : (
            blocks.map((block, index) => (
              <BlockRow
                block={block}
                index={index}
                isEditing={editingBlockId === block.clientId}
                key={block.clientId}
                onEdit={() => setEditingBlockId(block.clientId)}
                onMoveDown={() => handleMoveDown(block.clientId)}
                onMoveUp={() => handleMoveUp(block.clientId)}
                onRemove={() => handleRemoveBlock(block.clientId)}
                total={blocks.length}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(editingBlock)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBlockId(null);
          }
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-2xl"
          side="right"
        >
          {editingBlock ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {BLOCK_REGISTRY.get(editingBlock.type)?.editorMeta.label ??
                    editingBlock.type}
                </SheetTitle>
                <SheetDescription>
                  Edit this block’s content, media, and display settings.
                  Changes autosave into the draft version.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6">
                <BlockEditorPane
                  block={editingBlock}
                  key={editingBlock.clientId}
                  onPropsChange={(props) =>
                    handlePropsChange(editingBlock.clientId, props)
                  }
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
