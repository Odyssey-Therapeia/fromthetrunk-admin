import path from "path";

import { put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import sharp from "sharp";

import { createMediaRecord } from "@/db/queries/media";

/**
 * 1MB threshold: uploads at or above this size are auto-compressed to WebP
 * before the Blob record is persisted.
 */
const COMPRESS_THRESHOLD_BYTES = 1_024 * 1_024;

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
 * Creates a media record after enforcing:
 *  1. Alt text presence — rejects uploads with missing or blank alt.
 *  2. Auto-compression — images >=1MB are fetched from Blob, downscaled +
 *     re-encoded to WebP, and stored back to Blob before the record is persisted.
 *     The client PUT the file directly to Vercel Blob first; the server then
 *     fetches that Blob URL, runs sharp, and re-stores the WebP version.
 *     No raw buffer needs to be POSTed by the client.
 */
export const createMediaFromUpload = async (input: CreateMediaFromUploadInput) => {
  // ── 1. Alt enforcement ──────────────────────────────────────────────────
  if (!input.alt || input.alt.trim().length === 0) {
    throw new Error(
      "Alt text is required for accessibility. Provide a descriptive alt for every media upload."
    );
  }

  // ── 2. Compression for large images ─────────────────────────────────────
  let finalUrl = input.url;
  let finalPathname = input.pathname;
  let finalMimeType = input.mimeType ?? null;
  let finalFilesize = input.size ?? null;
  let finalWidth: number | null = null;
  let finalHeight: number | null = null;

  if (input.size !== undefined && input.size >= COMPRESS_THRESHOLD_BYTES) {
    // Fetch the just-uploaded original from Blob and compress server-side.
    const response = await fetch(input.url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch blob for compression: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    const { data: compressedData, info } = await sharp(rawBuffer)
      .resize({ fit: "inside", withoutEnlargement: true, width: 2400 })
      .webp({ effort: 4, quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const safeBase = toSafeBasename(input.filename).replace(/\.[^.]+$/, "");
    const compressedPathname = `media/${Date.now()}-${safeBase}.webp`;

    const blob = await put(compressedPathname, compressedData, {
      access: "public",
      contentType: "image/webp",
    });

    finalUrl = blob.url;
    finalPathname = compressedPathname;
    finalMimeType = "image/webp";
    finalFilesize = info.size;
    finalWidth = info.width;
    finalHeight = info.height;
  }

  // ── 3. Persist media record ──────────────────────────────────────────────
  const record = await createMediaRecord({
    alt: input.alt,
    blurDataUrl: null,
    filename: input.filename,
    filesize: finalFilesize,
    height: finalHeight,
    key: finalPathname,
    metadata: {
      source: "vercel-blob",
    },
    mimeType: finalMimeType,
    url: finalUrl,
    width: finalWidth,
  });

  return record;
};
