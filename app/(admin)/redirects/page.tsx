"use client";

/**
 * P3-09: Admin redirects manager.
 *
 * CRUD for the redirects table (fromPath → toPath, 301 permanent).
 * Persists via POST /api/v2/admin/redirects (requireAdmin gated).
 * Delete via DELETE /api/v2/admin/redirects/:from.
 *
 * LOOP GUARD: creating a cycle (A→B→A) or self-redirect (A→A) is allowed
 * at the admin level — the resolver handles cycle detection at runtime.
 * The admin can delete conflicting entries to resolve cycles.
 *
 * Pattern mirrors P3-04 pages admin: list table + create dialog + delete.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Loader2, Plus, Trash2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

type Redirect = {
  id: string;
  fromPath: string;
  toPath: string;
  createdAt: string;
};

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminRedirectsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [fromPath, setFromPath] = useState("/");
  const [toPath, setToPath] = useState("/");
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: redirects = [],
    isLoading,
    error: loadError,
    refetch,
  } = useQuery<Redirect[]>({
    queryKey: ["admin-redirects"],
    queryFn: async () => {
      const res = await fetch("/api/v2/admin/redirects");
      if (!res.ok) throw new Error(await readErrorMessage(res));
      return (await res.json()) as Redirect[];
    },
  });

  const handleCreate = async () => {
    setCreateError(null);

    if (!fromPath.startsWith("/")) {
      setCreateError("From path must start with /");
      return;
    }
    if (!toPath) {
      setCreateError("To path is required");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/v2/admin/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPath, toPath }),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { code?: string; message?: string };
        if (errData.code === "DUPLICATE_FROM_PATH") {
          setCreateError(errData.message ?? "A redirect from that path already exists.");
          return;
        }
        throw new Error(errData.message ?? `Request failed (${res.status})`);
      }

      toast.success("Redirect created.");
      setFromPath("/");
      setToPath("/");
      setIsCreateOpen(false);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to create redirect.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (redirect: Redirect) => {
    setDeletingId(redirect.id);
    try {
      const encodedFrom = encodeURIComponent(redirect.fromPath);
      const res = await fetch(`/api/v2/admin/redirects/${encodedFrom}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      toast.success("Redirect deleted.");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete redirect.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Content management
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Redirects</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage permanent (301) URL redirects. The site checks these on every request.
            Cycle detection prevents infinite redirect loops.
          </p>
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setFromPath("/");
              setToPath("/");
              setCreateError(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full">
              <Plus className="h-4 w-4" />
              Add redirect
            </Button>
          </DialogTrigger>

          <DialogContent className="border-border/70 bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New redirect</DialogTitle>
              <DialogDescription>
                Add a 301 permanent redirect. The From path must start with /.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="from-path">From path</Label>
                <Input
                  id="from-path"
                  value={fromPath}
                  onChange={(e) => {
                    setFromPath(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="/old-page"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="to-path">To path or URL</Label>
                <Input
                  id="to-path"
                  value={toPath}
                  onChange={(e) => {
                    setToPath(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="/new-page"
                />
              </div>

              {createError ? (
                <p className="text-sm text-destructive">{createError}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                disabled={isSaving}
                onClick={() => void handleCreate()}
                type="button"
              >
                {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Create redirect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card className="border-border/70 bg-card/85 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle>All redirects</CardTitle>
          </div>
          <CardDescription>
            {isLoading
              ? "Loading redirects..."
              : `${redirects.length} redirect${redirects.length === 1 ? "" : "s"} configured. All are permanent (301).`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm text-foreground">
                {loadError instanceof Error ? loadError.message : "Unable to load redirects."}
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
          ) : redirects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-6 text-center">
              <Link2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-base font-medium text-foreground">No redirects yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add a redirect to forward one URL to another.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {redirects.map((redirect) => (
                  <TableRow key={redirect.id}>
                    <TableCell className="font-mono text-sm">{redirect.fromPath}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {redirect.toPath}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">301</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        disabled={deletingId === redirect.id}
                        onClick={() => void handleDelete(redirect)}
                        size="sm"
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                      >
                        {deletingId === redirect.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
