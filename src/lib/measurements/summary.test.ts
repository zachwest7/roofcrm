import { describe, expect, it } from "vitest";

import { formatApprovedMeasurementSummary } from "./summary";

describe("formatApprovedMeasurementSummary", () => {
  it("formats approved quote inputs with review context", () => {
    const summary = formatApprovedMeasurementSummary({
      propertyAddress: "123 Cypress Point Dr, Boca Raton, FL",
      approvedRoofSquares: 28.4,
      approvedPitchClass: "medium",
      approvedWastePercent: 12,
      approvedComplexityClass: "moderate",
      confidenceScore: 72,
      includedStructures: ["main roof", "attached garage"],
      correctionSummary: ["Roof area increased by 1.2 squares (4.4%)."],
      manualMeasurements: {
        source: "manual_geometry",
        areaSqft: 2960,
        roofSquares: 29.6,
        lengthTotals: {
          eavesFt: 120,
          valleysFt: 14,
          hipsFt: 32,
          ridgesFt: 18,
          rakesFt: 84,
          wallFlashingFt: 0,
          stepFlashingFt: 0,
          transitionsFt: 0,
          parapetWallsFt: 0,
          unspecifiedFt: 0,
          hipsAndRidgesFt: 50,
          eavesAndRakesFt: 204,
        },
        edgeRows: [],
        detail: "Area and edge lengths are derived from the manager-adjusted outline geometry.",
      },
      reviewerName: "Zach",
      reviewerNotes: "Adjusted garage area after aerial review.",
      approvedAt: new Date("2026-06-07T20:15:00.000Z"),
    });

    expect(summary).toContain("123 Cypress Point Dr, Boca Raton, FL");
    expect(summary).toContain("28.4 squares");
    expect(summary).toContain("Pitch: medium");
    expect(summary).toContain("Waste: 12%");
    expect(summary).toContain("Included structures: main roof, attached garage");
    expect(summary).toContain("Corrections: Roof area increased by 1.2 squares (4.4%).");
    expect(summary).toContain("Manual geometry area: 2,960 sqft / 29.6 squares");
    expect(summary).toContain("Manual eaves/rakes: 204ft 0in");
    expect(summary).toContain("Confidence: 72%");
    expect(summary).toContain("Reviewer: Zach");
    expect(summary).toContain("Adjusted garage area");
  });
});
