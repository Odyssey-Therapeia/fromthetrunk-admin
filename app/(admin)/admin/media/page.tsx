"use client";

import { put } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MediaAsset = {
  filename: string;
  id: string;
  url: string;
};

type UploadConfig = {
  clientToken: string;
  pathname: string;
};

type PendingAlt = {
  alt: string;
  file: File;
};

export default function AdminMediaPage() {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingAlt[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = async () => {
    const response = await fetch("/api/v2/media");
    const data = (await response.json()) as MediaAsset[];
    setMedia(data);
  };

  useEffect(() => {
    void loadMedia();
  }, []);

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
      current.map((entry, i) => (i === index ? { ...entry, alt } : entry))
    );
  };

  const uploadFiles = async () => {
    if (pendingFiles.length === 0) return;
    // Validate: all files must have non-empty alt
    for (const entry of pendingFiles) {
      if (!entry.alt.trim()) {
        alert(`Please provide alt text for "${entry.file.name}" before uploading.`);
        return;
      }
    }
    setIsUploading(true);
    try {
      for (const { file, alt } of pendingFiles) {
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
      }

      setPendingFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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
            <p className="text-sm font-medium">Alt text (required for each image)</p>
            {pendingFiles.map((entry, index) => (
              <div className="flex items-center gap-3" key={`${entry.file.name}-${index}`}>
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
              disabled={isUploading || pendingFiles.some((e) => !e.alt.trim())}
              onClick={() => void uploadFiles()}
              type="button"
            >
              {isUploading ? "Uploading..." : "Upload files"}
            </Button>
          </div>
        )}

        {pendingFiles.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Select one or more image files. You will be prompted to enter alt text before uploading.
          </p>
        )}
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
