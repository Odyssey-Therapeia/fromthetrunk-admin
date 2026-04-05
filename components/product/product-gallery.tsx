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
  const [selectedImage, setSelectedImage] = useState(galleryImages[0] ?? "");
  const activeImage = galleryImages.includes(selectedImage)
    ? selectedImage
    : (galleryImages[0] ?? "");

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
    <div className="space-y-3 lg:sticky lg:top-28 lg:space-y-4">
      <div className="relative flex items-center justify-center max-h-[44vh] overflow-hidden rounded-2xl bg-card sm:max-h-[50vh] lg:max-h-[70vh] lg:rounded-3xl">
        <Image
          src={activeImage}
          alt={alt}
          width={800}
          height={1000}
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="h-auto max-h-[44vh] w-full object-cover sm:max-h-[50vh] lg:max-h-[70vh] lg:w-auto lg:object-contain"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:gap-3">
        {galleryImages.map((image, index) => (
          <button
            key={image}
            type="button"
            onClick={() => setSelectedImage(image)}
            className={cn(
              "relative h-16 w-14 shrink-0 overflow-hidden rounded-xl border border-transparent transition lg:h-20 lg:w-16 lg:rounded-2xl",
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
