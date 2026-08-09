import sharp from 'sharp';

/**
 * Hard-threshold alpha: pixels with alpha < 128 → fully transparent (0),
 * alpha ≥ 128 → fully opaque (255). Matting models produce soft, anti-aliased
 * alpha, which leaves a semi-transparent halo — that halo wastes k-means
 * centroid slots in the pixel snapper and shows up as fringe on sprite edges.
 */
export async function thresholdAlpha(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] < 128 ? 0 : 255;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}
