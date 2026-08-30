export type ImageCropPercent = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const FULL_IMAGE_CROP: ImageCropPercent = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function normalizeImageCrop(
  crop: ImageCropPercent,
): ImageCropPercent {
  const width = clamp(crop.width, 5, 100);
  const height = clamp(crop.height, 5, 100);
  return {
    x: clamp(crop.x, 0, 100 - width),
    y: clamp(crop.y, 0, 100 - height),
    width,
    height,
  };
}

const isFullImage = (crop: ImageCropPercent) =>
  crop.x === 0 &&
  crop.y === 0 &&
  crop.width === 100 &&
  crop.height === 100;

function croppedFileName(name: string, mimeType: string) {
  const stem = name.replace(/\.[^.]+$/, "") || "laporan";
  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";
  return `${stem}-crop.${extension}`;
}

export async function cropPhotoReportImage(
  file: File,
  requestedCrop: ImageCropPercent,
): Promise<File> {
  const crop = normalizeImageCrop(requestedCrop);
  if (isFullImage(crop)) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Preview gambar tidak dapat dibaca."));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("Dimensi gambar tidak valid.");

    const sx = Math.round((crop.x / 100) * image.naturalWidth);
    const sy = Math.round((crop.y / 100) * image.naturalHeight);
    const sw = Math.max(
      1,
      Math.min(
        image.naturalWidth - sx,
        Math.round((crop.width / 100) * image.naturalWidth),
      ),
    );
    const sh = Math.max(
      1,
      Math.min(
        image.naturalHeight - sy,
        Math.round((crop.height / 100) * image.naturalHeight),
      ),
    );
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak mendukung cropping gambar.");
    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

    const mimeType = ["image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    )
      ? file.type
      : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Hasil crop gambar tidak dapat dibuat.")),
        mimeType,
        mimeType === "image/png" ? undefined : 0.92,
      ),
    );
    return new File([blob], croppedFileName(file.name, mimeType), {
      type: mimeType,
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
