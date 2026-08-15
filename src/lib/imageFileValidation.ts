export const SUPPORTED_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

const supportedMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const supportedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const rawExtensions = new Set(["dng", "raw", "arw", "cr2", "cr3", "nef", "orf", "raf", "rw2"]);

const extensionOf = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";

export const imageFileError = (file: File): string | null => {
  const extension = extensionOf(file);

  if (rawExtensions.has(extension) || file.type.toLowerCase().includes("dng")) {
    return "Apple ProRAW/DNG isn't supported yet. In Photos, share or export this photo as JPEG first.";
  }

  if (!supportedMimeTypes.has(file.type.toLowerCase()) && !supportedExtensions.has(extension)) {
    return "Choose a JPEG, PNG, or WebP photo.";
  }

  return null;
};

export const canDecodeImage = (file: File): Promise<boolean> => new Promise((resolve) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  const finish = (result: boolean) => {
    URL.revokeObjectURL(objectUrl);
    resolve(result);
  };
  image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
  image.onerror = () => finish(false);
  image.src = objectUrl;
});
