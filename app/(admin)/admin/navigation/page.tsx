"use client";

/**
 * P3-09: Admin navigation menu editor.
 *
 * Manages header and footer navigation menus. Persists via the content-store
 * port through POST /api/v2/admin/navigation/:slot (requireAdmin gated).
 *
 * HEADER slot: flat list of { label, href } menu items.
 * FOOTER slot: section-grouped list of { title, links: { label, href }[] }.
 *   The two slots have different shapes to match what SiteFooter renders.
 *
 * Pattern mirrors P3-07 theme editor: load/save cycle, toast feedback.
 */

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Menu, Plus, Save, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ─────────────────────────────────────────────────────────────────────

type NavItem = { label: string; href: string };
type FooterSection = { title: string; links: NavItem[] };
type MenuSlot = "header" | "footer";

type NavigationMenu = {
  id: string;
  slot: MenuSlot;
  items: unknown[];
  updatedAt: string;
} | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Header menu editor (flat {label, href} items) ─────────────────────────────

function HeaderMenuEditor() {
  const {
    data: menu,
    isLoading,
    refetch,
  } = useQuery<NavigationMenu>({
    queryKey: ["admin-navigation", "header"],
    queryFn: async () => {
      const res = await fetch("/api/v2/admin/navigation/header");
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const body = (await res.json()) as { menu: NavigationMenu };
      return body.menu;
    },
  });

  const [items, setItems] = useState<NavItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  if (!seeded && !isLoading) {
    setItems((menu?.items as NavItem[] | undefined) ?? []);
    setSeeded(true);
  }

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { label: "", href: "/" }]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback((index: number, field: keyof NavItem, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/v2/admin/navigation/header", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Header navigation saved.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save header menu.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Menu className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Header menu</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Links shown in the site header navigation bar.
          </CardDescription>
          {menu?.updatedAt ? (
            <Badge className="mt-2 w-fit" variant="secondary">
              Last saved{" "}
              {new Date(menu.updatedAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </Badge>
          ) : (
            <Badge className="mt-2 w-fit" variant="outline">
              Using defaults
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={addItem} size="sm" type="button" variant="outline">
            <Plus className="mr-1.5 h-4 w-4" />
            Add item
          </Button>
          <Button disabled={isSaving} onClick={() => void handleSave()} size="sm" type="button">
            {isSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No items yet. Add items to override the default navigation.
              Saving an empty list restores defaults.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      value={item.label}
                      onChange={(e) => updateItem(i, "label", e.target.value)}
                      placeholder="Collection"
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.href}
                      onChange={(e) => updateItem(i, "href", e.target.value)}
                      placeholder="/collection"
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      onClick={() => removeItem(i)}
                      size="sm"
                      type="button"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Footer menu editor (section-grouped {title, links[]} items) ───────────────

function FooterMenuEditor() {
  const {
    data: menu,
    isLoading,
    refetch,
  } = useQuery<NavigationMenu>({
    queryKey: ["admin-navigation", "footer"],
    queryFn: async () => {
      const res = await fetch("/api/v2/admin/navigation/footer");
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const body = (await res.json()) as { menu: NavigationMenu };
      return body.menu;
    },
  });

  const [sections, setSections] = useState<FooterSection[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  if (!seeded && !isLoading) {
    // Seed from persisted data if it matches FooterSection shape, else empty.
    const persisted = (menu?.items ?? []) as unknown[];
    const isValidSections =
      Array.isArray(persisted) &&
      persisted.every(
        (s) =>
          s &&
          typeof s === "object" &&
          typeof (s as Record<string, unknown>).title === "string" &&
          Array.isArray((s as Record<string, unknown>).links)
      );
    setSections(isValidSections ? (persisted as FooterSection[]) : []);
    setSeeded(true);
  }

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, { title: "", links: [] }]);
  }, []);

  const removeSection = useCallback((si: number) => {
    setSections((prev) => prev.filter((_, i) => i !== si));
  }, []);

  const updateSectionTitle = useCallback((si: number, title: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === si ? { ...s, title } : s))
    );
  }, []);

  const addLink = useCallback((si: number) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, links: [...s.links, { label: "", href: "/" }] } : s
      )
    );
  }, []);

  const removeLink = useCallback((si: number, li: number) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, links: s.links.filter((_, j) => j !== li) } : s
      )
    );
  }, []);

  const updateLink = useCallback(
    (si: number, li: number, field: keyof NavItem, value: string) => {
      setSections((prev) =>
        prev.map((s, i) =>
          i === si
            ? {
                ...s,
                links: s.links.map((link, j) =>
                  j === li ? { ...link, [field]: value } : link
                ),
              }
            : s
        )
      );
    },
    []
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/v2/admin/navigation/footer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: sections }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Footer navigation saved.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save footer menu.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-border/70 bg-card/85 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Menu className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Footer menu</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Section-grouped links shown in the site footer. Each section has a title and links.
          </CardDescription>
          {menu?.updatedAt ? (
            <Badge className="mt-2 w-fit" variant="secondary">
              Last saved{" "}
              {new Date(menu.updatedAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </Badge>
          ) : (
            <Badge className="mt-2 w-fit" variant="outline">
              Using defaults
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={addSection} size="sm" type="button" variant="outline">
            <Plus className="mr-1.5 h-4 w-4" />
            Add section
          </Button>
          <Button disabled={isSaving} onClick={() => void handleSave()} size="sm" type="button">
            {isSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No sections yet. Add sections to override the default footer.
              Saving an empty list restores defaults.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map((section, si) => (
              <div key={si} className="rounded-xl border border-border/60 bg-background/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <Label htmlFor={`section-title-${si}`} className="text-xs text-muted-foreground mb-1 block">
                      Section title
                    </Label>
                    <Input
                      id={`section-title-${si}`}
                      value={section.title}
                      onChange={(e) => updateSectionTitle(si, e.target.value)}
                      placeholder="Explore"
                      className="h-8"
                    />
                  </div>
                  <div className="flex items-center gap-1 mt-5">
                    <Button
                      onClick={() => addLink(si)}
                      size="sm"
                      type="button"
                      variant="outline"
                      className="h-8"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      onClick={() => removeSection(si)}
                      size="sm"
                      type="button"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {section.links.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No links. Click + to add a link to this section.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Label</TableHead>
                        <TableHead className="text-xs">URL</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.links.map((link, li) => (
                        <TableRow key={li}>
                          <TableCell>
                            <Input
                              value={link.label}
                              onChange={(e) => updateLink(si, li, "label", e.target.value)}
                              placeholder="Collection"
                              className="h-7 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={link.href}
                              onChange={(e) => updateLink(si, li, "href", e.target.value)}
                              placeholder="/collection"
                              className="h-7 text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              onClick={() => removeLink(si, li)}
                              size="sm"
                              type="button"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="sr-only">Remove link</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminNavigationPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Content management
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Navigation</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage the site header and footer navigation menus. Changes take effect on the
          next page load. Saving an empty list restores the default navigation.
        </p>
      </div>

      <HeaderMenuEditor />
      <FooterMenuEditor />
    </div>
  );
}
