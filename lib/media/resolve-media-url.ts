export const resolveMediaURL = (media: unknown): string | null => {
  if (!media) return null;

  if (typeof media === "string") {
    if (media.startsWith("http") || media.startsWith("/")) {
      return media;
    }

    return null;
  }

  if (typeof media === "object") {
    const mediaRecord = media as {
      filename?: string;
      sizes?: { card?: { url?: string } };
      url?: string;
    };

    if (typeof mediaRecord.url === "string") {
      return mediaRecord.url;
    }

    if (
      typeof mediaRecord.filename === "string" &&
      typeof mediaRecord.sizes?.card?.url === "string"
    ) {
      return mediaRecord.sizes.card.url;
    }
  }

  return null;
};
