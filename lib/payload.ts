import { getPayload } from "payload";

import config from "@/payload.config";
import { importMap } from "@/payload/importMap";

export const getPayloadClient = () => getPayload({ config, importMap });

export const resolveMediaURL = (media: any): string | null => {
  if (!media) return null;
  if (typeof media === "string") {
    if (media.startsWith("http") || media.startsWith("/")) {
      return media;
    }
    return null;
  }
  if (media.url) return media.url as string;
  if (media.filename && media.sizes?.card?.url) return media.sizes.card.url as string;
  return null;
};
