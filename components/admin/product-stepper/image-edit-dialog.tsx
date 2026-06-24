import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  RotateCcw,
  RotateCw,
  WandSparkles,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { useNetworkStatus } from "./network-sync";
import type { ProductStepperMedia } from "./types";

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 600;
const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 1500;

type CropMode = "cover" | "contain";

type ImageEditDialogProps = {
  media: null | ProductStepperMedia;
  onApply: (media: ProductStepperMedia, file: File) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

type Offset = {
  x: number;
  y: number;
};

type GeneratedBackground = {
  file: File;
  previewUrl: string;
};

const normalizeRotation = (rotation: number) => {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const getRotatedImageBounds = (image: HTMLImageElement, rotation: number) => {
  const normalized = normalizeRotation(rotation);
  const isSideways = normalized === 90 || normalized === 270;

  return {
    height: isSideways ? image.naturalWidth : image.naturalHeight,
    width: isSideways ? image.naturalHeight : image.naturalWidth,
  };
};

const getBaseScale = ({
  image,
  mode,
  outputHeight,
  outputWidth,
  rotation,
}: {
  image: HTMLImageElement;
  mode: CropMode;
  outputHeight: number;
  outputWidth: number;
  rotation: number;
}) => {
  const rotatedBounds = getRotatedImageBounds(image, rotation);

  if (mode === "contain") {
    return Math.min(
      outputWidth / rotatedBounds.width,
      outputHeight / rotatedBounds.height,
    );
  }

  return Math.max(
    outputWidth / rotatedBounds.width,
    outputHeight / rotatedBounds.height,
  );
};

const drawImageToCanvas = ({
  canvas,
  image,
  mode,
  offset,
  outputHeight,
  outputWidth,
  rotation,
  zoom,
}: {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  mode: CropMode;
  offset: Offset;
  outputHeight: number;
  outputWidth: number;
  rotation: number;
  zoom: number;
}) => {
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, outputWidth, outputHeight);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);

  const baseScale = getBaseScale({
    image,
    mode,
    outputHeight,
    outputWidth,
    rotation,
  });
  const finalScale = baseScale * zoom;

  context.save();
  context.translate(outputWidth / 2 + offset.x, outputHeight / 2 + offset.y);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(finalScale, finalScale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
};

const drawMaskToCanvas = ({
  canvas,
  image,
  mode,
  offset,
  outputHeight,
  outputWidth,
  rotation,
  zoom,
}: {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  mode: CropMode;
  offset: Offset;
  outputHeight: number;
  outputWidth: number;
  rotation: number;
  zoom: number;
}) => {
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, outputWidth, outputHeight);

  const baseScale = getBaseScale({
    image,
    mode,
    outputHeight,
    outputWidth,
    rotation,
  });
  const finalScale = baseScale * zoom;

  context.save();
  context.translate(outputWidth / 2 + offset.x, outputHeight / 2 + offset.y);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(finalScale, finalScale);
  context.fillStyle = "rgba(255, 255, 255, 1)";
  context.fillRect(
    -image.naturalWidth / 2,
    -image.naturalHeight / 2,
    image.naturalWidth,
    image.naturalHeight,
  );
  context.restore();
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) =>
  new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not export edited image."));
            return;
          }

          resolve(blob);
        },
        type,
        quality,
      );
    } catch (error) {
      reject(error);
    }
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read generated image."));
        return;
      }

      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const dataUrlToFile = async (dataUrl: string, filename: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return new File([blob], filename, {
    type: blob.type || "image/png",
  });
};

const toEditedFilename = (filename: string) => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, "");
  return `${withoutExtension || "image"}-edited.jpg`;
};

const toGeneratedFilename = (filename: string) => {
  const withoutExtension = filename.replace(/\.[^/.]+$/, "");
  return `${withoutExtension || "image"}-generated-background.png`;
};

