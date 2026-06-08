import { describe, expect, it } from "vitest";

import {
  buildMeasurementReport,
  buildWasteScenarios,
  formatFeetAndInches,
  roofSquaresToSquareFeet,
} from "./report";

describe("measurement report", () => {
  it("builds Roofr-style waste scenarios around the approved waste percent", () => {
    const scenarios = buildWasteScenarios(28.4, 13);

    expect(scenarios.map((scenario) => scenario.percent)).toEqual([0, 10, 12, 13, 15, 20]);
    expect(scenarios.find((scenario) => scenario.percent === 13)).toMatchObject({
      isRecommended: true,
      areaSqft: 3209,
      squares: 32.1,
    });
  });

  it("rounds roof squares to square feet for printable report totals", () => {
    expect(roofSquaresToSquareFeet(28.4)).toBe(2840);
    expect(roofSquaresToSquareFeet(28.46)).toBe(2846);
  });

  it("formats decimal feet as feet and inches", () => {
    expect(formatFeetAndInches(142.75)).toBe("142ft 9in");
    expect(formatFeetAndInches(18)).toBe("18ft 0in");
  });

  it("builds a report model with length totals and material estimates", () => {
    const report = buildMeasurementReport({
      propertyAddress: "123 Cypress Point Dr, Boca Raton, FL",
      customerNotes: "Customer wants a pre-quote screen.",
      jobNotes: "Rear flat section and attached garage.",
      reviewerName: "Zach",
      reviewerNotes: "Adjusted garage after satellite review.",
      approvedRoofSquares: 28.4,
      approvedPitchClass: "medium",
      approvedWastePercent: 13,
      approvedComplexityClass: "moderate",
      confidenceScore: 76,
      includedStructures: ["main roof", "attached garage"],
      sourceStackQuality: "solar_backed",
      accuracyBand: { minPercent: 3, maxPercent: 8 },
      roofSegments: [
        {
          id: "solar-a",
          label: "Solar A",
          source: "google_solar",
          squares: 15.1,
          pitchDegrees: 22,
          boundingBox: {
            sw: { latitude: 26.35, longitude: -80.12 },
            ne: { latitude: 26.3505, longitude: -80.1195 },
          },
        },
        { id: "solar-b", label: "Solar B", source: "google_solar", squares: 13.3, pitchDegrees: 20 },
      ],
      autoRoofOutline: {
        source: "google_solar_mask",
        status: "proposed",
        imageWidth: 8,
        imageHeight: 6,
        areaPixels: 22,
        areaSqft: 15,
        areaSquares: 0.2,
        pixelSizeMeters: 0.25,
        confidenceScore: 76,
        polygons: [
          {
            id: "auto-roof-outline-1",
            label: "Auto roof outline",
            areaPixels: 22,
            points: [
              { x: 1, y: 1 },
              { x: 7, y: 1 },
              { x: 7, y: 3 },
              { x: 6, y: 3 },
              { x: 6, y: 5 },
              { x: 1, y: 5 },
            ],
          },
        ],
        detail: "Auto outline extracted from Google Solar roof mask pixels. Manager review is still required.",
      },
      solarRasterPreview: {
        source: "google_solar_rgb_mask",
        imageWidth: 8,
        imageHeight: 6,
        imageDataUrl: "data:image/png;base64,preview",
        roofPixels: 22,
        maskOpacity: 0.44,
        detail: "Rendered from Google Solar RGB imagery with the roof mask tinted for manager review.",
      },
      generatedAt: "2026-06-07T20:15:00.000Z",
    });

    expect(report.cover.totalRoofAreaSqft).toBe(2840);
    expect(report.cover.totalFacets).toBe(2);
    expect(report.cover.autoOutlinePolygons).toBe(1);
    expect(report.sourceRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Quote roof area",
          status: "review_input",
          value: "2,840 sqft",
        }),
        expect.objectContaining({
          label: "Solar roof segments",
          status: "provider_estimate",
          value: "2 facets / 2,840 sqft",
        }),
        expect.objectContaining({
          label: "Auto roof outline",
          status: "proposed",
          value: "1 polygon / 15 sqft mask area",
        }),
        expect.objectContaining({
          label: "Solar imagery overlay",
          status: "provider_estimate",
          value: "8 x 6 px / 22 roof pixels",
        }),
      ]),
    );
    expect(report.measurements.hipsAndRidgesFt).toBeGreaterThan(120);
    expect(report.measurements.eavesAndRakesFt).toBeGreaterThan(170);
    expect(report.materialSections[0].rows[0]).toMatchObject({
      product: "Shingle total",
      unit: "sqft",
    });
    expect(report.materialSections[0].rows[0].quantities[13]).toBe("3,209 sqft");
    expect(report.facetRows[0].boundingBox).toEqual({
      sw: { latitude: 26.35, longitude: -80.12 },
      ne: { latitude: 26.3505, longitude: -80.1195 },
    });
    expect(report.autoRoofOutline?.polygons[0].points).toContainEqual({ x: 7, y: 3 });
    expect(report.solarRasterPreview?.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(report.pitchRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pitch: "medium", squares: 28.4, areaSqft: 2840 }),
      ]),
    );
  });
});
