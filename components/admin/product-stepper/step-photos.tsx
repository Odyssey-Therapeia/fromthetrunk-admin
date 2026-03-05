"use client";

import { put } from "@vercel/blob/client";
import { useState } from "react";
import { Loader2, UploadCloud, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StepPhotosProps = {
  form: any;
};

type UploadConfig = {
  clientToken: string;
  pathname: string;
};

type CompletedMedia = {
  id: string;
  url: string;
};

export function StepPhotos({
  form,
}: StepPhotosProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<CompletedMedia[]>([]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);

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
        if (!uploadConfigResponse.ok) {
          throw new Error(`Upload URL failed for ${file.name}.`);
        }

        const uploadConfig = (await uploadConfigResponse.json()) as UploadConfig;
        const blob = await put(uploadConfig.pathname, file, {
          access: "public",
          contentType: file.type || "application/octet-stream",
          token: uploadConfig.clientToken,
        });

        const completeResponse = await fetch("/api/v2/media/complete", {
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
        if (!completeResponse.ok) {
          throw new Error(`Could not persist media ${file.name}.`);
        }

        const media = (await completeResponse.json()) as CompletedMedia;
        setUploaded((prev) => [...prev, media]);
        form.setFieldValue("imageMediaIds", (prev: string[]) => [...prev, media.id]);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-8 text-center">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Drag and drop or click to upload</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, WEBP up to 10MB each</p>
          </div>
          <input
            className="hidden"
            multiple
            onChange={(event) => void handleUpload(event.target.files)}
            type="file"
          />
        </label>

        {isUploading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading assets...
          </div>
        ) : null}

        {uploadError ? (
          <p className="text-sm text-destructive">{uploadError}</p>
        ) : null}

        {uploaded.length > 0 ? (
          <div className="space-y-2">
            {uploaded.map((media) => (
              <div
                className="flex items-center justify-between rounded-md border p-2 text-xs"
                key={media.id}
              >
                <a className="max-w-[80%] truncate text-primary underline-offset-4 hover:underline" href={media.url} rel="noreferrer" target="_blank">
                  {media.url}
                </a>
                <Button
                  onClick={() =>
                    form.setFieldValue("imageMediaIds", (prev: string[]) =>
                      prev.filter((id) => id !== media.id)
                    )
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
