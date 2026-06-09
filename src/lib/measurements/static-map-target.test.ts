import { describe, expect, it } from "vitest";

import { getGoogleStaticMapTapTargetCoordinates, getMetricRasterTapTargetCoordinates } from "./static-map-target";

describe("getGoogleStaticMapTapTargetCoordinates", () => {
  const center = { latitude: 26.391234, longitude: -80.083456 };
  const imageSize = { width: 640, height: 420 };

  it("keeps the target at the map center when the user taps the visual center", () => {
    const target = getGoogleStaticMapTapTargetCoordinates({
      center,
      zoom: 20,
      imageSize,
      renderedSize: { width: 1280, height: 840 },
      tap: { x: 640, y: 420 },
    });

    expect(target.latitude).toBeCloseTo(center.latitude, 6);
    expect(target.longitude).toBeCloseTo(center.longitude, 6);
  });

  it("moves east and north when the tap is right and above center", () => {
    const target = getGoogleStaticMapTapTargetCoordinates({
      center,
      zoom: 20,
      imageSize,
      renderedSize: { width: 1280, height: 840 },
      tap: { x: 760, y: 300 },
    });

    expect(target.latitude).toBeGreaterThan(center.latitude);
    expect(target.longitude).toBeGreaterThan(center.longitude);
  });

  it("accounts for object-cover cropping in a wider workbench", () => {
    const target = getGoogleStaticMapTapTargetCoordinates({
      center,
      zoom: 20,
      imageSize,
      renderedSize: { width: 1280, height: 620 },
      tap: { x: 640, y: 310 },
    });

    expect(target.latitude).toBeCloseTo(center.latitude, 6);
    expect(target.longitude).toBeCloseTo(center.longitude, 6);
  });
});

describe("getMetricRasterTapTargetCoordinates", () => {
  const center = { latitude: 26.313481, longitude: -80.115112 };

  it("keeps a square Solar raster centered when rendered inside a wide editor", () => {
    const target = getMetricRasterTapTargetCoordinates({
      center,
      imageSize: { width: 640, height: 640 },
      renderedSize: { width: 810, height: 531 },
      pixelSizeFeet: 0.8202,
      tap: { x: 405, y: 265.5 },
    });

    expect(target.latitude).toBeCloseTo(center.latitude, 6);
    expect(target.longitude).toBeCloseTo(center.longitude, 6);
  });

  it("moves west without jumping to an address-centered static map crop", () => {
    const target = getMetricRasterTapTargetCoordinates({
      center,
      imageSize: { width: 640, height: 640 },
      renderedSize: { width: 810, height: 531 },
      pixelSizeFeet: 0.8202,
      tap: { x: 322.03125, y: 265.5 },
    });

    expect(target.latitude).toBeCloseTo(center.latitude, 6);
    expect(target.longitude).toBeLessThan(center.longitude);
  });
});
