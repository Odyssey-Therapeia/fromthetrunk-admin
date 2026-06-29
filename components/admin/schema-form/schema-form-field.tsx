/**
 * components/admin/schema-form/schema-form-field.tsx
 *
 * Renders a single field driven by FieldMeta (P2-01 types).
 * Pure React — no TanStack Form dependency. Designed to be wrapped
 * inside TanStack Form's `form.Field` render-prop on call sites.
 *
 * FT-01  text          → <Input type="text">
 * FT-02  textarea      → <Textarea>
 * FT-03  rich-text     → <Textarea> (rich-text editor deferred per spec spike)
 * FT-04  number        → <Input type="number">
 * FT-05  money-paise   → <Input type="number"> shown in rupees, stored in paise
 * FT-06  select        → <select> (native, SSR-safe)
 * FT-07  multi-select  → checkbox list per option
 * FT-08  boolean       → <Switch>
 * FT-09  image-ref     → media picker + upload, stores media UUID
 * FT-10  list-of-group → repeatable group rows (add/remove)
 * FT-11  conditional   → honours FieldMeta.showIf predicate; renders null when false
 * FT-12  list-of-text  → repeatable list of bare string rows; emits string[] directly
 */

import { put } from "@vercel/blob/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  ImageIcon,
  Loader2,
  Search,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toPaise, toRupees } from "@/db/money";
import type { FieldMeta, FormSchema } from "@/lib/forms/types";

// ---------------------------------------------------------------------------
// Public props type
// ---------------------------------------------------------------------------

export type SchemaFormFieldProps = {
  fieldKey: string;
  valueKey?: string;
  meta: FieldMeta;
  value: unknown;
  error?: string;
  formValues: Record<string, unknown>;
  onBlur: () => void;
  onChange: (value: unknown) => void;
  onLinkedFieldChange?: (key: string, value: unknown) => void;
  onLinkedFieldsChange?: (updates: Record<string, unknown>) => void;
};

// ---------------------------------------------------------------------------
// Shared media types/helpers
// ---------------------------------------------------------------------------

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

const MEDIA_QUERY_KEY = ["admin-media"] as const;
const EMPTY_MEDIA: MediaAsset[] = [];

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

const isImageFile = (file: File) =>
  file.type.startsWith("image/") ||
  /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.name);

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;

  return `${(kilobytes / 1024).toFixed(1)} MB`;
};

