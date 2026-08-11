/**
 * Bounded image header parser — JPEG, PNG, WebP.
 *
 * PURE. Given the LEADING BYTES of an image it reports the pixel dimensions,
 * so neither the remote probe nor the local upload path ever has to hold a
 * 40 MB file in memory to learn that it is 4032×3024.
 *
 * No dependency was added for this. The repository already carries `sharp`, but
 * sharp needs a complete, coherent file and is a native module; these three
 * formats put their dimensions in the first few hundred bytes (PNG, WebP) or a
 * short marker walk from the start (JPEG), which is exactly what a Range
 * request can deliver.
 *
 * The parser distinguishes "give me more bytes" from "this is not a supported
 * image", so the caller can widen its Range once instead of guessing.
 */

export type ImageDimensionsResult =
  /** Dimensions read successfully. */
  | { status: "ok"; width: number; height: number; mimeType: string }
  /** The signature matched but the header is not complete in this buffer. */
  | { status: "incomplete" }
  /** Recognised container, but malformed or a variant we do not read. */
  | { status: "invalid" }
  /** Not one of the three formats we support. */
  | { status: "unsupported" };

const startsWith = (bytes: Uint8Array, signature: number[]): boolean => {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
};

const readUInt32BE = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] << 24) >>> 0) +
  (bytes[offset + 1] << 16) +
  (bytes[offset + 2] << 8) +
  bytes[offset + 3];

const readUInt16BE = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 8) + bytes[offset + 1];

const readUInt24LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);

// ---------------------------------------------------------------------------
// PNG — IHDR is always the first chunk, at a fixed offset
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function parsePng(bytes: Uint8Array): ImageDimensionsResult {
  // 8 signature + 4 length + 4 "IHDR" + 4 width + 4 height
  if (bytes.length < 24) return { status: "incomplete" };

  const isIhdr =
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52;
  if (!isIhdr) return { status: "invalid" };

  const width = readUInt32BE(bytes, 16);
  const height = readUInt32BE(bytes, 20);

  if (width <= 0 || height <= 0) return { status: "invalid" };

  return { height, mimeType: "image/png", status: "ok", width };
}

// ---------------------------------------------------------------------------
// JPEG — walk the marker segments to the first Start Of Frame
// ---------------------------------------------------------------------------

/** SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 carry the frame dimensions. */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function parseJpeg(bytes: Uint8Array): ImageDimensionsResult {
  let offset = 2; // skip SOI

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Padding bytes are legal between segments; anything else is malformed.
      offset += 1;
      continue;
    }

    // Skip fill bytes (0xFF 0xFF ...).
    let marker = bytes[offset + 1];
    if (marker === undefined) return { status: "incomplete" };
    while (marker === 0xff) {
      offset += 1;
      marker = bytes[offset + 1];
      if (marker === undefined) return { status: "incomplete" };
    }

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    // Start of scan — image data begins, no SOF was found before it.
    if (marker === 0xda) return { status: "invalid" };

    if (offset + 4 > bytes.length) return { status: "incomplete" };
    const segmentLength = readUInt16BE(bytes, offset + 2);
    if (segmentLength < 2) return { status: "invalid" };

    if (JPEG_SOF_MARKERS.has(marker)) {
      // marker(2) length(2) precision(1) height(2) width(2)
      if (offset + 9 > bytes.length) return { status: "incomplete" };

      const height = readUInt16BE(bytes, offset + 5);
      const width = readUInt16BE(bytes, offset + 7);

      if (width <= 0 || height <= 0) return { status: "invalid" };

      return { height, mimeType: "image/jpeg", status: "ok", width };
    }

    offset += 2 + segmentLength;
  }

  return { status: "incomplete" };
}

// ---------------------------------------------------------------------------
// WebP — VP8 (lossy), VP8L (lossless) and VP8X (extended)
// ---------------------------------------------------------------------------

function parseWebp(bytes: Uint8Array): ImageDimensionsResult {
  if (bytes.length < 16) return { status: "incomplete" };

  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunk === "VP8 ") {
    // 20 header + 3 frame tag + 3 sync + 2 width + 2 height
    if (bytes.length < 30) return { status: "incomplete" };

    const hasSync =
      bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a;
    if (!hasSync) return { status: "invalid" };

    const width = (bytes[26] + (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] + (bytes[29] << 8)) & 0x3fff;

    if (width <= 0 || height <= 0) return { status: "invalid" };

    return { height, mimeType: "image/webp", status: "ok", width };
  }

  if (chunk === "VP8L") {
    if (bytes.length < 25) return { status: "incomplete" };
    if (bytes[20] !== 0x2f) return { status: "invalid" };

    const bits =
      bytes[21] + (bytes[22] << 8) + (bytes[23] << 16) + (bytes[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;

    return { height, mimeType: "image/webp", status: "ok", width };
  }

  if (chunk === "VP8X") {
    // 20 header + 4 flags/reserved + 3 canvas width-1 + 3 canvas height-1
    if (bytes.length < 30) return { status: "incomplete" };

    const width = readUInt24LE(bytes, 24) + 1;
    const height = readUInt24LE(bytes, 27) + 1;

    return { height, mimeType: "image/webp", status: "ok", width };
  }

  return { status: "invalid" };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Read image dimensions from the leading bytes of a file.
 *
 * @param bytes the first N bytes — the whole file also works.
 */
export function parseImageDimensions(
  bytes: Uint8Array,
): ImageDimensionsResult {
  if (bytes.length < 12) return { status: "incomplete" };

  if (startsWith(bytes, PNG_SIGNATURE)) return parsePng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);

  const isRiff =
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (isRiff) return parseWebp(bytes);

  return { status: "unsupported" };
}
