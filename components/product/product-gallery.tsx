"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  alt: string;
}

export function ProductGallery({ images, alt }: ProductGalleryProps) {
  const [activeImage, setActiveImage] = useState(images[0]);

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-card">
        <Image
          src={activeImage}
          alt={alt}
          fill
          className="object-cover"
        />
      </div>
      <div className="flex gap-3">
        {images.map((image) => (
          <button
            key={image}
            type="button"
            onClick={() => setActiveImage(image)}
            className={cn(
              "relative h-20 w-16 overflow-hidden rounded-2xl border border-transparent transition",
              activeImage === image && "border-trunk-gold"
            )}
          >
            <Image src={image} alt={alt} fill className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
