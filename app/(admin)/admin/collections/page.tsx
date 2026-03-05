"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Collection = {
  id: string;
  name: string;
  slug: string;
};

const emptyDraft = {
  name: "",
  slug: "",
};

export default function AdminCollectionsPage() {
  const [draft, setDraft] = useState(emptyDraft);

  const loadCollections = async (): Promise<Collection[]> => {
    const response = await fetch("/api/v2/collections");
    if (!response.ok) return [];
    return (await response.json()) as Collection[];
  };

  const { data: collections = [], refetch } = useQuery({
    queryKey: ["admin-collections"],
    queryFn: loadCollections,
  });

  const handleCreate = async () => {
    await fetch("/api/v2/collections", {
      body: JSON.stringify(draft),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    setDraft(emptyDraft);
    await refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Collections</h2>
          <p className="text-sm text-muted-foreground">Curate thematic drops.</p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button>Create Collection</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Collection</DialogTitle>
              <DialogDescription>
                Add a new collection visible on the storefront.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="collection-name">Name</Label>
                <Input
                  id="collection-name"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  value={draft.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection-slug">Slug</Label>
                <Input
                  id="collection-slug"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, slug: event.target.value }))
                  }
                  value={draft.slug}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void handleCreate()} type="button">
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {collections.length > 0 ? (
            collections.map((collection) => (
              <TableRow key={collection.id}>
                <TableCell>{collection.name}</TableCell>
                <TableCell>{collection.slug}</TableCell>
                <TableCell>
                  <Button
                    onClick={async () => {
                      await fetch(`/api/v2/collections/${collection.id}`, {
                        method: "DELETE",
                      });
                      await refetch();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={3}>
                No collections yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
