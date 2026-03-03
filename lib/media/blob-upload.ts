import path from "path";

import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

import { createMediaRecord } from "@/db/queries/media";

type UploadUrlInput = {
  contentType: string;
  filename: string;
};

type CreateMediaFromUploadInput = {
  alt?: string;
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

export const createMediaFromUpload = async (input: CreateMediaFromUploadInput) => {
  const record = await createMediaRecord({
    alt: input.alt ?? null,
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
