import { describe, expect, it } from "vitest";

import type { WorkflowSnapshot } from "./types";
import { createSavedJobSummary, sortSavedJobSummaries } from "./saved-jobs";

describe("saved job summaries", () => {
  it("summarizes roof size, status, and manual adjustment state", () => {
    const summary = createSavedJobSummary(
      makeSnapshot({
        id: "job-1",
        address: "456 Field St",
        status: "approved",
        roofSquares: 31.4,
        updatedAt: "2026-06-08T15:30:00.000Z",
        hasManualMeasurements: true,
      }),
    );

    expect(summary).toEqual({
      id: "job-1",
      address: "456 Field St",
      status: "approved",
      roofSquares: 31.4,
      confidenceScore: 78,
      updatedAt: "2026-06-08T15:30:00.000Z",
      persisted: true,
      hasManualAdjustments: true,
    });
  });

  it("sorts newest saved jobs first", () => {
    const summaries = sortSavedJobSummaries([
      createSavedJobSummary(makeSnapshot({ id: "older", updatedAt: "2026-06-08T14:00:00.000Z" })),
      createSavedJobSummary(makeSnapshot({ id: "newer", updatedAt: "2026-06-08T16:00:00.000Z" })),
    ]);

    expect(summaries.map((summary) => summary.id)).toEqual(["newer", "older"]);
  });
});

function makeSnapshot(
  overrides: Partial<{
    id: string;
    address: string;
    status: WorkflowSnapshot["property"]["status"];
    roofSquares: number;
    updatedAt: string;
    hasManualMeasurements: boolean;
  }> = {},
): WorkflowSnapshot {
  const propertyId = overrides.id ?? "job";
  const draftId = `${propertyId}-draft`;

  return {
    property: {
      id: propertyId,
      address: overrides.address ?? "123 Test Ave",
      customerNotes: "",
      jobNotes: "",
      includeGarage: true,
      includeShed: false,
      mode: "pre_quote_screening",
      propertyMatch: {
        status: "typed_only",
        source: "manual",
        formattedAddress: overrides.address ?? "123 Test Ave",
        detail: "Typed address only.",
      },
      status: overrides.status ?? "needs_review",
      createdAt: "2026-06-08T13:00:00.000Z",
      updatedAt: overrides.updatedAt ?? "2026-06-08T13:00:00.000Z",
    },
    draft: {
      id: draftId,
      propertyId,
      provider: "address_only_v1",
      status: "needs_review",
      mode: "pre_quote_screening",
      roofSquares: overrides.roofSquares ?? 24.6,
      pitchClass: "medium",
      wastePercent: 12,
      complexityClass: "moderate",
      confidenceScore: 78,
      includedStructures: ["main roof", "attached garage"],
      assumptions: [],
      evidence: [],
      riskFlags: [],
      accuracyBand: { minPercent: 10, maxPercent: 25 },
      sourceStackQuality: "address_only",
      roofSegments: [],
      generatedAt: "2026-06-08T13:05:00.000Z",
    },
    approval: overrides.hasManualMeasurements
      ? {
          id: `${propertyId}-approval`,
          propertyId,
          draftId,
          approvedRoofSquares: overrides.roofSquares ?? 24.6,
          approvedPitchClass: "medium",
          approvedWastePercent: 12,
          approvedComplexityClass: "moderate",
          confidenceScore: 78,
          includedStructures: ["main roof", "attached garage"],
          correctionSummary: ["Reviewer adjusted roof outline."],
          manualMeasurements: {
            source: "manual_geometry",
            areaSqft: 3140,
            roofSquares: overrides.roofSquares ?? 31.4,
            detail: "Area and edge lengths are derived from the manager-adjusted outline geometry.",
            lengthTotals: {
              eavesFt: 100,
              rakesFt: 80,
              hipsFt: 60,
              ridgesFt: 30,
              valleysFt: 20,
              flashingFt: 10,
              eavesAndRakesFt: 180,
              hipsAndRidgesFt: 90,
            },
            edgeRows: [],
          },
          reviewerName: "Zach",
          reviewerNotes: "",
          approvedAt: "2026-06-08T15:30:00.000Z",
        }
      : undefined,
    sourceReadiness: [],
    auditEvents: [],
    persisted: true,
    persistenceMessage: "Saved to Supabase.",
  };
}
