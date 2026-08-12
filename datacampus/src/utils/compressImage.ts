/**
 * Client-side image compression per cd.md §8C:
 * WebP, max dimension 1600px, target ≤300KB before hitting Storage.
 * Falls back to the original if canvas/WebP encoding isn't available.
 */

const MAX_DIMENSION = 1600;
const TARGET_MAX_BYTES = 300 * 1024;

function toFile(input: Blob | File, fallbackName = "image.jpg"): File {
  if (input instanceof File) return input;
  return new File([input], fallbackName, { type: input.type || "image/jpeg" });
}

export async function compressImage(
  input: Blob | File,
  fallbackName = "image.jpg"
): Promise<File> {
  const file = toFile(input, fallbackName);
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = 0.85;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality)
      );
      if (!blob || blob.size <= TARGET_MAX_BYTES || quality <= 0.4) break;
      quality -= 0.15;
    }
    if (!blob) return file;

    const compressed = new File(
      [blob],
      file.name.replace(/\.\w+$/, "") + ".webp",
      { type: "image/webp" }
    );
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}
