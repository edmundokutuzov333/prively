import sharp from 'sharp';

/** Irreversible curtain: destroy detail before re-amplifying the preview. */
export async function makeBlurPreview(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().resize(48).blur(4).resize(640).jpeg({ quality: 50 }).toBuffer();
}