export function ImageEditDialog({
  media,
  onApply,
  onOpenChange,
  open,
}: ImageEditDialogProps) {
  const isOnline = useNetworkStatus();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragPointRef = useRef<null | { x: number; y: number }>(null);

  const [generatedBackground, setGeneratedBackground] =
    useState<GeneratedBackground | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<null | string>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);
  const [mode, setMode] = useState<CropMode>("cover");
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  const mediaUrl = media?.url ?? null;

  const clearGeneratedBackground = useCallback(() => {
    setGeneratedBackground(null);
  }, []);

  const resetEdits = useCallback(
    (nextMode: CropMode = "cover") => {
      setMode(nextMode);
      setOffset({ x: 0, y: 0 });
      setRotation(0);
      setZoom(1);
      clearGeneratedBackground();
    },
    [clearGeneratedBackground],
  );

  const switchMode = (nextMode: CropMode) => {
    setMode(nextMode);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
    clearGeneratedBackground();
  };

  useEffect(() => {
    if (!open || !mediaUrl) return;

    let cancelled = false;
    const nextImage = new window.Image();

    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (cancelled) return;

      setImage(nextImage);
      setImageError(null);
      resetEdits("cover");
    };

    nextImage.onerror = () => {
      if (cancelled) return;

      setImage(null);
      setImageError(
        "Could not load this image for editing. Try re-uploading it.",
      );
    };

    nextImage.src = mediaUrl;

    return () => {
      cancelled = true;
    };
  }, [mediaUrl, open, resetEdits]);

  useEffect(() => {
    if (!image || !canvasRef.current || generatedBackground) return;

    drawImageToCanvas({
      canvas: canvasRef.current,
      image,
      mode,
      offset,
      outputHeight: PREVIEW_HEIGHT,
      outputWidth: PREVIEW_WIDTH,
      rotation,
      zoom,
    });
  }, [generatedBackground, image, mode, offset, rotation, zoom]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (generatedBackground) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (generatedBackground) return;
    if (!dragPointRef.current || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const dx =
      ((event.clientX - dragPointRef.current.x) / rect.width) * PREVIEW_WIDTH;
    const dy =
      ((event.clientY - dragPointRef.current.y) / rect.height) * PREVIEW_HEIGHT;

    dragPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    setOffset((current) => ({
      x: current.x + dx,
      y: current.y + dy,
    }));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragPointRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragPointRef.current = null;
  };

  const exportCurrentCanvasAndMask = async () => {
    if (!image) {
      throw new Error("No image loaded.");
    }

    const imageCanvas = document.createElement("canvas");
    const maskCanvas = document.createElement("canvas");
    const outputScale = OUTPUT_WIDTH / PREVIEW_WIDTH;

    drawImageToCanvas({
      canvas: imageCanvas,
      image,
      mode,
      offset: {
        x: offset.x * outputScale,
        y: offset.y * outputScale,
      },
      outputHeight: OUTPUT_HEIGHT,
      outputWidth: OUTPUT_WIDTH,
      rotation,
      zoom,
    });

    drawMaskToCanvas({
      canvas: maskCanvas,
      image,
      mode,
      offset: {
        x: offset.x * outputScale,
        y: offset.y * outputScale,
      },
      outputHeight: OUTPUT_HEIGHT,
      outputWidth: OUTPUT_WIDTH,
      rotation,
      zoom,
    });

    const [imageBlob, maskBlob] = await Promise.all([
      canvasToBlob(imageCanvas, "image/png"),
      canvasToBlob(maskCanvas, "image/png"),
    ]);

    const [imageDataUrl, maskDataUrl] = await Promise.all([
      blobToDataUrl(imageBlob),
      blobToDataUrl(maskBlob),
    ]);

    return {
      imageDataUrl,
      maskDataUrl,
    };
  };

  const handleGenerateBackground = async () => {
    if (!isOnline) {
      toast.info("You’re offline. AI background generation needs internet.");
      return;
    }

    if (!image || !media) return;

    setIsGeneratingBackground(true);
    setImageError(null);

    try {
      const { imageDataUrl, maskDataUrl } = await exportCurrentCanvasAndMask();

      const response = await fetch("/api/v2/image-tools/fill-background", {
        body: JSON.stringify({
          imageDataUrl,
          maskDataUrl,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await response.json()) as {
        imageDataUrl?: string;
        message?: string;
      };

      if (!response.ok || !data.imageDataUrl) {
        throw new Error(
          data.message || "Could not generate the image background.",
        );
      }

      const generatedFile = await dataUrlToFile(
        data.imageDataUrl,
        toGeneratedFilename(media.filename),
      );

      setGeneratedBackground({
        file: generatedFile,
        previewUrl: data.imageDataUrl,
      });
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Could not generate the image background.",
      );
    } finally {
      setIsGeneratingBackground(false);
    }
  };

  const handleApply = async () => {
    if (!image || !media) return;

    setIsApplying(true);

    try {
      if (generatedBackground) {
        await onApply(media, generatedBackground.file);
        onOpenChange(false);
        return;
      }

      const outputCanvas = document.createElement("canvas");
      const outputScale = OUTPUT_WIDTH / PREVIEW_WIDTH;

      drawImageToCanvas({
        canvas: outputCanvas,
        image,
        mode,
        offset: {
          x: offset.x * outputScale,
          y: offset.y * outputScale,
        },
        outputHeight: OUTPUT_HEIGHT,
        outputWidth: OUTPUT_WIDTH,
        rotation,
        zoom,
      });

      const blob = await canvasToBlob(outputCanvas, "image/jpeg", 0.92);
      const editedFile = new File([blob], toEditedFilename(media.filename), {
        type: "image/jpeg",
      });

      await onApply(media, editedFile);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  const modeDescription =
    mode === "cover"
      ? "Fill frame keeps the 4:5 product-card shape full, but it may crop edges."
      : "Fit full image keeps the whole photo visible and adds white space if needed.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit product image crop</DialogTitle>
          <DialogDescription>
            Adjust the image for the 4:5 product-card frame. Generate background
            only fills the empty outer space; it should not alter the saree.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex justify-center rounded-lg border bg-muted/30 p-4">
            {imageError ? (
              <div className="flex aspect-4/5 w-full max-w-md items-center justify-center rounded-md border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
                {imageError}
              </div>
            ) : generatedBackground ? (
              <div className="relative aspect-4/5 w-full max-w-md overflow-hidden rounded-md border bg-background">
                <Image
                  alt="Generated background preview"
                  src={generatedBackground.previewUrl}
                  fill
                  sizes="480px"
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                aria-label="Editable 4:5 crop preview"
                className="aspect-4/5 w-full max-w-md cursor-grab touch-none rounded-md border bg-background active:cursor-grabbing"
                height={PREVIEW_HEIGHT}
                onPointerCancel={handlePointerEnd}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                width={PREVIEW_WIDTH}
              />
            )}
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Crop mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={!image || isApplying || isGeneratingBackground}
                  onClick={() => switchMode("cover")}
                  type="button"
                  variant={mode === "cover" ? "default" : "outline"}
                >
                  Fill frame
                </Button>
                <Button
                  disabled={!image || isApplying || isGeneratingBackground}
                  onClick={() => switchMode("contain")}
                  type="button"
                  variant={mode === "contain" ? "default" : "outline"}
                >
                  Fit full image
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{modeDescription}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image-edit-zoom">Zoom</Label>
              <input
                id="image-edit-zoom"
                className="w-full accent-primary"
                disabled={
                  !image ||
                  isApplying ||
                  isGeneratingBackground ||
                  Boolean(generatedBackground)
                }
                max="3"
                min="1"
                onChange={(event) => {
                  clearGeneratedBackground();
                  setZoom(Number(event.target.value));
                }}
                step="0.05"
                type="range"
                value={zoom}
              />
              <div className="text-xs text-muted-foreground">
                {Math.round(zoom * 100)}%
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                className="gap-1.5"
                disabled={
                  !image ||
                  isApplying ||
                  isGeneratingBackground ||
                  Boolean(generatedBackground)
                }
                onClick={() => {
                  clearGeneratedBackground();
                  setRotation((value) => value - 90);
                }}
                type="button"
                variant="outline"
              >
                <RotateCcw className="h-4 w-4" />
                Left
              </Button>
              <Button
                className="gap-1.5"
                disabled={
                  !image ||
                  isApplying ||
                  isGeneratingBackground ||
                  Boolean(generatedBackground)
                }
                onClick={() => {
                  clearGeneratedBackground();
                  setRotation((value) => value + 90);
                }}
                type="button"
                variant="outline"
              >
                <RotateCw className="h-4 w-4" />
                Right
              </Button>
            </div>

            <Button
              disabled={
                !image ||
                isApplying ||
                isGeneratingBackground ||
                Boolean(generatedBackground)
              }
              onClick={() => resetEdits(mode)}
              type="button"
              variant="ghost"
              className="w-full"
            >
              Reset adjustments
            </Button>

            <Button
              className="w-full gap-1.5"
              disabled={
                !isOnline || !image || isApplying || isGeneratingBackground
              }
              onClick={handleGenerateBackground}
              type="button"
              variant={generatedBackground ? "secondary" : "outline"}
            >
              {!isOnline ? (
                <>
                  <WifiOff className="h-4 w-4" />
                  Offline
                </>
              ) : isGeneratingBackground ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <WandSparkles className="h-4 w-4" />
                  Generate background
                </>
              )}
            </Button>

            {!isOnline ? (
              <p className="text-xs text-orange-600">
                AI background generation is unavailable offline. Crop edits
                still work and can be saved locally.
              </p>
            ) : null}

            {generatedBackground ? (
              <Button
                className="w-full"
                disabled={isApplying || isGeneratingBackground}
                onClick={clearGeneratedBackground}
                type="button"
                variant="ghost"
              >
                Discard generated background
              </Button>
            ) : null}

            <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
              Generate background is meant only for empty white space around a
              fitted image. Review the preview before applying.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isApplying || isGeneratingBackground}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!image || isApplying || isGeneratingBackground}
            onClick={handleApply}
          >
            {isApplying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : generatedBackground ? (
              "Use generated image"
            ) : (
              "Apply crop"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
