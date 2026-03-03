export const resolveMediaURL = (media: unknown): string | null => {
  if (!media) return null;

  if (typeof media === "string") {
    if (
      media.startsWith("http://") ||
      media.startsWith("https://") ||
      media.startsWith("/")
    ) {
      return media;
    }

    if (media.startsWith("media/")) {
      return `/${media}`;
    }

    return null;
  }

  if (typeof media === "object") {
    const mediaRecord = media as {
      filename?: string;
      pathname?: string;
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

    if (typeof mediaRecord.pathname === "string") {
      if (mediaRecord.pathname.startsWith("http")) {
        return mediaRecord.pathname;
      }

      return mediaRecord.pathname.startsWith("/")
        ? mediaRecord.pathname
        : `/${mediaRecord.pathname}`;
    }
  }

  return null;
};
