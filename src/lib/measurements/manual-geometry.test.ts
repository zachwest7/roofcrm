import { describe, expect, it } from "vitest";

import {
  buildFallbackManualRoofGeometry,
  buildManualRoofGeometryForDraft,
  buildManualRoofGeometryFromAutoOutline,
  calculateManualRoofMeasurements,
  assessManualTraceQuality,
  replaceManualRoofGeometryPoint,
} from "./manual-geometry";
import type { AutoRoofOutline } from "./solar-mask-outline";

const outline: AutoRoofOutline = {
  source: "google_solar_mask",
  status: "proposed",
  imageWidth: 10,
  imageHeight: 10,
  areaPixels: 50,
  pixelSizeMeters: 0.3048,
  areaSqft: 50,
  areaSquares: 0.5,
  confidenceScore: 76,
  polygons: [
    {
      id: "auto-roof-outline-1",
      label: "Auto roof outline",
      areaPixels: 50,
      points: [
        { x: 1, y: 1 },
        { x: 8, y: 1 },
        { x: 8, y: 6 },
        { x: 1, y: 6 },
      ],
    },
  ],
  detail: "Auto outline extracted from Google Solar roof mask pixels. Manager review is still required.",
};

describe("manual roof geometry", () => {
  it("creates editable geometry from a Solar auto outline with a real pixel scale", () => {
    const geometry = buildManualRoofGeometryFromAutoOutline(outline);

    expect(geometry).toMatchObject({
      source: "google_solar_mask",
      imageWidth: 10,
      imageHeight: 10,
      pixelSizeFeet: 1,
    });
    expect(geometry.facets).toHaveLength(1);
    expect(geometry.facets[0].points).toHaveLength(4);
  });

  it("derives roof area and classified perimeter lengths from editable polygons", () => {
    const measurements = calculateManualRoofMeasurements(buildManualRoofGeometryFromAutoOutline(outline));

    expect(measurements.areaSqft).toBe(35);
    expect(measurements.roofSquares).toBe(0.4);
    expect(measurements.edgeRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "eave", lengthFt: 7 }),
        expect.objectContaining({ type: "rake", lengthFt: 5 }),
      ]),
    );
    expect(measurements.lengthTotals.eavesFt).toBe(14);
    expect(measurements.lengthTotals.rakesFt).toBe(10);
    expect(measurements.lengthTotals.eavesAndRakesFt).toBe(24);
  });

  it("updates measurements after a manager drags a point", () => {
    const geometry = buildManualRoofGeometryFromAutoOutline(outline);
    const adjusted = replaceManualRoofGeometryPoint(geometry, {
      facetId: "auto-roof-outline-1",
      pointIndex: 2,
      point: { x: 9, y: 7 },
    });
    const measurements = calculateManualRoofMeasurements(adjusted);

    expect(adjusted.facets[0].points[2]).toEqual({ x: 9, y: 7 });
    expect(measurements.areaSqft).toBeGreaterThan(35);
  });

  it("builds a fallback editable outline scaled to the current draft roof area", () => {
    const geometry = buildFallbackManualRoofGeometry({
      roofSquares: 28.4,
      imageWidth: 120,
      imageHeight: 80,
    });
    const measurements = calculateManualRoofMeasurements(geometry);

    expect(geometry.source).toBe("manual_fallback");
    expect(measurements.roofSquares).toBe(28.4);
    expect(measurements.lengthTotals.eavesAndRakesFt).toBeGreaterThan(200);
  });

  it("preserves a Solar mask outline for manual trace editing", () => {
    const geometry = buildManualRoofGeometryForDraft({
      roofSquares: 15.6,
      autoRoofOutline: {
        ...outline,
        imageWidth: 100,
        imageHeight: 100,
        areaSqft: 1_560,
        areaSquares: 15.6,
        polygons: [
          {
            id: "auto-roof-outline-1",
            label: "Auto roof outline",
            areaPixels: 1_560,
            points: [
              { x: 0, y: 0 },
              { x: 80, y: 0 },
              { x: 80, y: 40 },
              { x: 0, y: 40 },
            ],
          },
        ],
      },
    });

    expect(geometry.source).toBe("google_solar_mask");
    expect(calculateManualRoofMeasurements(geometry).roofSquares).toBe(32);
  });

  it("blocks applying a traced Solar outline when it is wildly smaller than the draft", () => {
    const quality = assessManualTraceQuality({
      draftRoofSquares: 15.6,
      tracedRoofSquares: 0.8,
    });

    expect(quality).toMatchObject({
      status: "blocked",
      canApply: false,
      label: "Trace mismatch",
    });
    expect(quality.disagreementPercent).toBeGreaterThan(90);
  });

  it("allows applying a traced outline when it agrees with the draft within review tolerance", () => {
    const quality = assessManualTraceQuality({
      draftRoofSquares: 15.6,
      tracedRoofSquares: 14.8,
    });

    expect(quality).toMatchObject({
      status: "ready",
      canApply: true,
      label: "Trace ready",
    });
    expect(quality.disagreementPercent).toBeLessThan(10);
  });
});
