import { describe, expect, it } from "vitest";

import {
  buildMeasurementSourceReadiness,
  calibrateDraftWithSources,
  squareMetersToRoofSquares,
} from "./source-stack";
import type { DraftMeasurement } from "./draft-provider";

const baseDraft: DraftMeasurement = {
  provider: "address_only_v1",
  status: "needs_review",
  mode: "quote_ready_review",
  roofSquares: 29.2,
  pitchClass: "medium",
  wastePercent: 12,
  complexityClass: "moderate",
  confidenceScore: 42,
  includedStructures: ["main roof", "attached garage"],
  assumptions: ["Address-only baseline."],
  evidence: [],
  riskFlags: [],
  accuracyBand: { minPercent: 10, maxPercent: 25 },
  sourceStackQuality: "address_only",
};

describe("measurement source stack", () => {
  it("uses Google Solar roof segment area and pitch when available", () => {
    const calibrated = calibrateDraftWithSources(baseDraft, {
      addressValidation: {
        status: "used",
        validationGranularity: "PREMISE",
        formattedAddress: "123 Cypress Point Dr, Boca Raton, FL",
      },
      googleSolar: {
        status: "used",
        roofSegmentStats: [
          { areaMeters2: 121.5, pitchDegrees: 18.2, groundAreaMeters2: 115.1 },
          { areaMeters2: 98.25, pitchDegrees: 21.7, groundAreaMeters2: 91.2 },
        ],
      },
    });

    expect(calibrated.provider).toBe("google_solar_v1");
    expect(calibrated.roofSquares).toBeCloseTo(squareMetersToRoofSquares(219.75), 1);
    expect(calibrated.pitchClass).toBe("medium");
    expect(calibrated.confidenceScore).toBeGreaterThanOrEqual(72);
    expect(calibrated.accuracyBand).toEqual({ minPercent: 3, maxPercent: 8 });
    expect(calibrated.evidence.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Google Solar roof segments", "Address validation"]),
    );
    expect(calibrated.riskFlags.map((flag) => flag.code)).not.toContain("ADDRESS_ONLY");
  });

  it("flags source disagreement when public footprints conflict with Solar area", () => {
    const calibrated = calibrateDraftWithSources(baseDraft, {
      googleSolar: {
        status: "used",
        roofSegmentStats: [{ areaMeters2: 225, pitchDegrees: 24, groundAreaMeters2: 209 }],
      },
      publicFootprints: {
        status: "used",
        roofSquaresEstimate: 39.8,
        sourceLabel: "Overture Maps building footprint",
      },
    });

    expect(calibrated.sourceDisagreementPercent).toBeGreaterThan(20);
    expect(calibrated.confidenceScore).toBeLessThan(72);
    expect(calibrated.riskFlags.map((flag) => flag.code)).toContain("SOURCE_DISAGREEMENT");
    expect(calibrated.evidence.map((item) => item.label)).toContain("Public footprint cross-check");
  });

  it("reports provider readiness without exposing API key values", () => {
    const readiness = buildMeasurementSourceReadiness({
      googleMapsApiKey: "AIza-real-looking-key",
      nearmapApiKey: "",
      mapboxAccessToken: "pk.mapbox-token",
    });

    expect(readiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "address_validation", status: "configured" }),
        expect.objectContaining({ code: "google_solar", status: "configured" }),
        expect.objectContaining({ code: "nearmap", status: "unconfigured" }),
        expect.objectContaining({ code: "mapbox_satellite", status: "configured" }),
      ]),
    );
    expect(JSON.stringify(readiness)).not.toContain("AIza-real-looking-key");
    expect(JSON.stringify(readiness)).not.toContain("pk.mapbox-token");
  });
});
