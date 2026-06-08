import { describe, expect, it } from "vitest";

import { buildSourceDiagnostics } from "./source-diagnostics";
import type { DraftMeasurement } from "./draft-provider";
import type { PropertyMatch } from "./property-match";
import type { MeasurementSourceReadiness } from "./source-stack";

const readiness: MeasurementSourceReadiness[] = [
  {
    code: "google_solar",
    label: "Google Solar roof segments",
    status: "configured",
    sourceType: "paid_api",
    role: "roof_geometry",
    detail: "Ready.",
  },
  {
    code: "public_footprints",
    label: "Public building footprints",
    status: "available",
    sourceType: "public_data",
    role: "roof_geometry",
    detail: "Ready.",
  },
];

const baseDraft: DraftMeasurement = {
  provider: "address_only_v1",
  status: "needs_review",
  mode: "quote_ready_review",
  roofSquares: 28.4,
  pitchClass: "medium",
  wastePercent: 12,
  complexityClass: "moderate",
  confidenceScore: 44,
  includedStructures: ["main roof"],
  assumptions: [],
  evidence: [],
  riskFlags: [],
  accuracyBand: { minPercent: 10, maxPercent: 25 },
  sourceStackQuality: "address_only",
  roofSegments: [],
};

const validatedMatch: PropertyMatch = {
  status: "validated",
  source: "google_address_validation",
  formattedAddress: "123 Cypress Point Dr, Boca Raton, FL",
  latitude: 26.391234,
  longitude: -80.083456,
  validationGranularity: "PREMISE",
  detail: "Validated at premise granularity.",
};

describe("source diagnostics", () => {
  it("marks the core data chain as ready when property, Solar, preview, and public cross-check are present", () => {
    const diagnostics = buildSourceDiagnostics({
      propertyMatch: validatedMatch,
      sourceReadiness: readiness,
      draft: {
        ...baseDraft,
        provider: "google_solar_v1",
        sourceStackQuality: "solar_backed",
        roofSegments: [{ id: "solar-a", label: "Solar A", source: "google_solar", squares: 14.2 }],
        imageryLayers: {
          source: "google_solar",
          imageryQuality: "HIGH",
          imageryDate: "2025-02-12",
          rgbUrl: "https://solar.example/rgb.tif",
          maskUrl: "https://solar.example/mask.tif",
          dsmUrl: "https://solar.example/dsm.tif",
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
        evidence: [
          {
            sourceType: "public_data",
            label: "Public footprint cross-check",
            detail: "OpenStreetMap estimates 28.0 squares.",
            confidenceImpact: 4,
          },
        ],
      },
    });

    expect(diagnostics.map((item) => [item.id, item.status])).toEqual(
      expect.arrayContaining([
        ["property-match", "pass"],
        ["coordinates", "pass"],
        ["solar-segments", "pass"],
        ["solar-imagery", "pass"],
        ["solar-preview", "pass"],
        ["public-footprint", "pass"],
      ]),
    );
    expect(diagnostics.find((item) => item.id === "solar-preview")?.value).toBe("8 x 6 px");
  });

  it("makes uncertainty visible when the address has not produced coordinates or provider evidence", () => {
    const diagnostics = buildSourceDiagnostics({
      propertyMatch: {
        status: "typed_only",
        source: "manual",
        formattedAddress: "123 Cypress Point Dr",
        detail: "Typed address has not been matched to a property yet.",
      },
      sourceReadiness: readiness,
      draft: baseDraft,
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "property-match",
          status: "warning",
          value: "Typed address only",
        }),
        expect.objectContaining({
          id: "coordinates",
          status: "warning",
          value: "Missing",
        }),
        expect.objectContaining({
          id: "solar-segments",
          status: "warning",
          detail: expect.stringContaining("waiting on a precise property match"),
        }),
      ]),
    );
  });
});
