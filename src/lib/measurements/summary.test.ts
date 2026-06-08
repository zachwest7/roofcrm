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
      reviewerName: "Zach",
      reviewerNotes: "Adjusted garage area after aerial review.",
      approvedAt: new Date("2026-06-07T20:15:00.000Z"),
    });

    expect(summary).toContain("123 Cypress Point Dr, Boca Raton, FL");
    expect(summary).toContain("28.4 squares");
    expect(summary).toContain("Pitch: medium");
    expect(summary).toContain("Waste: 12%");
    expect(summary).toContain("Confidence: 72%");
    expect(summary).toContain("Reviewer: Zach");
    expect(summary).toContain("Adjusted garage area");
  });
});
