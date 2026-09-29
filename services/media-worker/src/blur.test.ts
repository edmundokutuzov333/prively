import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { makeBlurPreview } from './blur.js';

test('blur preview is resized, re-encoded and has no EXIF metadata', async () => {
  const input = await sharp({ create: { width: 640, height: 640, channels: 3, background: { r: 220, g: 40, b: 80 } } }).jpeg().toBuffer();
  const output = await makeBlurPreview(input);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 640);
  assert.equal(metadata.exif, undefined);
});
