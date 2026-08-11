/**
 * Phase 2A.2 — bounded image header parser + SSRF-guarded remote probe.
 *
 * What these tests prove:
 *   - JPEG, PNG and WebP dimensions are read from the LEADING BYTES only.
 *   - The probe never downloads the whole asset: the Range window is bounded,
 *     the body stream is cancelled at the cap, and a host that ignores Range
 *     cannot make us buffer a 40 MB file.
 *   - SSRF is closed: only https Vercel Blob hosts, no credentials, no
 *     localhost, no private hosts, and every redirect hop is re-validated.
 *   - Timeouts, malformed images and unsupported formats fail deterministically.
 */

import { describe, expect, it, vi } from "vitest";

import { parseImageDimensions } from "@/lib/media/image-dimensions";
import {
  INITIAL_PROBE_BYTES,
  MAX_PROBE_BYTES,
  isProbeAllowedUrl,
  probeImageMetadata,
} from "@/lib/media/image-metadata";

// ---------------------------------------------------------------------------
// Fixture builders — real header bytes, not mocks
// ---------------------------------------------------------------------------

const ALLOWED = "https://store.public.blob.vercel-storage.com/media/a.jpg";

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

/** JPEG with `padding` bytes of APP1 before the SOF0 segment. */
function jpegBytes(width: number, height: number, padding = 0): Uint8Array {
  const app1 = padding > 0 ? 4 + padding : 0;
  const bytes = new Uint8Array(2 + app1 + 11);
  const view = new DataView(bytes.buffer);

  bytes.set([0xff, 0xd8], 0); // SOI
  let offset = 2;

  if (app1 > 0) {
    bytes.set([0xff, 0xe1], offset); // APP1
    view.setUint16(offset + 2, padding + 2);
    offset += 4 + padding;
  }

  bytes.set([0xff, 0xc0], offset); // SOF0
  view.setUint16(offset + 2, 17);
  bytes[offset + 4] = 8; // precision
  view.setUint16(offset + 5, height);
  view.setUint16(offset + 7, width);

  return bytes;
}

function webpLossyBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  bytes.set([0x9d, 0x01, 0x2a], 23);
  bytes[26] = width & 0xff;
  bytes[27] = (width >> 8) & 0x3f;
  bytes[28] = height & 0xff;
  bytes[29] = (height >> 8) & 0x3f;
  return bytes;
}

function webpExtendedBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return bytes;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe("parseImageDimensions", () => {
  it("reads PNG dimensions", () => {
    expect(parseImageDimensions(pngBytes(1200, 1600))).toEqual({
      height: 1600,
      mimeType: "image/png",
      status: "ok",
      width: 1200,
    });
  });

  it("reads JPEG dimensions", () => {
    expect(parseImageDimensions(jpegBytes(4032, 3024))).toEqual({
      height: 3024,
      mimeType: "image/jpeg",
      status: "ok",
      width: 4032,
    });
  });

  it("walks past a long EXIF segment to the SOF marker", () => {
    expect(parseImageDimensions(jpegBytes(800, 600, 20_000))).toMatchObject({
      height: 600,
      status: "ok",
      width: 800,
    });
  });

  it("reads lossy and extended WebP dimensions", () => {
    expect(parseImageDimensions(webpLossyBytes(640, 480))).toEqual({
      height: 480,
      mimeType: "image/webp",
      status: "ok",
      width: 640,
    });
    expect(parseImageDimensions(webpExtendedBytes(2000, 1500))).toMatchObject({
      height: 1500,
      status: "ok",
      width: 2000,
    });
  });

  it("asks for more bytes when the header is truncated", () => {
    expect(
      parseImageDimensions(jpegBytes(800, 600, 20_000).subarray(0, 4096)),
    ).toEqual({ status: "incomplete" });
    expect(parseImageDimensions(pngBytes(10, 10).subarray(0, 16))).toEqual({
      status: "incomplete",
    });
  });

  it("reports an unsupported format", () => {
    const gif = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00, 0x80, 0x00,
    ]);
    expect(parseImageDimensions(gif)).toEqual({ status: "unsupported" });
  });

  it("reports a malformed container", () => {
    const brokenPng = pngBytes(10, 10);
    brokenPng.set([0x00, 0x00, 0x00, 0x00], 12); // not "IHDR"
    expect(parseImageDimensions(brokenPng)).toEqual({ status: "invalid" });
  });
});

// ---------------------------------------------------------------------------
// SSRF allowlist
// ---------------------------------------------------------------------------

