import LibRaw from "libraw-wasm";

export const isDngFile = (file: File): boolean => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return extension === "dng" || file.type.toLowerCase().includes("dng");
};

// Demosaics the RAW sensor data via LibRaw (WASM, off the main thread), then
// draws the decoded RGB pixels to a canvas to re-encode as a normal JPEG File
// the rest of the upload pipeline (EXIF read already happened, compressImage,
// Supabase upload) can handle exactly like any other photo.
export async function convertDngToJpeg(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  const raw = new LibRaw();
  try {
    await raw.open(new Uint8Array(buffer));
    const image = await raw.imageData();
    if (!image) throw new Error("RAW decode returned no image data");

    const { width, height, colors, bits, data } = image;
    const downscale16 = bits === 16;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0, sample = 0; pixel < width * height; pixel++, sample += colors) {
      const r = data[sample];
      const g = colors >= 3 ? data[sample + 1] : r;
      const b = colors >= 3 ? data[sample + 2] : r;
      const offset = pixel * 4;
      rgba[offset] = downscale16 ? r >> 8 : r;
      rgba[offset + 1] = downscale16 ? g >> 8 : g;
      rgba[offset + 2] = downscale16 ? b >> 8 : b;
      rgba[offset + 3] = 255;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Failed to encode JPEG"))), "image/jpeg", 0.92);
    });

    return new File([blob], file.name.replace(/\.dng$/i, ".jpg"), { type: "image/jpeg" });
  } finally {
    raw.dispose();
  }
}
