import sharp from 'sharp';

export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_WIDTH = 8_000;
export const MAX_IMAGE_HEIGHT = 8_000;

export interface SanitizedImage {
  buffer: Buffer;
  mimeType: 'image/webp';
  extension: '.webp';
  width: number;
  height: number;
}

/**
 * Decode an image and re-encode it without carrying any input metadata across.
 * Sharp identifies the format from the bytes, so the browser MIME type is not trusted.
 */
export async function sanitizeImage(input: Buffer): Promise<SanitizedImage> {
  const image = sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  });
  const metadata = await image.metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new Error('Unsupported image format');
  }
  if (!metadata.width || !metadata.height) throw new Error('Image dimensions are unavailable');
  if (metadata.width > MAX_IMAGE_WIDTH || metadata.height > MAX_IMAGE_HEIGHT) {
    throw new Error('Image dimensions are too large');
  }
  if (metadata.pages && metadata.pages > 1) throw new Error('Animated images are not supported');

  const { data, info } = await image
    .rotate()
    .webp({ quality: 85, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.width * info.height > MAX_IMAGE_PIXELS) {
    throw new Error('Image dimensions are too large');
  }

  return {
    buffer: data,
    mimeType: 'image/webp',
    extension: '.webp',
    width: info.width,
    height: info.height,
  };
}
