import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sanitizeImage } from '@/server/lib/image-metadata';

async function fixture(format: 'jpeg' | 'png' | 'webp', metadata = false) {
  const image = sharp({
    create: { width: 32, height: 24, channels: 3, background: { r: 20, g: 40, b: 60 } },
  });
  if (format === 'jpeg') {
    return image
      .withMetadata(metadata ? { exif: { IFD0: { Artist: 'private' } } } : undefined)
      .jpeg()
      .toBuffer();
  }
  if (format === 'png') return image.png().toBuffer();
  return image.webp().toBuffer();
}

describe('sanitizeImage', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('re-encodes valid %s images', async (format) => {
    const output = await sanitizeImage(await fixture(format));
    expect(output.mimeType).toBe('image/webp');
    expect(output.extension).toBe('.webp');
    expect(output.width).toBe(32);
    expect(output.height).toBe(24);
    expect((await sharp(output.buffer).metadata()).format).toBe('webp');
  });

  it('removes image metadata from the output', async () => {
    const input = await fixture('jpeg', true);
    const output = await sanitizeImage(input);
    const metadata = await sharp(output.buffer).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.comments).toBeUndefined();
  });

  it('rejects forged, truncated, and unsupported image data', async () => {
    await expect(sanitizeImage(Buffer.from('not a jpeg'))).rejects.toThrow();
    await expect(sanitizeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).rejects.toThrow();
    await expect(
      sanitizeImage(
        await sharp({
          create: { width: 10, height: 10, channels: 3, background: 'red' },
        })
          .tiff()
          .toBuffer(),
      ),
    ).rejects.toThrow(/Unsupported/);
  });
});
