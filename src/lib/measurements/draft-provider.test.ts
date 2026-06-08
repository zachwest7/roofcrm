import { describe, expect, it } from "vitest";

import { generateDraftMeasurement } from "./draft-provider";

describe("generateDraftMeasurement", () => {
  it("creates a conservative needs-review draft from property intake", () => {
    const draft = generateDraftMeasurement({
      address: "123 Cypress Point Dr, Boca Raton, FL",
      includeGarage: true,
      includeShed: false,
      mode: "pre_quote_screening",
      notes: "Customer says roof is original and has a flat rear addition.",
    });

    expect(draft.status).toBe("needs_review");
    expect(draft.roofSquares).toBeGreaterThan(22);
    expect(draft.roofSquares).toBeLessThan(32);
    expect(draft.pitchClass).toBe("medium");
    expect(draft.wastePercent).toBe(12);
    expect(draft.complexityClass).toBe("moderate");
    expect(draft.confidenceScore).toBeLessThanOrEqual(48);
    expect(draft.includedStructures).toContain("attached garage");
    expect(draft.riskFlags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining(["ADDRESS_ONLY", "PITCH_ASSUMED", "HUMAN_REVIEW_REQUIRED"]),
    );
  });

  it("raises complexity and waste when notes mention additions or multiple roof shapes", () => {
    const draft = generateDraftMeasurement({
      address: "88 NE 5th Ave, Boca Raton, FL",
      includeGarage: false,
      includeShed: true,
      mode: "quote_ready_review",
      notes: "Detached shed, dormers, multiple valleys, skylight, and rear addition.",
    });

    expect(draft.complexityClass).toBe("complex");
    expect(draft.wastePercent).toBe(15);
    expect(draft.includedStructures).toContain("detached shed");
    expect(draft.riskFlags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining(["DETACHED_STRUCTURE_INCLUDED", "COMPLEXITY_FROM_NOTES"]),
    );
  });
});
