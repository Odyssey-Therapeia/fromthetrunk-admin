/**
 * P6-06: tests/unit/media-upload-enforcement.test.ts
 *
 * Mutation-proven enforcement tests for the media upload pipeline.
 *
 * Cases covered:
 *  1. createMediaFromUpload REJECTS missing alt (throws / returns error)
 *  2. createMediaFromUpload AUTO-COMPRESSES a >=1MB image (sharp is called)
 *  3. createMediaFromUpload passes through < 1MB images without compression
 *  4. completeUploadSchema rejects missing alt at the Zod layer
 *  5. completeUploadSchema rejects empty-string alt
 *
 * Mock boundary:
 *  - @/db/queries/media (createMediaRecord)  — DB layer
 *  - sharp                                    — image lib boundary
 *  - @vercel/blob (put)                       — Blob client boundary
 *  - global fetch                             — HTTP client boundary
 *    (production fetches the blob URL server-side for compression; tests
 *     return a fake buffer via a mocked fetch so no real HTTP calls are made)
 *
 * The REAL createMediaFromUpload and completeUploadSchema are under test.
 * Removing the alt check or size-gate causes the mutation-proof tests to fail.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must precede any import touching the mocked modules
// ---------------------------------------------------------------------------

const createMediaRecordMock = vi.hoisted(() => vi.fn());
const sharpMock = vi.hoisted(() => {
  const instance = {
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue({
      data: Buffer.from("compressed-image-data"),
      info: { width: 800, height: 1000, size: 400_000 },
    }),
  };
  return vi.fn(() => instance);
});

const putMock = vi.hoisted(() => vi.fn());
const generateClientTokenMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("mock-token")
);

vi.mock("@/db/queries/media", () => ({
  createMediaRecord: createMediaRecordMock,
}));

vi.mock("sharp", () => ({
  default: sharpMock,
}));

vi.mock("@vercel/blob", () => ({
  put: putMock,
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

/** Fake ArrayBuffer returned by the mocked fetch (simulates blob bytes). */
const fakeArrayBuffer = Buffer.from("fake-image-bytes").buffer;

/** Create a fake fetch response with an ok status and ArrayBuffer body. */
function makeFakeFetchResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: vi.fn().mockResolvedValue(fakeArrayBuffer),
  };
}

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
// 2. Auto-compression — >=1MB images MUST be compressed via sharp
//
// Architecture: the client PUT the file to Blob, then POSTs JSON to /complete.
// The server has no raw buffer — it uses fetch() to read back the Blob URL,
// then runs sharp to compress. We mock the global fetch so no real HTTP calls
// are made, and verify that sharp is invoked only when size >= 1MB.
// ---------------------------------------------------------------------------

describe("createMediaFromUpload — auto-compression for >=1MB uploads", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createMediaRecordMock.mockResolvedValue({
      id: "uuid-456",
      alt: "Compressed saree image",
      filename: "large-saree.jpg",
      url: "https://blob.example.com/media/456-large-saree.webp",
      key: "media/456-large-saree.webp",
      mimeType: "image/webp",
      filesize: 400_000,
      width: 800,
      height: 1000,
      blurDataUrl: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    putMock.mockResolvedValue({
      url: "https://blob.example.com/media/456-large-saree.webp",
      pathname: "media/456-large-saree.webp",
    });
    // Mock global fetch — the compression path calls fetch(input.url) to get
    // the original blob bytes before running sharp.
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      makeFakeFetchResponse() as unknown as Response
    );
  });

  it("calls sharp when the upload size equals exactly 1MB", async () => {
    sharpMock.mockClear();
    await createMediaFromUpload(
      makeInput({
        alt: "Exactly 1MB image",
        size: ONE_MB,
      })
    );
    expect(sharpMock).toHaveBeenCalled();
  });

  it("calls sharp when the upload size exceeds 1MB", async () => {
    sharpMock.mockClear();
    await createMediaFromUpload(
      makeInput({
        alt: "Large saree image",
        size: ONE_MB + 1,
      })
    );
    expect(sharpMock).toHaveBeenCalled();
  });

  it("does NOT call sharp when the upload size is under 1MB", async () => {
    sharpMock.mockClear();
    await createMediaFromUpload(
      makeInput({
        alt: "Small saree image",
        size: 500_000,
      })
    );
    expect(sharpMock).not.toHaveBeenCalled();
  });

  // MUTATION PROOF: if the size-gate were removed (always compress), fetch
  // would be called for small files too. This proves the gate is load-bearing.
  it("mutation-proof: fetch (blob read) is called ONLY for large files", async () => {
    fetchSpy.mockClear();

    // Large file → should call fetch to read the blob
    await createMediaFromUpload(
      makeInput({ alt: "Large file", size: 5 * ONE_MB })
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("https://blob.example.com/media/123-saree.jpg");

    fetchSpy.mockClear();

    // Small file → must NOT call fetch
    await createMediaFromUpload(
      makeInput({ alt: "Small file", size: 100_000 })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // MUTATION PROOF: removing compression for large files fails this test
  it("mutation-proof: compression IS applied for large files (no bypass)", async () => {
    sharpMock.mockClear();
    await createMediaFromUpload(
      makeInput({
        alt: "Very large saree image",
        size: 5 * ONE_MB,
      })
    );
    expect(sharpMock).toHaveBeenCalledTimes(1);
    const sharpInstance = sharpMock.mock.results[0]?.value;
    expect(sharpInstance?.webp).toHaveBeenCalled();
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