describe("isProbeAllowedUrl", () => {
  it("allows a Vercel Blob public https URL", () => {
    expect(isProbeAllowedUrl(ALLOWED)).toBe(true);
  });

  const blocked = [
    "http://store.public.blob.vercel-storage.com/a.jpg",
    "https://user:pass@store.public.blob.vercel-storage.com/a.jpg",
    "https://localhost/a.jpg",
    "http://localhost:3000/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/a.jpg",
    "https://evil.test/a.jpg",
    "https://public.blob.vercel-storage.com/a.jpg",
    "https://store.public.blob.vercel-storage.com.evil.test/a.jpg",
    "https://evil.test/store.public.blob.vercel-storage.com/a.jpg",
    "ftp://store.public.blob.vercel-storage.com/a.jpg",
    "not-a-url",
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, () => {
      expect(isProbeAllowedUrl(url)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Remote probe
// ---------------------------------------------------------------------------

type FetchCall = { init: RequestInit; url: string };

const streamResponse = (
  bytes: Uint8Array,
  init: ResponseInit & { chunkSize?: number } = {},
): Response => {
  const chunkSize = init.chunkSize ?? bytes.byteLength;
  let offset = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });

  return new Response(stream, init);
};

const makeFetch = (
  handler: (call: FetchCall) => Response | Promise<Response>,
) => {
  const calls: FetchCall[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { init, url: String(url) };
    calls.push(call);
    return handler(call);
  });

  return { calls, impl: impl as unknown as typeof fetch };
};

describe("probeImageMetadata", () => {
  it("reads HEAD content-length then a bounded Range GET", async () => {
    const { calls, impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, {
            headers: { "content-length": "12345678", "content-type": "image/jpeg" },
          })
        : streamResponse(jpegBytes(4032, 3024), { status: 206 }),
    );

    const result = await probeImageMetadata(ALLOWED, { fetchImpl: impl });

    expect(result).toEqual({
      filesize: 12345678,
      height: 3024,
      mimeType: "image/jpeg",
      ok: true,
      width: 4032,
    });
    expect(calls[0].init.method).toBe("HEAD");
    expect(calls[1].init.method).toBe("GET");
    expect(
      (calls[1].init.headers as Record<string, string>).Range,
    ).toBe(`bytes=0-${INITIAL_PROBE_BYTES - 1}`);
  });

  it("falls back to content-range for the file size", async () => {
    const { impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, { status: 405 })
        : streamResponse(pngBytes(800, 800), {
            headers: { "content-range": "bytes 0-65535/9999999" },
            status: 206,
          }),
    );

    const result = await probeImageMetadata(ALLOWED, { fetchImpl: impl });

    expect(result).toMatchObject({ filesize: 9999999, ok: true, width: 800 });
  });

  it("widens the range exactly once when the header needs more bytes", async () => {
    const big = jpegBytes(1024, 768, 100_000);
    const { calls, impl } = makeFetch(({ init }) => {
      if (init.method === "HEAD") {
        return new Response(null, {
          headers: { "content-length": String(big.byteLength) },
        });
      }

      const range = (init.headers as Record<string, string>).Range;
      const end = Number(range.split("-")[1]) + 1;
      return streamResponse(big.subarray(0, end), { status: 206 });
    });

    const result = await probeImageMetadata(ALLOWED, { fetchImpl: impl });
    const ranges = calls
      .filter((call) => call.init.method === "GET")
      .map((call) => (call.init.headers as Record<string, string>).Range);

    expect(result).toMatchObject({ height: 768, ok: true, width: 1024 });
    expect(ranges).toEqual([
      `bytes=0-${INITIAL_PROBE_BYTES - 1}`,
      `bytes=0-${MAX_PROBE_BYTES - 1}`,
    ]);
  });

  it("never buffers more than the cap when the host ignores Range", async () => {
    // 40 MB of a PNG whose header is at the front — the stream must be cut off.
    const huge = new Uint8Array(40 * 1024 * 1024);
    huge.set(pngBytes(3000, 2000), 0);

    let delivered = 0;
    const { impl } = makeFetch(({ init }) => {
      if (init.method === "HEAD") return new Response(null, { status: 405 });

      let offset = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= huge.byteLength) {
            controller.close();
            return;
          }
          const chunk = huge.subarray(offset, offset + 16 * 1024);
          delivered += chunk.byteLength;
          offset += chunk.byteLength;
          controller.enqueue(chunk);
        },
      });

      return new Response(stream, { status: 200 });
    });

    const result = await probeImageMetadata(ALLOWED, { fetchImpl: impl });

    expect(result).toMatchObject({ ok: true, width: 3000 });
    expect(delivered).toBeLessThanOrEqual(INITIAL_PROBE_BYTES + 16 * 1024);
    expect(delivered).toBeLessThan(huge.byteLength);
  });

  it("refuses a response that declares more than the cap without a stream", async () => {
    const { impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, { status: 405 })
        : new Response(null, {
            headers: { "content-length": String(50 * 1024 * 1024) },
            status: 200,
          }),
    );

    const result = await probeImageMetadata(ALLOWED, { fetchImpl: impl });

    expect(result).toMatchObject({ code: "RESPONSE_TOO_LARGE", ok: false });
  });

  it("refuses a disallowed host without any request", async () => {
    const { calls, impl } = makeFetch(() => new Response(null));

    const result = await probeImageMetadata("https://evil.test/a.jpg", {
      fetchImpl: impl,
    });

    expect(result).toEqual({
      code: "URL_NOT_ALLOWED",
      message: "The URL is not an allowed media host.",
      ok: false,
    });
    expect(calls).toHaveLength(0);
  });

  it("refuses a redirect to a disallowed host", async () => {
    const { impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, { status: 405 })
        : new Response(null, {
            headers: { location: "https://evil.test/a.jpg" },
            status: 302,
          }),
    );

    const result = await probeImageMetadata(ALLOWED, { fetchImpl: impl });

    expect(result).toMatchObject({ code: "URL_NOT_ALLOWED", ok: false });
  });

  it("follows a redirect that stays inside the allowlist", async () => {
    let redirected = false;
    const { impl } = makeFetch(({ init, url }) => {
      if (init.method === "HEAD") return new Response(null, { status: 405 });

      if (!redirected) {
        redirected = true;
        return new Response(null, {
          headers: {
            location: "https://other.public.blob.vercel-storage.com/b.png",
          },
          status: 302,
        });
      }

      expect(url).toContain("other.public.blob.vercel-storage.com");
      return streamResponse(pngBytes(640, 640), { status: 206 });
    });

    expect(await probeImageMetadata(ALLOWED, { fetchImpl: impl })).toMatchObject({
      ok: true,
      width: 640,
    });
  });

  it("stops after too many redirects", async () => {
    const { impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, { status: 405 })
        : new Response(null, {
            headers: { location: ALLOWED },
            status: 302,
          }),
    );

    expect(await probeImageMetadata(ALLOWED, { fetchImpl: impl })).toMatchObject({
      code: "TOO_MANY_REDIRECTS",
      ok: false,
    });
  });

  it("reports a timeout deterministically", async () => {
    const { impl } = makeFetch(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });

    expect(await probeImageMetadata(ALLOWED, { fetchImpl: impl })).toMatchObject({
      code: "TIMEOUT",
      ok: false,
    });
  });

  it("reports an unsupported image format", async () => {
    const gif = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00, 0x80, 0x00,
    ]);
    const { impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, { status: 405 })
        : streamResponse(gif, { status: 206 }),
    );

    expect(await probeImageMetadata(ALLOWED, { fetchImpl: impl })).toMatchObject({
      code: "UNSUPPORTED_IMAGE",
      ok: false,
    });
  });

  it("reports a malformed image", async () => {
    const broken = pngBytes(10, 10);
    broken.set([0x00, 0x00, 0x00, 0x00], 12);

    const { impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, { status: 405 })
        : streamResponse(broken, { status: 206 }),
    );

    expect(await probeImageMetadata(ALLOWED, { fetchImpl: impl })).toMatchObject({
      code: "MALFORMED_IMAGE",
      ok: false,
    });
  });

  it("reports an upstream HTTP error", async () => {
    const { impl } = makeFetch(({ init }) =>
      init.method === "HEAD"
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 404 }),
    );

    expect(await probeImageMetadata(ALLOWED, { fetchImpl: impl })).toMatchObject({
      code: "HTTP_ERROR",
      ok: false,
    });
  });

  it("reports a network failure", async () => {
    const { impl } = makeFetch(() => Promise.reject(new Error("ECONNRESET")));

    expect(await probeImageMetadata(ALLOWED, { fetchImpl: impl })).toMatchObject({
      code: "REQUEST_FAILED",
      ok: false,
    });
  });
});