const formatFieldLabel = (value: string) =>
  value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const getAltFieldKeyForImageField = (
  fieldKey: string,
  formValues: Record<string, unknown>,
) => {
  const availableKeys = new Set(Object.keys(formValues));
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

const getImageValueForAsset = (fieldKey: string, asset: MediaAsset) => {
  const normalized = fieldKey.toLowerCase();

  if (normalized.endsWith("url") || normalized.includes("imageurl")) {
    return asset.url;
  }

  return asset.id;
};

// ---------------------------------------------------------------------------
// Error message helper
// ---------------------------------------------------------------------------

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {error}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Number input helpers
// ---------------------------------------------------------------------------

const parseOptionalNumberInput = (value: string): number | undefined => {
  if (value === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseOptionalMoneyPaiseInput = (value: string): number | undefined => {
  const rupees = parseOptionalNumberInput(value);
  return rupees === undefined ? undefined : toPaise(rupees);
};

// ---------------------------------------------------------------------------
// FT-01 text
// ---------------------------------------------------------------------------

function TextField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <Input
        id={id}
        type="text"
        placeholder={meta.placeholder}
        value={typeof value === "string" ? value : ""}
        onBlur={onBlur}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : event.target.value)
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-02 textarea / FT-03 rich-text (deferred to textarea)
// ---------------------------------------------------------------------------

function TextareaField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <Textarea
        id={id}
        placeholder={meta.placeholder}
        value={typeof value === "string" ? value : ""}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        rows={4}
      />
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-04 number
// Empty input stays empty while editing instead of being coerced back to 0.
// ---------------------------------------------------------------------------

function NumberField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const displayValue = typeof value === "number" ? String(value) : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <Input
        id={id}
        type="number"
        placeholder={meta.placeholder}
        value={displayValue}
        onBlur={onBlur}
        onChange={(event) =>
          onChange(parseOptionalNumberInput(event.target.value))
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-05 money-paise
// Form holds paise (integer), input shows rupees (display).
// Empty input stays empty while editing instead of being coerced back to ₹0.
// ---------------------------------------------------------------------------

function MoneyPaiseField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const rupeesDisplay =
    typeof value === "number" ? String(toRupees(value)) : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          ₹
        </span>
        <Input
          id={id}
          type="number"
          className="pl-7"
          placeholder={meta.placeholder ?? "0"}
          value={rupeesDisplay}
          min={0}
          step={0.01}
          onBlur={onBlur}
          onChange={(event) =>
            onChange(parseOptionalMoneyPaiseInput(event.target.value))
          }
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-06 select (native <select> — SSR-safe, no Radix portal needed)
// ---------------------------------------------------------------------------

function SelectField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const options = meta.options ?? [];

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <select
        id={id}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={typeof value === "string" ? value : ""}
        onBlur={onBlur}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : event.target.value)
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <option value="">— select —</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-07 multi-select — checkbox list per option
// value is string[] (or string CSV for backward compat on tagsCsv)
// ---------------------------------------------------------------------------

function MultiSelectField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const options = meta.options ?? [];
  const selected: string[] = Array.isArray(value) ? (value as string[]) : [];

  const toggle = (optValue: string) => {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <div
        className="rounded-md border border-input p-3 space-y-2"
        role="group"
        aria-labelledby={`${id}-group-label`}
        onBlur={onBlur}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              className="accent-primary"
              value={opt.value}
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">No options available</p>
        ) : null}
      </div>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-08 boolean — Switch
// ---------------------------------------------------------------------------

function BooleanField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}
      <div className="flex h-10 items-center gap-3 rounded-md border px-3">
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(Boolean(checked))}
          onBlur={onBlur}
        />
        <span className="text-sm text-muted-foreground">
          {Boolean(value) ? "Enabled" : "Disabled"}
        </span>
      </div>
      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-09 image-ref — media picker + upload.
