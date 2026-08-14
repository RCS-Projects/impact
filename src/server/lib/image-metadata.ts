/**
 * Strip EXIF/metadata from image buffers.
 * Handles JPEG (removes APP1 marker) and WebP (removes EXIF chunk).
 * PNG has no standard EXIF.
 */
export function stripImageMetadata(buffer: Buffer, mimeType: string): Buffer {
  if (mimeType === 'image/jpeg') {
    return stripJpegExif(buffer);
  }
  if (mimeType === 'image/webp') {
    return stripWebpExif(buffer);
  }
  // PNG: metadata is in ancillary chunks, not standard EXIF; return as-is
  return buffer;
}

function stripJpegExif(buf: Buffer): Buffer {
  // JPEG files start with SOI (0xFFD8), then markers
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;

  const parts: Buffer[] = [];
  let offset = 2; // skip SOI

  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];

    // SOI and EOI markers have no length
    if (marker === 0xd8) { offset += 2; continue; }
    if (marker === 0xd9) { parts.push(buf.subarray(offset)); return Buffer.concat(parts); }

    // Read marker length (includes the 2 length bytes)
    if (offset + 3 >= buf.length) break;
    const high = buf[offset + 2] ?? 0;
    const low = buf[offset + 3] ?? 0;
    const segLen = high * 256 + low;

    // Skip APP1 (EXIF) and APP2 (ICC) markers
    if (marker === 0xe1 || marker === 0xe2) {
      offset += 2 + segLen;
      continue;
    }

    // Keep all other markers and data
    parts.push(buf.subarray(offset, offset + 2 + segLen));
    offset += 2 + segLen;
  }

  // Append any remaining data
  if (offset < buf.length) {
    parts.push(buf.subarray(offset));
  }

  return Buffer.concat(parts);
}

function stripWebpExif(buf: Buffer): Buffer {
  // WebP: RIFF header, then chunks. EXIF is in 'EXIF' chunk.
  if (buf.length < 12) return buf;
  if (buf.subarray(0, 4).toString() !== 'RIFF') return buf;
  if (buf.subarray(8, 12).toString() !== 'WEBP') return buf;

  const parts: Buffer[] = [buf.subarray(0, 12)]; // RIFF header
  let offset = 12;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.subarray(offset, offset + 4).toString();
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkSize + (chunkSize % 2); // pad to even

    if (chunkId === 'EXIF' || chunkId === 'XMP ') {
      // Skip EXIF and XMP chunks
      offset = chunkEnd;
      continue;
    }

    parts.push(buf.subarray(offset, Math.min(chunkEnd, buf.length)));
    offset = chunkEnd;
  }

  return Buffer.concat(parts);
}
