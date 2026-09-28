import { encode } from 'blurhash';

async function imageDataFromFile(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('blurhash_canvas_unavailable');
  }

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;
  context.clearRect(0, 0, size, size);
  context.drawImage(bitmap, x, y, width, height);
  bitmap.close();
  return context.getImageData(0, 0, size, size);
}

export async function createBlurhash(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  const imageData = await imageDataFromFile(file);
  return encode(imageData.data, imageData.width, imageData.height, 4, 4);
}
