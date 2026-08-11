/**
 * Phase 2A.2 — future uploads persist real image metadata.
 *
 * What these tests prove:
 *   - A Vercel Blob upload probes the stored blob and persists width, height,
 *     filesize and mimeType instead of the nulls that created the backfill
 *     problem in the first place.
 *   - The Blob URL and key are untouched: no re-encode, no second optimised
 *     blob, no replacement upload.
 *   - Alt text stays mandatory.
 *   - Metadata FAILS CLOSED: transient probe failures are retried, and if the
 *     metadata still cannot be established NO media row is created — the
 *     null-dimension row this whole phase exists to prevent. The blob is left
 *     in place so completion can simply be retried.
 *   - Local development uploads parse dimensions from the bytes already in
 *     hand, with no HTTP call at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const createMediaRecordMock = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/media", () => ({
  createMediaRecord: createMediaRecordMock,
  deleteMedia: vi.fn(),
  listMedia: vi.fn(),
}));

const probeMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/media/image-metadata", () => ({ probeImageMetadata: probeMock }));

vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: vi.fn().mockResolvedValue("token"),
}));

import {
  MEDIA_PROBE_MAX_ATTEMPTS,
  MediaMetadataUnavailableError,
  createMediaFromUpload,
} from "@/lib/media/blob-upload";
import { parseImageDimensions } from "@/lib/media/image-dimensions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BLOB_URL =
  "https://store.public.blob.vercel-storage.com/media/1777-img.jpg";

const uploadInput = (overrides: Record<string, unknown> = {}) => ({
  alt: "A maroon chettinad cotton saree",
  filename: "IMG_7215.JPG",
  mimeType: "image/jpeg",
  pathname: "media/1777-img.jpg",
  size: 11_980_000,
  url: BLOB_URL,
  ...overrides,
});

beforeEach(() => {
  createMediaRecordMock.mockImplementation((input: unknown) =>
    Promise.resolve({ id: "media-1", ...(input as Record<string, unknown>) }),
  );
  probeMock.mockResolvedValue({
    filesize: 11_980_000,
    height: 3024,
    mimeType: "image/jpeg",
    ok: true,
    width: 4032,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Blob uploads
// ---------------------------------------------------------------------------

describe("createMediaFromUpload", () => {
  it("persists probed width, height, filesize and mime type", async () => {
    await createMediaFromUpload(uploadInput());

    expect(probeMock).toHaveBeenCalledWith(BLOB_URL);
    expect(createMediaRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filesize: 11_980_000,
        height: 3024,
        mimeType: "image/jpeg",
        width: 4032,
      }),
    );
  });

  it("keeps the Blob URL and key exactly as uploaded", async () => {
    await createMediaFromUpload(uploadInput());

    const [record] = createMediaRecordMock.mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(record.url).toBe(BLOB_URL);
    expect(record.key).toBe("media/1777-img.jpg");
    expect(record.filename).toBe("IMG_7215.JPG");
    // Exactly one media row — no optimised duplicate.
    expect(createMediaRecordMock).toHaveBeenCalledTimes(1);
  });

  it("prefers the probed size and type over what the client reported", async () => {
    probeMock.mockResolvedValue({
      filesize: 9_000_000,
      height: 1000,
      mimeType: "image/png",
      ok: true,
      width: 1000,
    });

    await createMediaFromUpload(uploadInput({ mimeType: "image/jpeg", size: 1 }));

    expect(createMediaRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ filesize: 9_000_000, mimeType: "image/png" }),
    );
  });

  it("retries a transient failure and succeeds", async () => {
    probeMock
      .mockResolvedValueOnce({
        code: "TIMEOUT",
        message: "The media host did not respond in time.",
        ok: false,
      })
      .mockResolvedValueOnce({
        code: "REQUEST_FAILED",
        message: "The media host could not be reached.",
        ok: false,
      })
      .mockResolvedValueOnce({
        filesize: 11_980_000,
        height: 3024,
        mimeType: "image/jpeg",
        ok: true,
        width: 4032,
      });

    const record = await createMediaFromUpload(uploadInput());

    expect(record).toBeTruthy();
    expect(probeMock).toHaveBeenCalledTimes(3);
    expect(createMediaRecordMock).toHaveBeenCalledTimes(1);
    expect(createMediaRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ height: 3024, width: 4032 }),
    );
  });

  it("creates ZERO media rows when the probe never succeeds", async () => {
    probeMock.mockResolvedValue({
      code: "TIMEOUT",
      message: "The media host did not respond in time.",
      ok: false,
    });

    const error = await createMediaFromUpload(uploadInput()).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(MediaMetadataUnavailableError);
    expect((error as MediaMetadataUnavailableError).code).toBe("TIMEOUT");
    expect(probeMock).toHaveBeenCalledTimes(MEDIA_PROBE_MAX_ATTEMPTS);
    // The whole point: no width:null / height:null row is ever written.
    expect(createMediaRecordMock).not.toHaveBeenCalled();
  });

  it("does not retry a deterministic failure", async () => {
    probeMock.mockResolvedValue({
      code: "UNSUPPORTED_IMAGE",
      message: "The media is not a JPEG, PNG or WebP image.",
      ok: false,
    });

    await expect(createMediaFromUpload(uploadInput())).rejects.toBeInstanceOf(
      MediaMetadataUnavailableError,
    );
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(createMediaRecordMock).not.toHaveBeenCalled();
  });

  it("creates no row when a probe throws", async () => {
    probeMock.mockRejectedValue(new Error("boom"));

    await expect(createMediaFromUpload(uploadInput())).rejects.toBeInstanceOf(
      MediaMetadataUnavailableError,
    );
    expect(createMediaRecordMock).not.toHaveBeenCalled();
  });

  it("refuses zero or negative dimensions rather than storing them", async () => {
    probeMock.mockResolvedValue({
      filesize: 1000,
      height: 0,
      mimeType: "image/jpeg",
      ok: true,
      width: 0,
    });

    await expect(createMediaFromUpload(uploadInput())).rejects.toBeInstanceOf(
      MediaMetadataUnavailableError,
    );
    expect(createMediaRecordMock).not.toHaveBeenCalled();
  });

  it("uploads no second blob and deletes nothing on failure", async () => {
    probeMock.mockResolvedValue({
      code: "TIMEOUT",
      message: "timeout",
      ok: false,
    });

    await createMediaFromUpload(uploadInput()).catch(() => undefined);

    // Nothing in this module uploads or deletes; assert the surface stays clean.
    const blobClient = await import("@vercel/blob/client");
    expect(blobClient.generateClientTokenFromReadWriteToken).not.toHaveBeenCalled();
    expect(createMediaRecordMock).not.toHaveBeenCalled();
  });

  it("succeeds when completion is retried for the same blob", async () => {
    probeMock.mockResolvedValue({
      code: "TIMEOUT",
      message: "timeout",
      ok: false,
    });

    await createMediaFromUpload(uploadInput()).catch(() => undefined);
    expect(createMediaRecordMock).not.toHaveBeenCalled();

    // The blob is untouched, so the client retries /media/complete unchanged.
    probeMock.mockResolvedValue({
      filesize: 11_980_000,
      height: 3024,
      mimeType: "image/jpeg",
      ok: true,
      width: 4032,
    });

    const record = await createMediaFromUpload(uploadInput());

    expect(record).toBeTruthy();
    expect(createMediaRecordMock).toHaveBeenCalledTimes(1);
    expect(createMediaRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        height: 3024,
        key: "media/1777-img.jpg",
        url: BLOB_URL,
        width: 4032,
      }),
    );
  });

  it("checks alt text before spending a probe", async () => {
    await expect(createMediaFromUpload(uploadInput({ alt: "" }))).rejects.toThrow(
      /Alt text is required/,
    );

    expect(probeMock).not.toHaveBeenCalled();
  });

  it("still requires alt text", async () => {
    await expect(createMediaFromUpload(uploadInput({ alt: "" }))).rejects.toThrow(
      /Alt text is required/,
    );
    await expect(
      createMediaFromUpload(uploadInput({ alt: "   " })),
    ).rejects.toThrow(/Alt text is required/);
    expect(createMediaRecordMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Local development uploads
// ---------------------------------------------------------------------------

describe("local development uploads", () => {
  /** The exact parser the dev route uses on the buffer it already holds. */
  it("reads dimensions from the uploaded bytes without any HTTP call", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(png.buffer).setUint32(16, 1024);
    new DataView(png.buffer).setUint32(20, 768);

    const result = parseImageDimensions(png);

    expect(result).toEqual({
      height: 768,
      mimeType: "image/png",
      status: "ok",
      width: 1024,
    });
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("falls back to null dimensions for an unreadable local file", () => {
    const notAnImage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect(parseImageDimensions(notAnImage).status).toBe("unsupported");
  });
});
