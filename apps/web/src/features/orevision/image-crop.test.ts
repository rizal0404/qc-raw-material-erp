// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cropPhotoReportImage,
  FULL_IMAGE_CROP,
  normalizeImageCrop,
} from "./image-crop";

describe("image crop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("keeps crop bounds inside the image with a usable minimum size", () => {
    expect(
      normalizeImageCrop({ x: 98, y: -4, width: 40, height: 2 }),
    ).toEqual({ x: 60, y: 0, width: 40, height: 5 });
  });

  it("returns the original file when the full image is selected", async () => {
    const file = new File(["image"], "report.jpg", { type: "image/jpeg" });
    await expect(cropPhotoReportImage(file, FULL_IMAGE_CROP)).resolves.toBe(
      file,
    );
  });

  it("renders only the selected pixels into a new local file", async () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn(
        (callback: BlobCallback, mimeType: string) =>
          callback(new Blob(["cropped"], { type: mimeType })),
      ),
    };
    class LoadedImage {
      naturalWidth = 1000;
      naturalHeight = 500;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", LoadedImage);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:local-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(document, "createElement").mockReturnValue(canvas as any);

    const result = await cropPhotoReportImage(
      new File(["source"], "report.jpg", { type: "image/jpeg" }),
      { x: 10, y: 20, width: 50, height: 40 },
    );

    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(200);
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(LoadedImage),
      100,
      100,
      500,
      200,
      0,
      0,
      500,
      200,
    );
    expect(result.name).toBe("report-crop.jpg");
    expect(result.type).toBe("image/jpeg");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-preview");
  });
});
