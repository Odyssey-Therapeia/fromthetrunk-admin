"use client";

import { put } from "@vercel/blob/client";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type MediaAsset = {
  filename: string;
  id: string;
  url: string;
};

type UploadConfig = {
  clientToken: string;
  pathname: string;
};

export default function AdminMediaPage() {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const loadMedia = async () => {
    const response = await fetch("/api/v2/media");
    const data = (await response.json()) as MediaAsset[];
    setMedia(data);
  };

  useEffect(() => {
    void loadMedia();
  }, []);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
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
        const uploadConfig = (await uploadConfigResponse.json()) as UploadConfig;

        const blob = await put(uploadConfig.pathname, file, {
          access: "public",
          contentType: file.type || "application/octet-stream",
          token: uploadConfig.clientToken,
        });

        await fetch("/api/v2/media/complete", {
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
      }

      await loadMedia();
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Media Library</h2>
          <p className="text-sm text-muted-foreground">Upload and manage product visuals.</p>
        </div>

        <label>
          <input
            className="hidden"
            multiple
            onChange={(event) => void uploadFiles(event.target.files)}
            type="file"
          />
          <Button asChild disabled={isUploading}>
            <span>{isUploading ? "Uploading..." : "Upload files"}</span>
          </Button>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {media.map((asset) => (
          <Card key={asset.id}>
            <CardContent className="space-y-2 p-3">
              <div className="aspect-square overflow-hidden rounded-md bg-muted/20">
                <img alt={asset.filename} className="h-full w-full object-cover" src={asset.url} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs">{asset.filename}</p>
                <Button
                  onClick={async () => {
                    await fetch(`/api/v2/media/${asset.id}`, { method: "DELETE" });
                    await loadMedia();
                  }}
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
    </div>
  );
}
