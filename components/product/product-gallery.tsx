"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  alt: string;
}

export function ProductGallery({ images, alt }: ProductGalleryProps) {
  const galleryImages = useMemo(() => images.filter(Boolean), [images]);
  const [activeImage, setActiveImage] = useState(galleryImages[0] ?? "");

  if (galleryImages.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex aspect-[4/5] items-center justify-center rounded-3xl bg-card text-xs uppercase tracking-[0.2em] text-muted-foreground">
          No image available
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-card">
        <Image src={activeImage} alt={alt} fill className="object-cover" />
      </div>
      <div className="flex gap-3">
        {galleryImages.map((image, index) => (
          <button
            key={image}
            type="button"
            onClick={() => setActiveImage(image)}
            className={cn(
              "relative h-20 w-16 overflow-hidden rounded-2xl border border-transparent transition",
              activeImage === image && "border-trunk-gold"
            )}
            aria-label={`View image ${index + 1} of ${galleryImages.length}`}
            aria-pressed={activeImage === image}
            title={`View image ${index + 1} of ${galleryImages.length}`}
          >
            <Image src={image} alt={alt} fill className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
