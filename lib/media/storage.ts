/**
 * Media storage configuration.
 *
 * In development: files are stored locally in public/media
 * In production: configure S3-compatible storage via env vars
 *
 * To enable cloud storage in production:
 * 1. Install: npm install @payloadcms/storage-s3
 * 2. Set the following env vars:
 *    - S3_BUCKET
 *    - S3_REGION
 *    - S3_ACCESS_KEY_ID
 *    - S3_SECRET_ACCESS_KEY
 *    - S3_ENDPOINT (optional, for R2/MinIO)
 * 3. Uncomment the S3 storage plugin in payload.config.ts
 *
 * This file exports the configuration needed by payload.config.ts.
 */

export const isCloudStorageEnabled = Boolean(
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY
);

export const s3Config = {
  bucket: process.env.S3_BUCKET ?? "",
  region: process.env.S3_REGION ?? "ap-south-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
};
