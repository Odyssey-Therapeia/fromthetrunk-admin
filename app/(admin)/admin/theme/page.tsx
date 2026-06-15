"use client";

/**
 * P3-07: Admin theme editor.
 *
 * - SchemaForm over themeSettingsSchema - zero bespoke per-token UI.
 *   Adding a field to themeSettingsSchema renders it here automatically (D-style).
 * - Same-page live preview: a preview region scoped with the draft CSS vars as
 *   an inline style on a wrapper div, so edits are visible before saving.
 * - Version history sheet: lists prior theme versions with a Restore button.
 * - Persists via POST /api/v2/admin/theme (requireAdmin gated).
 *
 * SCHEMA_FORM_THEME_ADMIN -- SchemaForm is rendered below using themeSettingsSchema
 * THEME_SETTINGS_SCHEMA_DRIVEN -- all token fields come from themeSettingsSchema
 * LIVE_PREVIEW_THEME_ADMIN -- preview region scoped with draft CSS vars
 */

import { useCallback, useEffect, useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SchemaForm } from "@/components/admin/schema-form/schema-form";
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

// -- Helpers ------------------------------------------------------------------

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
      const res = await fetch(`/api/v2/admin/theme/versions/${version.id}/restore`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Theme version restored.");
      onRestored(version.tokens);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to restore version.");
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
            All saved theme versions, newest first. Restore sets the chosen version
            as the active theme.
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
                No saved versions yet. Save the theme to create your first snapshot.
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

// -- Live preview region ------------------------------------------------------

// LIVE_PREVIEW_THEME_ADMIN
// The preview div receives the draft tokens as an inline style attribute so
// CSS var overrides apply ONLY within it - the rest of the admin is unaffected.

function LivePreview({ draftTokens }: { draftTokens: Record<string, unknown> }) {
  // Build an inline style object from the draft tokens (CSS vars only).
  const styleRecord: Record<string, string> = {};
  for (const [key, value] of Object.entries(draftTokens)) {
    if (key.startsWith("--") && value !== null && value !== undefined) {
      styleRecord[key] = String(value);
    }
  }

  return (
    <div
      className="rounded-xl border border-border/60 p-6 space-y-4"
      style={styleRecord as React.CSSProperties}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Live preview
      </p>
      {/* Primary swatch */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="h-10 w-10 rounded-full border border-border/40"
            style={{ background: "var(--primary)" }}
          />
          <span className="text-xs text-foreground opacity-70">primary</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="h-10 w-10 rounded-full border border-border/40"
            style={{ background: "var(--accent)" }}
          />
          <span className="text-xs text-foreground opacity-70">accent</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="h-10 w-10 rounded-full border border-border/40"
            style={{ background: "var(--background)" }}
          />
          <span className="text-xs text-foreground opacity-70">bg</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="h-10 w-10 rounded-full border border-border/40"
            style={{ background: "var(--border)" }}
          />
          <span className="text-xs text-foreground opacity-70">border</span>
        </div>
      </div>
      {/* Button samples */}
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-full px-4 py-2 text-sm font-medium"
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
          className="rounded-full px-4 py-2 text-sm font-medium"
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
      {/* Sample card */}
      <div
        className="rounded-xl border p-4"
        style={{
          background: "var(--card, var(--background))",
          borderColor: "var(--border)",
          borderRadius: "var(--radius)",
        }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
          Sample card title
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--foreground)", opacity: 0.6 }}>
          This is how your card components will look with the current palette.
        </p>
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

  // Load current theme on mount
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

  // Seed draft from current theme once loaded
  useEffect(() => {
    if (currentTheme) {
      setDraft(currentTheme.tokens);
    }
  }, [currentTheme]);

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
      {/* -- Header -- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Content management
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Theme</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Adjust site colors and border radius - no code required.
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
        <div className="grid gap-6 lg:grid-cols-2">
          {/* -- Token editor -- */}
          <Card className="border-border/70 bg-card/85 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Token editor</CardTitle>
              </div>
              <CardDescription>
                Edit the design tokens. Changes are previewed live on the right.
                Save to apply site-wide.
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
                  No theme saved - defaults from globals.css
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {/*
               * SCHEMA_FORM_THEME_ADMIN
               * THEME_SETTINGS_SCHEMA_DRIVEN
               * SchemaForm renders all token fields from themeSettingsSchema.
               * Adding a field to themeSettingsSchema renders it here with zero
               * editor changes (D-style proof).
               */}
              <SchemaForm
                className="grid gap-4"
                errors={errors}
                onChange={handleChange}
                schema={themeSettingsSchema}
                values={draft}
              />
            </CardContent>
          </Card>

          {/* -- Live preview -- */}
          <Card className="border-border/70 bg-card/85 shadow-sm">
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

      {/* -- Version history sheet -- */}
      <ThemeVersionSheet
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        onRestored={handleRestored}
      />
    </div>
  );
}
