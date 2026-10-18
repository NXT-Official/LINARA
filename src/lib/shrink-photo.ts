/**
 * Browser-side twin of LINARA_MOBILE's services/media-upload.ts compression:
 * the photo at 1200px wide, 80% JPEG, and a 480px, 70% thumbnail (KNOWN_GAPS
 * O28), both as base64 for a server function. Drawing through a canvas
 * re-encodes the image, which drops the camera's EXIF, GPS included, so no
 * photo carries where the household lives. createImageBitmap applies the
 * EXIF rotation first, so a phone photo isn't saved sideways.
 */
const PHOTO_WIDTH_PX = 1200;
const PHOTO_QUALITY = 0.8;
const THUMB_WIDTH_PX = 480;
const THUMB_QUALITY = 0.7;

export type ShrunkPhoto = { photo: string; thumb: string };

export async function shrinkPhoto(file: File): Promise<ShrunkPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [photo, thumb] = await Promise.all([
      encode(bitmap, PHOTO_WIDTH_PX, PHOTO_QUALITY),
      encode(bitmap, THUMB_WIDTH_PX, THUMB_QUALITY),
    ]);
    return { photo, thumb };
  } finally {
    bitmap.close();
  }
}

/** Never scales up: a photo narrower than `width` keeps its own size. */
async function encode(bitmap: ImageBitmap, width: number, quality: number): Promise<string> {
  const scale = Math.min(1, width / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  // JPEG has no transparency; a PNG screenshot would otherwise go black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Couldn't read that photo.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
