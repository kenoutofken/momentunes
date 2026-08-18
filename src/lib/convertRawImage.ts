import * as UTIF from "utif2";

export const isDngFile = (file: File): boolean => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return extension === "dng" || file.type.toLowerCase().includes("dng");
};

const dimensionsOf = (ifd: UTIF.IFD) => {
  const width = Array.isArray(ifd.t256) ? Number(ifd.t256[0]) : 0;
  const height = Array.isArray(ifd.t257) ? Number(ifd.t257[0]) : 0;
  return width * height;
};

// Standard baseline/progressive JPEG (6, old-style; 7, new-style) is the compression
// UTIF actually has a full, well-tested decoder for — which is also what a phone's
// embedded DNG preview normally uses. Other TIFF/DNG-specific compression schemes
// (raw mosaics, exotic lossy-JPEG variants like 34892) can "succeed" without
// throwing but hand back garbage, so try real JPEG IFDs before anything else.
const isJpegCompressed = (ifd: UTIF.IFD) => {
  const compression = Array.isArray(ifd.t259) ? Number(ifd.t259[0]) : 0;
  return compression === 6 || compression === 7;
};

// DNG files bundle one or more embedded preview images alongside the raw sensor
// data — Apple ProRAW in particular always includes a full-resolution JPEG
// preview, specifically so apps that can't process RAW still get a real photo.
// Decoding that embedded JPEG (what UTIF does here) is dramatically simpler and
// more reliable than demosaicing the raw sensor data ourselves would be, so pick
// the best embedded image UTIF can actually decode and use that.
export async function convertDngToJpeg(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error("No image found in this RAW file");

  const candidates = [...ifds].sort((a, b) => {
    const jpegRank = Number(isJpegCompressed(b)) - Number(isJpegCompressed(a));
    return jpegRank || dimensionsOf(b) - dimensionsOf(a);
  });

  let lastError: unknown;
  for (const ifd of candidates) {
    try {
      UTIF.decodeImage(buffer, ifd);
      if (!ifd.width || !ifd.height) continue;
      const rgba = UTIF.toRGBA8(ifd);

      const canvas = document.createElement("canvas");
      canvas.width = ifd.width;
      canvas.height = ifd.height;
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height), 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Failed to encode JPEG"))), "image/jpeg", 0.92);
      });

      return new File([blob], file.name.replace(/\.(dng|raw|arw|cr2|cr3|nef|orf|raf|rw2)$/i, ".jpg"), { type: "image/jpeg" });
    } catch (err) {
      lastError = err;
    }
  }

  console.error("Could not decode any embedded image for", file.name, {
    lastError,
    ifds: ifds.map((ifd) => ({ width: ifd.t256, height: ifd.t257, compression: ifd.t259, photometric: ifd.t262, subfileType: ifd.t254 })),
  });
  throw new Error("RAW decode returned no image data");
}
