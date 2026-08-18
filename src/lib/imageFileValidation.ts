export const SUPPORTED_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.dng,image/jpeg,image/png,image/webp";

const supportedMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const supportedExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const rawExtensions = new Set(["raw", "arw", "cr2", "cr3", "nef", "orf", "raf", "rw2"]);

const extensionOf = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";

export const imageFileError = (file: File): string | null => {
  const extension = extensionOf(file);

  if (rawExtensions.has(extension)) {
    return "That RAW format isn't supported yet — DNG works, or export this photo as JPEG first.";
  }

  if (!supportedMimeTypes.has(file.type.toLowerCase()) && !supportedExtensions.has(extension) && extension !== "dng") {
    return "Choose a JPEG, PNG, WebP, or DNG photo.";
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
