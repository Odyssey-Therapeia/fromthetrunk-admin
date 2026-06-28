"use client";

/**
 * P3-07: Admin theme editor.
 *
 * - Custom UX for theme token editing:
 *   - Color tokens get color pickers, hex inputs, and preset swatches.
 *   - Border radius gets a live slider + value input.
 * - Same-page live preview: a preview region scoped with the draft CSS vars as
 *   an inline style on a wrapper div, so edits are visible before saving.
 * - Version history sheet: lists prior theme versions with a Restore button.
 * - Persists via POST /api/v2/admin/theme (requireAdmin gated).
 *
 * THEME_TOKEN_EDITOR_ADMIN -- custom token editor for color/radius UX
 * LIVE_PREVIEW_THEME_ADMIN -- preview region scoped with draft CSS vars
 */

import { type CSSProperties, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Palette, RotateCcw, Save } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { themeSettingsSchema } from "@/lib/content/theme-settings.schema";

// -- Domain types -------------------------------------------------------------

type ThemeSettings = {
  id: number;
  tokens: Record<string, unknown>;
  updatedAt: string;
};

type ThemeVersion = {
  id: string;
  tokens: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

type ThemeField = {
  meta: {
    description?: string;
    label?: string;
    placeholder?: string;
    type?: string;
  };
};

// -- Helpers ------------------------------------------------------------------

const COLOR_TOKEN_FALLBACKS: Record<string, string> = {
  "--background": "#fdf7f1",
  "--foreground": "#2b1b16",
  "--primary": "#601d1c",
  "--primary-foreground": "#fdf7f1",
  "--accent": "#c89400",
  "--accent-foreground": "#fff8d6",
  "--border": "#dfcdb8",
  "--card": "#fffaf4",
  "--card-foreground": "#2b1b16",
  "--muted": "#f4eadf",
  "--muted-foreground": "#765f53",
  "--secondary": "#f5eadf",
  "--secondary-foreground": "#2b1b16",
};

const COLOR_PRESETS = [
  "#fdf7f1",
  "#fffaf4",
  "#f4eadf",
  "#dfcdb8",
  "#601d1c",
  "#141d46",
  "#c89400",
  "#2b1b16",
  "#0e0d0e",
];

const RADIUS_MIN = 0;
const RADIUS_MAX = 2;
const RADIUS_STEP = 0.05;
const DEFAULT_RADIUS_REM = 0.75;

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

const stringifyTokenValue = (value: unknown) =>
  typeof value === "string" ? value : "";

const getFieldLabel = (key: string, field: ThemeField) =>
  field.meta.label ??
  key
    .replace(/^--/, "")
    .replace(/-/g, " ")
    .replace(/^./, (char) => char.toUpperCase());

const getFieldDescription = (field: ThemeField) => field.meta.description ?? "";

const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return null;
};

const getColorPickerValue = (key: string, value: unknown) =>
  normalizeHexColor(value) ??
  normalizeHexColor(COLOR_TOKEN_FALLBACKS[key]) ??
  "#000000";

const isRadiusField = (key: string, field: ThemeField) => {
  const normalizedKey = key.toLowerCase();
  const normalizedLabel = field.meta.label?.toLowerCase() ?? "";

  return normalizedKey.includes("radius") || normalizedLabel.includes("radius");
};

const isColorField = (key: string, field: ThemeField) => {
  if (isRadiusField(key, field)) return false;

  const normalizedDescription = field.meta.description?.toLowerCase() ?? "";
  const normalizedLabel = field.meta.label?.toLowerCase() ?? "";

  return (
    key.startsWith("--") ||
    normalizedDescription.includes("hex") ||
    normalizedLabel.includes("color") ||
    normalizedLabel.includes("colour")
  );
};

const parseRadiusRem = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (/^-?\d+(\.\d+)?rem$/i.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  if (/^-?\d+(\.\d+)?px$/i.test(trimmed)) {
    return Number.parseFloat(trimmed) / 16;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  return null;
};

const clampRadius = (value: number) =>
  Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, value));