// Stores UUID(s), and fills a sibling alt field when available.
// ---------------------------------------------------------------------------

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
  multiple,
  onOpenChange,
  onSelect,
  open,
}: {
  fieldLabel: string;
  multiple?: boolean;
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

      if (!multiple) {
        onOpenChange(false);
      }
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
                      if (!multiple) {
                        onOpenChange(false);
                      }
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

function ImageRefField({
  fieldKey,
  valueKey,
  meta,
  value,
  error,
  formValues,
  onBlur,
  onChange,
  onLinkedFieldChange,
  onLinkedFieldsChange,
}: SchemaFormFieldProps) {
  const id = `sf-${fieldKey}`;
  const storageKey = valueKey ?? fieldKey;
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const { data: media = EMPTY_MEDIA } = useQuery({
    queryFn: fetchMedia,
    queryKey: MEDIA_QUERY_KEY,
  });

  const selectedIds = Array.isArray(value)
    ? (value as unknown[]).filter(
        (entry): entry is string => typeof entry === "string",
      )
    : typeof value === "string" && value.length > 0
      ? [value]
      : [];

  const selectedAssets = selectedIds
    .map((selectedId) =>
      media.find(
        (asset) => asset.id === selectedId || asset.url === selectedId,
      ),
    )
    .filter((asset): asset is MediaAsset => Boolean(asset));

  const primaryAsset = selectedAssets[0] ?? null;
  const altFieldKey = getAltFieldKeyForImageField(storageKey, formValues);
  const altValue =
    altFieldKey && typeof formValues[altFieldKey] === "string"
      ? formValues[altFieldKey]
      : primaryAsset
        ? readMediaAltText(primaryAsset)
        : "";

  const setImageValue = (asset: MediaAsset) => {
    const nextValue = getImageValueForAsset(storageKey, asset);
    const finalValue = meta.multiple
      ? Array.from(new Set([...selectedIds, nextValue]))
      : nextValue;

    const altText = readMediaAltText(asset);

    if (onLinkedFieldsChange) {
      onLinkedFieldsChange({
        [storageKey]: finalValue,
        ...(altFieldKey ? { [altFieldKey]: altText } : {}),
      });
    } else {
      onChange(finalValue);

      if (altFieldKey && onLinkedFieldChange) {
        onLinkedFieldChange(altFieldKey, altText);
      }
    }

    onBlur();
  };

  const clearImageValue = () => {
    const finalValue = meta.multiple ? [] : "";

    if (onLinkedFieldsChange) {
      onLinkedFieldsChange({
        [storageKey]: finalValue,
        ...(altFieldKey ? { [altFieldKey]: "" } : {}),
      });
    } else {
      onChange(finalValue);

      if (altFieldKey && onLinkedFieldChange) {
        onLinkedFieldChange(altFieldKey, "");
      }
    }

    onBlur();
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}

      <div className="rounded-xl border border-border/70 bg-background/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {formatFieldLabel(fieldKey)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose from uploaded media or upload a new image. The media ID and
              alt text are filled automatically.
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

            {selectedIds.length > 0 ? (
              <Button
                onClick={clearImageValue}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/20">
            {primaryAsset ? (
              <MediaAssetPreview asset={primaryAsset} sizes="128px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <div className="space-y-2">
              <Label htmlFor={id}>
                {meta.multiple ? "Media asset IDs" : "Media asset ID"}
              </Label>
              <Input
                className="w-full min-w-0 truncate font-mono text-xs sm:text-sm"
                id={id}
                placeholder="Choose media to fill this automatically"
                readOnly
                value={selectedIds.join(", ")}
              />
              <p className="text-xs text-muted-foreground">
                This field is locked so media IDs are not accidentally mistyped.
              </p>
            </div>

            {!meta.multiple ? (
              <div className="space-y-2">
                <Label htmlFor={`${id}-alt`}>Image alt text</Label>
                <Input
                  id={`${id}-alt`}
                  placeholder="Alt text comes from the selected media asset"
                  readOnly
                  value={altValue}
                />
                <p className="text-xs text-muted-foreground">
                  Alt text is pulled from the media library upload metadata.
                </p>
              </div>
            ) : null}

            {primaryAsset ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 max-w-full truncate">
                  {primaryAsset.filename}
                </span>
                <a
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  href={primaryAsset.url}
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
      </div>

      <MediaPickerDialog
        fieldLabel={meta.label}
        multiple={meta.multiple}
        onOpenChange={setIsPickerOpen}
        onSelect={setImageValue}
        open={isPickerOpen}
      />

      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-10 list-of-group — repeatable rows
// ---------------------------------------------------------------------------

type GroupRow = Record<string, unknown>;

function ListOfGroupField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const rows: GroupRow[] = Array.isArray(value) ? (value as GroupRow[]) : [];
  const itemSchema: FormSchema | undefined = meta.itemSchema;
  const subFields = itemSchema ? Object.entries(itemSchema.fields) : [];

  const updateRow = (rowIndex: number, subKey: string, subValue: unknown) => {
    const next = rows.map((row, i) =>
      i === rowIndex ? { ...row, [subKey]: subValue } : row,
    );
    onChange(next);
  };

  const updateRowFields = (
    rowIndex: number,
    updates: Record<string, unknown>,
  ) => {
    const next = rows.map((row, index) =>
      index === rowIndex ? { ...row, ...updates } : row,
    );

    onChange(next);
  };

  const addRow = () => {
    const blank: GroupRow = Object.fromEntries(
      subFields.map(([key]) => [key, ""]),
    );
    onChange([...rows, blank]);
  };

  const removeRow = (rowIndex: number) => {
    onChange(rows.filter((_, i) => i !== rowIndex));
  };

  return (
    <div className="space-y-3">
      <Label>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}

      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="rounded-md border border-border p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              Item {rowIndex + 1}
            </span>
            <button
              type="button"
              className="text-xs text-destructive hover:underline"
              onClick={() => removeRow(rowIndex)}
              onBlur={onBlur}
            >
              Remove
            </button>
          </div>
          {subFields.map(([subKey, subDef]) => (
            <SchemaFormField
              key={subKey}
              fieldKey={`${fieldKey}-${rowIndex}-${subKey}`}
              valueKey={subKey}
              meta={subDef.meta}
              value={row[subKey] ?? ""}
              error={undefined}
              formValues={row}
              onBlur={onBlur}
              onChange={(nextValue) => updateRow(rowIndex, subKey, nextValue)}
              onLinkedFieldChange={(linkedKey, linkedValue) =>
                updateRow(rowIndex, linkedKey, linkedValue)
              }
              onLinkedFieldsChange={(updates) =>
                updateRowFields(rowIndex, updates)
              }
            />
          ))}
        </div>
      ))}

      <button
        type="button"
        className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-input hover:text-foreground"
        onClick={addRow}
        onBlur={onBlur}
      >
        Add {meta.label}
      </button>

      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-12 list-of-text — repeatable bare-string rows (emits string[])
// ---------------------------------------------------------------------------

function ListOfTextField({
  fieldKey,
  meta,
  value,
  error,
  onBlur,
  onChange,
}: SchemaFormFieldProps) {
  const rows: string[] = Array.isArray(value)
    ? (value as unknown[]).map((v) => (typeof v === "string" ? v : ""))
    : [];

  const addRow = () => {
    onChange([...rows, ""]);
  };

  const updateRow = (index: number, next: string) => {
    const updated = rows.map((row, i) => (i === index ? next : row));
    onChange(updated);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <Label>{meta.label}</Label>
      {meta.description ? (
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      ) : null}

      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            id={`sf-${fieldKey}-${index}`}
            type="text"
            placeholder={meta.placeholder}
            value={row}
            onBlur={onBlur}
            onChange={(event) => updateRow(index, event.target.value)}
          />
          <button
            type="button"
            className="shrink-0 text-xs text-destructive hover:underline"
            onClick={() => removeRow(index)}
            onBlur={onBlur}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-input hover:text-foreground"
        onClick={addRow}
        onBlur={onBlur}
      >
        Add {meta.label}
      </button>

      <FieldError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FT-11 conditional — honours showIf predicate
// If showIf returns false, renders null (field is hidden/unmounted).
// The actual field type is treated as "text" for the inner renderer since
// conditional is a wrapper meta-type; callers should set an appropriate
// inner type via a nested schema or plain text default.
// ---------------------------------------------------------------------------

function ConditionalField(props: SchemaFormFieldProps) {
  const { meta, formValues } = props;

  if (meta.showIf && !meta.showIf(formValues)) {
    return null;
  }

  return <TextField {...props} />;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function SchemaFormField(props: SchemaFormFieldProps) {
  const { meta } = props;

  switch (meta.type) {
    case "text":
      return <TextField {...props} />;
    case "textarea":
      return <TextareaField {...props} />;
    case "rich-text":
      return <TextareaField {...props} />;
    case "number":
      return <NumberField {...props} />;
    case "money-paise":
      return <MoneyPaiseField {...props} />;
    case "select":
      return <SelectField {...props} />;
    case "multi-select":
      return <MultiSelectField {...props} />;
    case "boolean":
      return <BooleanField {...props} />;
    case "image-ref":
      return <ImageRefField {...props} />;
    case "list-of-group":
      return <ListOfGroupField {...props} />;
    case "list-of-text":
      return <ListOfTextField {...props} />;
    case "conditional":
      return <ConditionalField {...props} />;
    default: {
      const _exhaustive: never = meta.type;
      return null;
    }
  }
}
