import path from "path";

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

import { createMediaRecord } from "@/db/queries/media";

type UploadUrlInput = {
  contentType: string;
  filename: string;
};

export type CreateMediaFromUploadInput = {
  /** Alt text is REQUIRED — uploads without alt are rejected. */
  alt: string;
  filename: string;
  mimeType?: string;
  pathname: string;
  size?: number;
  url: string;
};

const toSafeBasename = (filename: string) => {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "upload"}${ext.toLowerCase()}`;
};

export const generateUploadUrl = async (input: UploadUrlInput) => {
  const safeFilename = toSafeBasename(input.filename);
  const pathname = `media/${Date.now()}-${safeFilename}`;

  const clientToken = await generateClientTokenFromReadWriteToken({
    addRandomSuffix: false,
    allowedContentTypes: [input.contentType],
    pathname,
  });

  return {
    clientToken,
    pathname,
  };
};

/**
 * Creates a media record after enforcing alt text.
 *
 * Important:
 * The browser has already uploaded the original file directly to Vercel Blob.
 * This function only persists that uploaded Blob URL into the media table.
 *
 * We intentionally do not compress/re-upload here, because that created a second
 * WebP file and made the DB point to the compressed copy while leaving the
 * original upload orphaned in Blob storage.
 */
export const createMediaFromUpload = async (
  input: CreateMediaFromUploadInput,
) => {
  if (!input.alt || input.alt.trim().length === 0) {
    throw new Error(
      "Alt text is required for accessibility. Provide a descriptive alt for every media upload.",
    );
  }

  const record = await createMediaRecord({
    alt: input.alt,
    blurDataUrl: null,
    filename: input.filename,
    filesize: input.size ?? null,
    height: null,
    key: input.pathname,
    metadata: {
      source: "vercel-blob",
    },
    mimeType: input.mimeType ?? null,
    url: input.url,
    width: null,
  });

  return record;
};