const formatRadiusValue = (value: number) => {
  const fixed = value.toFixed(2).replace(/\.?0+$/, "");
  return `${fixed}rem`;
};

const getThemeFieldEntries = () =>
  Object.entries(themeSettingsSchema.fields) as Array<[string, ThemeField]>;

// -- Version history sheet ----------------------------------------------------

function ThemeVersionSheet({
  open,
  onOpenChange,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: (tokens: Record<string, unknown>) => void;
}) {
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

  const {
    data: versions = [],
    isLoading,
    error: loadError,
    refetch,
  } = useQuery<ThemeVersion[]>({
    queryKey: ["admin-theme-versions"],
    queryFn: async () => {
      const res = await fetch("/api/v2/admin/theme/versions");
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as ThemeVersion[];
    },
    enabled: open,
  });

  const handleRestore = async (version: ThemeVersion) => {
    setPendingRestoreId(version.id);
    try {
      const res = await fetch(
        `/api/v2/admin/theme/versions/${version.id}/restore`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Theme version restored.");
      onRestored(version.tokens);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to restore version.",
      );
    } finally {
      setPendingRestoreId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Theme version history
          </SheetTitle>
          <SheetDescription>
            All saved theme versions, newest first. Restore sets the chosen
            version as the active theme.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">
                {loadError instanceof Error
                  ? loadError.message
                  : "Unable to load versions."}
              </p>
              <Button
                className="mt-3 rounded-full"
                onClick={() => void refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No saved versions yet. Save the theme to create your first
                snapshot.
              </p>
            </div>
          ) : (
            versions.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 p-4"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {new Date(version.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    by {version.createdBy}
                  </p>
                </div>
                <Button
                  disabled={pendingRestoreId === version.id}
                  onClick={() => void handleRestore(version)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {pendingRestoreId === version.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  <span className="ml-1.5">Restore</span>
                </Button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// -- Token editor -------------------------------------------------------------

function ColorTokenField({
  error,
  field,
  fieldKey,
  onChange,
  value,
}: {
  error?: string;
  field: ThemeField;
  fieldKey: string;
  onChange: (key: string, value: unknown) => void;
  value: unknown;
}) {
  const stringValue = stringifyTokenValue(value);
  const pickerValue = getColorPickerValue(fieldKey, value);
  const isInvalidColor =
    stringValue.trim().length > 0 && normalizeHexColor(stringValue) === null;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Label className="text-sm font-semibold">
            {getFieldLabel(fieldKey, field)}
          </Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {getFieldDescription(field) || "Choose a 3 or 6 digit hex colour."}
          </p>
        </div>

        <div
          className="h-11 w-11 shrink-0 rounded-full border border-border/70 shadow-sm"
          style={{ background: pickerValue }}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[4rem_minmax(0,1fr)]">
        <label className="relative flex h-11 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <input
            aria-label={`${getFieldLabel(fieldKey, field)} colour picker`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(event) => onChange(fieldKey, event.target.value)}
            type="color"
            value={pickerValue}
          />
          <span
            className="h-8 w-8 rounded-lg border border-border/60"
            style={{ background: pickerValue }}
          />
        </label>

        <Input
          className="font-mono"
          onChange={(event) => onChange(fieldKey, event.target.value)}
          placeholder={COLOR_TOKEN_FALLBACKS[fieldKey] ?? "#000000"}
          value={stringValue}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {COLOR_PRESETS.map((preset) => (
          <button
            aria-label={`Use ${preset}`}
            className="h-6 w-6 rounded-full border border-border/70 shadow-sm transition hover:scale-110"
            key={`${fieldKey}-${preset}`}
            onClick={() => onChange(fieldKey, preset)}
            style={{ background: preset }}
            title={preset}
            type="button"
          />
        ))}
      </div>

      {isInvalidColor ? (
        <p className="mt-2 text-xs text-destructive">
          Use a valid hex colour like #601d1c or #fff.
        </p>
      ) : error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function RadiusTokenField({
  error,
  field,
  fieldKey,
  onChange,
  value,
}: {
  error?: string;
  field: ThemeField;
  fieldKey: string;
  onChange: (key: string, value: unknown) => void;
  value: unknown;
}) {
  const parsedRadius = parseRadiusRem(value);
  const radiusRem = clampRadius(parsedRadius ?? DEFAULT_RADIUS_REM);
  const radiusValue =
    stringifyTokenValue(value) || formatRadiusValue(radiusRem);

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Label className="text-sm font-semibold">
            {getFieldLabel(fieldKey, field)}
          </Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {getFieldDescription(field) ||
              "Controls rounded corners across the site."}
          </p>
        </div>
        <Badge className="w-fit" variant="secondary">
          {formatRadiusValue(radiusRem)}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <input
          aria-label={`${getFieldLabel(fieldKey, field)} slider`}
          className="w-full accent-primary"
          max={RADIUS_MAX}
          min={RADIUS_MIN}
          onChange={(event) =>
            onChange(fieldKey, formatRadiusValue(Number(event.target.value)))
          }
          step={RADIUS_STEP}
          type="range"
          value={radiusRem}
        />

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="grid grid-cols-4 gap-2">
            {[0, 0.25, 0.75, 1.5].map((sample) => (
              <button
                className="rounded-xl border border-border/70 bg-card px-2 py-2 text-xs text-muted-foreground transition hover:bg-muted"
                key={sample}
                onClick={() => onChange(fieldKey, formatRadiusValue(sample))}
                type="button"
              >
                {formatRadiusValue(sample)}
              </button>
            ))}
          </div>

          <Input
            className="font-mono"
            onChange={(event) => onChange(fieldKey, event.target.value)}
            placeholder="0.75rem"
            value={radiusValue}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {[0.15, 0.4, 0.8, 1.3].map((size, index) => (
          <div
            className="h-12 border border-border/70 bg-card"
            key={`radius-preview-${index}`}
            style={{ borderRadius: formatRadiusValue(size * radiusRem) }}
          />
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SimpleTokenField({
  error,
  field,
  fieldKey,
  onChange,
  value,
}: {
  error?: string;
  field: ThemeField;
  fieldKey: string;
  onChange: (key: string, value: unknown) => void;
  value: unknown;
}) {
  return (
    <div className="space-y-2">
      <Label>{getFieldLabel(fieldKey, field)}</Label>
      <p className="text-xs leading-5 text-muted-foreground">
        {getFieldDescription(field)}
      </p>
      <Input
        onChange={(event) => onChange(fieldKey, event.target.value)}
        placeholder={field.meta.placeholder}
        value={stringifyTokenValue(value)}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function TokenEditor({
  draft,
  errors,
  onChange,
}: {
  draft: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
}) {
  const entries = getThemeFieldEntries();

  return (
    <div className="space-y-4">
      {entries.map(([fieldKey, field]) => {
        const value = draft[fieldKey];
        const error = errors[fieldKey];

        if (isRadiusField(fieldKey, field)) {
          return (
            <RadiusTokenField
              error={error}
              field={field}
              fieldKey={fieldKey}
              key={fieldKey}
              onChange={onChange}
              value={value}
            />
          );
        }

        if (isColorField(fieldKey, field)) {
          return (
            <ColorTokenField
              error={error}
              field={field}
              fieldKey={fieldKey}
              key={fieldKey}
              onChange={onChange}
              value={value}
            />
          );
        }

        return (
          <SimpleTokenField
            error={error}
            field={field}
            fieldKey={fieldKey}
            key={fieldKey}
            onChange={onChange}
            value={value}
          />
        );
      })}
    </div>
  );
}

// -- Live preview region ------------------------------------------------------

// LIVE_PREVIEW_THEME_ADMIN
// The preview div receives the draft tokens as an inline style attribute so
// CSS var overrides apply ONLY within it - the rest of the admin is unaffected.

function LivePreview({
  draftTokens,
}: {
  draftTokens: Record<string, unknown>;
}) {
  const styleRecord: Record<string, string> = {};

  for (const [key, value] of Object.entries(draftTokens)) {
    if (key.startsWith("--") && value !== null && value !== undefined) {
      styleRecord[key] = String(value);
    }
  }

  return (
    <div
      className="space-y-5 rounded-xl border border-border/60 p-6"
      style={styleRecord as CSSProperties}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Live preview
      </p>

      <div className="flex flex-wrap gap-3">
        {[
          ["primary", "--primary"],
          ["accent", "--accent"],
          ["bg", "--background"],
          ["text", "--foreground"],
          ["border", "--border"],
        ].map(([label, token]) => (
          <div className="flex flex-col items-center gap-1.5" key={token}>
            <div
              className="h-11 w-11 rounded-full border border-border/40 shadow-sm"
              style={{ background: `var(${token})` }}
            />
            <span className="text-xs text-foreground opacity-70">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="px-4 py-2 text-sm font-medium shadow-sm"
          style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            borderRadius: "var(--radius)",
          }}
          type="button"
        >
          Primary button
        </button>
        <button
          className="px-4 py-2 text-sm font-medium shadow-sm"
          style={{
            background: "var(--accent)",
            color: "var(--accent-foreground)",
            borderRadius: "var(--radius)",
          }}
          type="button"
        >
          Accent button
        </button>
      </div>

      <div
        className="border p-4"
        style={{
          background: "var(--card, var(--background))",
          borderColor: "var(--border)",
          borderRadius: "var(--radius)",
        }}
      >
        <p
          className="text-sm font-medium"
          style={{ color: "var(--foreground)" }}
        >
          Sample card title
        </p>
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--foreground)", opacity: 0.6 }}
        >
          This is how your card components will look with the current palette.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[1, 1.5, 2].map((scale) => (
          <div
            className="h-20 border bg-card"
            key={scale}
            style={{
              borderColor: "var(--border)",
              borderRadius: `calc(var(--radius) * ${scale})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// -- Main page ----------------------------------------------------------------

export default function AdminThemePage() {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const {
    data: currentTheme,
    isLoading,
    refetch,
  } = useQuery<ThemeSettings | null>({
    queryKey: ["admin-theme"],
    queryFn: async () => {
      const res = await fetch("/api/v2/admin/theme");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as ThemeSettings;
    },
  });

  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (currentTheme && currentTheme.updatedAt !== seededFrom) {
    setSeededFrom(currentTheme.updatedAt);
    setDraft(currentTheme.tokens);
  }

  const handleChange = useCallback((key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setErrors({});

    try {
      const res = await fetch("/api/v2/admin/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: draft }),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { message?: string };
        throw new Error(errData.message ?? `Request failed (${res.status})`);
      }

      toast.success("Theme saved.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save theme.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestored = (tokens: Record<string, unknown>) => {
    setDraft(tokens);
    void refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Content management
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Theme</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust site colors and border radius — no code required.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsHistoryOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Clock className="mr-1.5 h-4 w-4" />
            History
          </Button>
          <Button
            disabled={isSaving}
            onClick={() => void handleSave()}
            size="sm"
            type="button"
          >
            {isSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save theme
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <Card className="border-border/70 bg-card/85 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Token editor</CardTitle>
              </div>
              <CardDescription>
                Pick colors visually, fine-tune hex values, and adjust rounded
                corners with a live slider.
              </CardDescription>
              {currentTheme ? (
                <Badge className="w-fit" variant="secondary">
                  Last saved{" "}
                  {new Date(currentTheme.updatedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Badge>
              ) : (
                <Badge className="w-fit" variant="outline">
                  No theme saved — defaults from globals.css
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <TokenEditor
                draft={draft}
                errors={errors}
                onChange={handleChange}
              />
            </CardContent>
          </Card>

          <Card className="h-fit border-border/70 bg-card/85 shadow-sm lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>
                Reflects draft token values. The rest of the admin is unaffected
                until you save.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LivePreview draftTokens={draft} />
            </CardContent>
          </Card>
        </div>
      )}

      <ThemeVersionSheet
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        onRestored={handleRestored}
      />
    </div>
  );
}
