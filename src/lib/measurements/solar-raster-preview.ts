import { PNG } from "pngjs";

import { appendGoogleSolarApiKey } from "./solar-mask-outline";

type Raster = ArrayLike<number>;

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type SolarRasterPreview = {
  source: "google_solar_rgb_mask";
  imageWidth: number;
  imageHeight: number;
  imageDataUrl: string;
  roofPixels: number;
  maskOpacity: number;
  detail: string;
};

export type SolarRasterPreviewPixels = {
  rgba: Uint8Array;
  roofPixels: number;
  maskOpacity: number;
};

export type SolarRasterPreviewRasterInput = {
  width: number;
  height: number;
  rgbRaster: Raster;
  maskRaster?: Raster;
  maskThreshold?: number;
  maskOpacity?: number;
  maskColor?: RgbColor;
};

const DEFAULT_MASK_COLOR: RgbColor = { r: 14, g: 165, b: 233 };
const DEFAULT_MASK_OPACITY = 0.44;

export function buildSolarRasterPreviewPixels(input: SolarRasterPreviewRasterInput): SolarRasterPreviewPixels {
  const pixelCount = input.width * input.height;
  const bandCount = inferBandCount(input.rgbRaster, pixelCount);
  const maskThreshold = input.maskThreshold ?? 0;
  const maskOpacity = clamp(input.maskOpacity ?? DEFAULT_MASK_OPACITY, 0, 1);
  const maskColor = input.maskColor ?? DEFAULT_MASK_COLOR;
  const rgba = new Uint8Array(pixelCount * 4);
  let roofPixels = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const rgbIndex = bandCount === 1 ? pixelIndex : pixelIndex * bandCount;
    const red = getRasterValue(input.rgbRaster, rgbIndex);
    const green = getRasterValue(input.rgbRaster, bandCount === 1 ? rgbIndex : rgbIndex + 1);
    const blue = getRasterValue(input.rgbRaster, bandCount === 1 ? rgbIndex : rgbIndex + 2);
    const isRoofPixel = Boolean(input.maskRaster && getRasterValue(input.maskRaster, pixelIndex) > maskThreshold);
    const outputIndex = pixelIndex * 4;

    if (isRoofPixel) {
      roofPixels += 1;
      rgba[outputIndex] = blendChannel(red, maskColor.r, maskOpacity);
      rgba[outputIndex + 1] = blendChannel(green, maskColor.g, maskOpacity);
      rgba[outputIndex + 2] = blendChannel(blue, maskColor.b, maskOpacity);
    } else {
      rgba[outputIndex] = red;
      rgba[outputIndex + 1] = green;
      rgba[outputIndex + 2] = blue;
    }

    rgba[outputIndex + 3] = 255;
  }

  return {
    rgba,
    roofPixels,
    maskOpacity,
  };
}

export async function renderSolarRasterPreviewFromRasters(
  input: SolarRasterPreviewRasterInput,
): Promise<SolarRasterPreview> {
  const pixels = buildSolarRasterPreviewPixels(input);
  const png = new PNG({ width: input.width, height: input.height });

  png.data.set(pixels.rgba);

  const imageDataUrl = `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;

  return {
    source: "google_solar_rgb_mask",
    imageWidth: input.width,
    imageHeight: input.height,
    imageDataUrl,
    roofPixels: pixels.roofPixels,
    maskOpacity: pixels.maskOpacity,
    detail: "Rendered from Google Solar RGB imagery with the roof mask tinted for manager review.",
  };
}

export async function fetchGoogleSolarRasterPreview(input: {
  rgbUrl?: string;
  maskUrl?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<SolarRasterPreview | null> {
  const rgbUrl = input.rgbUrl?.trim();
  const apiKey = input.apiKey?.trim();

  if (!rgbUrl || !apiKey) {
    return null;
  }

  const fetchFn = input.fetchFn ?? fetch;

  try {
    const rgb = await fetchGeoTiffRaster({
      url: appendGoogleSolarApiKey(rgbUrl, apiKey),
      fetchFn,
    });

    if (!rgb) {
      return null;
    }

    const mask = input.maskUrl
      ? await fetchGeoTiffRaster({
          url: appendGoogleSolarApiKey(input.maskUrl, apiKey),
          fetchFn,
        })
      : null;
    const sameDimensions = mask && mask.width === rgb.width && mask.height === rgb.height;

    return renderSolarRasterPreviewFromRasters({
      width: rgb.width,
      height: rgb.height,
      rgbRaster: rgb.raster,
      maskRaster: sameDimensions ? mask.raster : undefined,
    });
  } catch {
    return null;
  }
}

async function fetchGeoTiffRaster(input: {
  url: string;
  fetchFn: typeof fetch;
}): Promise<{ width: number; height: number; raster: Raster } | null> {
  const response = await input.fetchFn(input.url);

  if (!response.ok) {
    return null;
  }

  const { fromArrayBuffer } = await import("geotiff");
  const tiff = await fromArrayBuffer(await response.arrayBuffer());
  const image = await tiff.getImage();
  const raster = await image.readRasters({ interleave: true });

  return {
    width: image.getWidth(),
    height: image.getHeight(),
    raster,
  };
}

function inferBandCount(raster: Raster, pixelCount: number) {
  if (pixelCount <= 0 || raster.length <= pixelCount) {
    return 1;
  }

  return Math.max(1, Math.floor(raster.length / pixelCount));
}

function blendChannel(base: number, overlay: number, opacity: number) {
  return clamp(Math.round(base * (1 - opacity) + overlay * opacity), 0, 255);
}

function getRasterValue(raster: Raster, index: number) {
  return clamp(Math.round(Number(raster[index]) || 0), 0, 255);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
