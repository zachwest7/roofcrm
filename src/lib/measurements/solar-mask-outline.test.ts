import { describe, expect, it } from "vitest";

import {
  appendGoogleSolarApiKey,
  extractAutoRoofOutlineFromMaskRaster,
  simplifyOrthogonalPolygon,
} from "./solar-mask-outline";

describe("solar mask outline", () => {
  it("extracts an orthogonal roof outline from mask pixels", () => {
    const width = 8;
    const height = 6;
    const mask = new Uint8Array(width * height);

    for (let y = 1; y <= 4; y += 1) {
      for (let x = 1; x <= 5; x += 1) {
        mask[y * width + x] = 1;
      }
    }

    for (let y = 1; y <= 2; y += 1) {
      for (let x = 5; x <= 6; x += 1) {
        mask[y * width + x] = 1;
      }
    }

    const outline = extractAutoRoofOutlineFromMaskRaster({
      width,
      height,
      raster: mask,
      threshold: 0,
      pixelSizeMeters: 0.25,
    });

    expect(outline).toMatchObject({
      source: "google_solar_mask",
      status: "proposed",
      imageWidth: width,
      imageHeight: height,
      areaPixels: 22,
      areaSqft: 15,
      areaSquares: 0.2,
      pixelSizeMeters: 0.25,
    });
    expect(outline?.polygons).toHaveLength(1);
    expect(outline?.polygons[0].points).toEqual(
      expect.arrayContaining([
        { x: 1, y: 1 },
        { x: 7, y: 1 },
        { x: 7, y: 3 },
        { x: 6, y: 3 },
        { x: 6, y: 5 },
        { x: 1, y: 5 },
      ]),
    );
  });

  it("keeps the largest connected roof component", () => {
    const width = 8;
    const height = 5;
    const mask = new Uint8Array(width * height);

    mask[1 * width + 1] = 1;
    mask[1 * width + 2] = 1;

    for (let y = 1; y <= 3; y += 1) {
      for (let x = 4; x <= 6; x += 1) {
        mask[y * width + x] = 1;
      }
    }

    const outline = extractAutoRoofOutlineFromMaskRaster({
      width,
      height,
      raster: mask,
      threshold: 0,
    });

    expect(outline?.areaPixels).toBe(9);
    expect(outline?.polygons[0].points).toEqual([
      { x: 4, y: 1 },
      { x: 7, y: 1 },
      { x: 7, y: 4 },
      { x: 4, y: 4 },
    ]);
  });

  it("keeps the roof component nearest the selected target point", () => {
    const width = 12;
    const height = 6;
    const mask = new Uint8Array(width * height);

    for (let y = 1; y <= 4; y += 1) {
      for (let x = 1; x <= 4; x += 1) {
        mask[y * width + x] = 1;
      }
    }

    for (let y = 1; y <= 2; y += 1) {
      for (let x = 8; x <= 9; x += 1) {
        mask[y * width + x] = 1;
      }
    }

    const outline = extractAutoRoofOutlineFromMaskRaster({
      width,
      height,
      raster: mask,
      threshold: 0,
      targetPoint: { x: 9, y: 2 },
    });

    expect(outline?.areaPixels).toBe(4);
    expect(outline?.polygons[0].points).toEqual([
      { x: 8, y: 1 },
      { x: 10, y: 1 },
      { x: 10, y: 3 },
      { x: 8, y: 3 },
    ]);
  });

  it("returns null when the mask has too little roof signal", () => {
    const outline = extractAutoRoofOutlineFromMaskRaster({
      width: 6,
      height: 6,
      raster: new Uint8Array(36),
      threshold: 0,
    });

    expect(outline).toBeNull();
  });

  it("simplifies collinear polygon points without changing corners", () => {
    expect(
      simplifyOrthogonalPolygon([
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
      ]),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ]);
  });

  it("appends the Google Solar API key to expiring geoTiff URLs", () => {
    expect(appendGoogleSolarApiKey("https://solar.example/mask.tif", "server-key")).toBe(
      "https://solar.example/mask.tif?key=server-key",
    );
    expect(appendGoogleSolarApiKey("https://solar.example/mask.tif?foo=bar", "server-key")).toBe(
      "https://solar.example/mask.tif?foo=bar&key=server-key",
    );
  });
});
