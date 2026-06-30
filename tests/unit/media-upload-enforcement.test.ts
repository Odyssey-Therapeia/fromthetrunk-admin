/**
 * P6-06: tests/unit/media-upload-enforcement.test.ts
 *
 * Mutation-proven enforcement tests for the media upload pipeline.
 *
 * Cases covered:
 *  1. createMediaFromUpload REJECTS missing alt (throws / returns error)
 *  2. createMediaFromUpload persists the uploaded Blob URL without server-side re-compression
 *  3. createMediaFromUpload does not fetch/re-upload uploaded Blob files
 *  4. completeUploadSchema rejects missing alt at the Zod layer
 *  5. completeUploadSchema rejects empty-string alt
 *
 * Mock boundary:
 *  - @/db/queries/media (createMediaRecord)  — DB layer
 *  - global fetch                             — HTTP client boundary
 *    (must NOT be called from createMediaFromUpload; the browser already
 *     uploaded the original file directly to Blob)
 *
 * The REAL createMediaFromUpload and completeUploadSchema are under test.
 * Removing the alt check or size-gate causes the mutation-proof tests to fail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must precede any import touching the mocked modules
// ---------------------------------------------------------------------------

const createMediaRecordMock = vi.hoisted(() => vi.fn());
const generateClientTokenMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("mock-token")
);

vi.mock("@/db/queries/media", () => ({
  createMediaRecord: createMediaRecordMock,
}));

vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: generateClientTokenMock,
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks are wired)
// ---------------------------------------------------------------------------

import { createMediaFromUpload } from "@/lib/media/blob-upload";
import { completeUploadSchema } from "@/api/hono/routes/media";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ONE_MB = 1_024 * 1_024;

function makeInput(overrides: Partial<Parameters<typeof createMediaFromUpload>[0]> = {}) {
  return {
    alt: "A beautiful Banarasi saree with gold zari work",
    filename: "saree.jpg",
    mimeType: "image/jpeg",
    pathname: "media/123-saree.jpg",
    url: "https://blob.example.com/media/123-saree.jpg",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. alt enforcement — missing alt must be REJECTED
// ---------------------------------------------------------------------------

describe("createMediaFromUpload — alt enforcement", () => {
  beforeEach(() => {
    createMediaRecordMock.mockResolvedValue({
      id: "uuid-123",
      alt: "A beautiful Banarasi saree with gold zari work",
      filename: "saree.jpg",
      url: "https://blob.example.com/media/123-saree.jpg",
      key: "media/123-saree.jpg",
      mimeType: "image/jpeg",
      filesize: null,
      width: null,
      height: null,
      blurDataUrl: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("rejects an upload with missing alt text", async () => {
    await expect(
      createMediaFromUpload(makeInput({ alt: undefined as unknown as string }))
    ).rejects.toThrow();
  });

  it("rejects an upload with empty-string alt text", async () => {
    await expect(
      createMediaFromUpload(makeInput({ alt: "" }))
    ).rejects.toThrow();
  });

  it("rejects an upload with whitespace-only alt text", async () => {
    await expect(
      createMediaFromUpload(makeInput({ alt: "   " }))
    ).rejects.toThrow();
  });

  it("accepts an upload with valid alt text", async () => {
    await expect(
      createMediaFromUpload(makeInput({ alt: "A beautiful Banarasi saree", size: 500_000 }))
    ).resolves.toBeDefined();
  });

  // MUTATION PROOF: removing the alt check would cause this test to pass without the throw
  it("mutation-proof: createMediaRecord is NOT called when alt is missing", async () => {
    createMediaRecordMock.mockClear();
    await expect(
      createMediaFromUpload(makeInput({ alt: undefined as unknown as string }))
    ).rejects.toThrow();
    expect(createMediaRecordMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Uploaded Blob persistence — no server-side re-compression/re-upload
//
// Architecture: the client uploads the original file directly to Vercel Blob,
// then POSTs JSON to /complete. createMediaFromUpload should only persist the
// already-uploaded Blob URL/pathname into the media table.
//
// Regression guard: do NOT fetch the Blob URL server-side and do NOT create a
// second compressed WebP, because that can orphan the original upload.
// ---------------------------------------------------------------------------

describe("createMediaFromUpload — uploaded Blob persistence", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createMediaRecordMock.mockResolvedValue({
      id: "uuid-456",
      alt: "A beautiful Banarasi saree with gold zari work",
      filename: "saree.jpg",
      url: "https://blob.example.com/media/123-saree.jpg",
      key: "media/123-saree.jpg",
      mimeType: "image/jpeg",
      filesize: null,
      width: null,
      height: null,
      blurDataUrl: null,
      metadata: { source: "vercel-blob" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("createMediaFromUpload must not fetch uploaded blobs"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("persists the original uploaded Blob URL when upload size equals exactly 1MB", async () => {
    await createMediaFromUpload(
      makeInput({
        alt: "Exactly 1MB image",
        size: ONE_MB,
      })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createMediaRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alt: "Exactly 1MB image",
        filename: "saree.jpg",
        filesize: ONE_MB,
        key: "media/123-saree.jpg",
        metadata: { source: "vercel-blob" },
        mimeType: "image/jpeg",
        url: "https://blob.example.com/media/123-saree.jpg",
        width: null,
        height: null,
        blurDataUrl: null,
      })
    );
  });

  it("persists the original uploaded Blob URL when upload size exceeds 1MB", async () => {
    await createMediaFromUpload(
      makeInput({
        alt: "Large saree image",
        size: ONE_MB + 1,
      })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createMediaRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alt: "Large saree image",
        filesize: ONE_MB + 1,
        key: "media/123-saree.jpg",
        mimeType: "image/jpeg",
        url: "https://blob.example.com/media/123-saree.jpg",
      })
    );
  });

  it("persists the original uploaded Blob URL when upload size is under 1MB", async () => {
    await createMediaFromUpload(
      makeInput({
        alt: "Small saree image",
        size: 500_000,
      })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createMediaRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alt: "Small saree image",
        filesize: 500_000,
        key: "media/123-saree.jpg",
        mimeType: "image/jpeg",
        url: "https://blob.example.com/media/123-saree.jpg",
      })
    );
  });

  it("mutation-proof: never fetches uploaded Blob bytes for any upload size", async () => {
    await createMediaFromUpload(makeInput({ alt: "Large file", size: 5 * ONE_MB }));
    await createMediaFromUpload(makeInput({ alt: "Small file", size: 100_000 }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. completeUploadSchema — Zod-layer alt enforcement
// ---------------------------------------------------------------------------

describe("completeUploadSchema — alt enforcement at Zod layer", () => {
  it("rejects a payload with no alt field", () => {
    const result = completeUploadSchema.safeParse({
      filename: "saree.jpg",
      pathname: "media/123-saree.jpg",
      url: "https://blob.example.com/media/123-saree.jpg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a payload with empty alt", () => {
    const result = completeUploadSchema.safeParse({
      alt: "",
      filename: "saree.jpg",
      pathname: "media/123-saree.jpg",
      url: "https://blob.example.com/media/123-saree.jpg",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a payload with valid alt", () => {
    const result = completeUploadSchema.safeParse({
      alt: "Gold zari Kanjivaram saree",
      filename: "saree.jpg",
      pathname: "media/123-saree.jpg",
      url: "https://blob.example.com/media/123-saree.jpg",
    });
    expect(result.success).toBe(true);
  });

  // MUTATION PROOF: changing alt from required to optional fails this test
  it("mutation-proof: alt is required, not optional", () => {
    const withoutAlt = completeUploadSchema.safeParse({
      filename: "test.jpg",
      pathname: "media/test.jpg",
      url: "https://blob.example.com/media/test.jpg",
    });
    expect(withoutAlt.success).toBe(false);
    if (!withoutAlt.success) {
      const altError = withoutAlt.error.issues.find(
        (issue) => issue.path.includes("alt") || issue.path.length === 0
      );
      expect(altError).toBeDefined();
    }
  });
});
