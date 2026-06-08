import { describe, expect, it } from "vitest";

import {
  buildSolarRasterPreviewPixels,
  renderSolarRasterPreviewFromRasters,
} from "./solar-raster-preview";

describe("solar raster preview", () => {
  it("blends roof-mask pixels over RGB imagery while leaving non-roof pixels unchanged", () => {
    const result = buildSolarRasterPreviewPixels({
      width: 2,
      height: 1,
      rgbRaster: new Uint8Array([100, 100, 100, 20, 30, 40]),
      maskRaster: new Uint8Array([1, 0]),
      maskOpacity: 0.5,
      maskColor: { r: 0, g: 200, b: 255 },
    });

    expect(result.roofPixels).toBe(1);
    expect(result.maskOpacity).toBe(0.5);
    expect(Array.from(result.rgba.slice(0, 4))).toEqual([50, 150, 178, 255]);
    expect(Array.from(result.rgba.slice(4, 8))).toEqual([20, 30, 40, 255]);
  });

  it("renders the blended preview as a PNG data URL for report embedding", async () => {
    const preview = await renderSolarRasterPreviewFromRasters({
      width: 2,
      height: 2,
      rgbRaster: new Uint8Array([
        10, 20, 30,
        40, 50, 60,
        70, 80, 90,
        100, 110, 120,
      ]),
      maskRaster: new Uint8Array([0, 1, 1, 0]),
      maskOpacity: 0.45,
    });
    const encoded = preview.imageDataUrl.replace("data:image/png;base64,", "");
    const decoded = Buffer.from(encoded, "base64");

    expect(preview).toMatchObject({
      source: "google_solar_rgb_mask",
      imageWidth: 2,
      imageHeight: 2,
      roofPixels: 2,
      maskOpacity: 0.45,
    });
    expect(preview.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(Array.from(decoded.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
