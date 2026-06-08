import { describe, expect, it } from "vitest";

import {
  buildApprovalChangeSummary,
  compareApprovedMeasurementToDraft,
} from "./calibration";

describe("measurement calibration", () => {
  it("classifies material reviewer corrections to roof area", () => {
    expect(
      compareApprovedMeasurementToDraft({
        draftRoofSquares: 28.4,
        approvedRoofSquares: 32.1,
      }),
    ).toMatchObject({
      deltaSquares: 3.7,
      deltaPercent: 13,
      direction: "increased",
      severity: "material",
    });
  });

  it("treats small roof area changes as minor calibration noise", () => {
    expect(
      compareApprovedMeasurementToDraft({
        draftRoofSquares: 28.4,
        approvedRoofSquares: 28.9,
      }),
    ).toMatchObject({
      deltaSquares: 0.5,
      deltaPercent: 1.8,
      direction: "increased",
      severity: "minor",
    });
  });

  it("summarizes manual approval changes across area, pitch, waste, complexity, and structures", () => {
    const summary = buildApprovalChangeSummary({
      draftRoofSquares: 28.4,
      approvedRoofSquares: 32.1,
      draftPitchClass: "medium",
      approvedPitchClass: "steep",
      draftWastePercent: 12,
      approvedWastePercent: 15,
      draftComplexityClass: "moderate",
      approvedComplexityClass: "complex",
      draftIncludedStructures: ["main roof", "attached garage"],
      approvedIncludedStructures: ["main roof"],
    });

    expect(summary).toEqual([
      "Roof area increased by 3.7 squares (13.0%).",
      "Pitch changed from medium to steep.",
      "Waste changed from 12% to 15%.",
      "Complexity changed from moderate to complex.",
      "Removed attached garage from approved scope.",
    ]);
  });
});
