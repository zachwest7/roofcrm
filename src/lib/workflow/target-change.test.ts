import { describe, expect, it } from "vitest";

import {
  createGooglePlacesPropertyMatch,
  createManuallySelectedPropertyTarget,
} from "../measurements/property-match";
import type { WorkflowSnapshot } from "./types";
import { applyPropertyTargetChange, buildPropertyTargetChangeAuditSummary } from "./target-change";

describe("applyPropertyTargetChange", () => {
  it("updates the roof target and clears stale approval trace state", () => {
    const currentMatch = createGooglePlacesPropertyMatch({
      formattedAddress: "19024 Lake Lindsey Rd",
      latitude: 28.6281135,
      longitude: -82.4204728,
    });
    const nextMatch = createManuallySelectedPropertyTarget(currentMatch, {
      coordinates: { latitude: 28.6283135, longitude: -82.4201728 },
      checkedAt: "2026-06-08T18:00:00.000Z",
    });
    const snapshot = makeApprovedSnapshot(currentMatch);

    const result = applyPropertyTargetChange({
      intake: snapshot.property,
      snapshot,
      propertyMatch: nextMatch,
      message: "Target moved. Get Roof Snapshot again.",
      now: "2026-06-08T18:00:00.000Z",
    });

    expect(result.intake.propertyMatch).toEqual(nextMatch);
    expect(result.snapshot.property.propertyMatch).toEqual(nextMatch);
    expect(result.snapshot.property.status).toBe("needs_review");
    expect(result.snapshot.property.updatedAt).toBe("2026-06-08T18:00:00.000Z");
    expect(result.snapshot.draft.status).toBe("needs_review");
    expect(result.snapshot.approval).toBeUndefined();
    expect(result.snapshot.approvedSummary).toBeUndefined();
    expect(result.snapshot.persisted).toBe(false);
    expect(result.snapshot.persistenceMessage).toBe("Target moved. Get Roof Snapshot again.");
    expect(snapshot.approval?.manualMeasurements?.areaSqft).toBe(3385);
  });

  it("describes satellite map target taps for the audit history", () => {
    const currentMatch = createGooglePlacesPropertyMatch({
      formattedAddress: "19024 Lake Lindsey Rd",
      latitude: 28.6281135,
      longitude: -82.4204728,
    });
    const nextMatch = createManuallySelectedPropertyTarget(currentMatch, {
      coordinates: { latitude: 28.6283135, longitude: -82.4201728 },
      checkedAt: "2026-06-08T18:00:00.000Z",
    });

    expect(buildPropertyTargetChangeAuditSummary(nextMatch)).toBe(
      "Manual roof target selected on satellite map. Offset: 96 ft east, 73 ft north.",
    );
  });
});

function makeApprovedSnapshot(propertyMatch: WorkflowSnapshot["property"]["propertyMatch"]): WorkflowSnapshot {
  return {
    property: {
      id: "property-1",
      address: "19024 Lake Lindsey Rd",
      customerNotes: "",
      jobNotes: "",
      includeGarage: true,
      includeShed: false,
      mode: "pre_quote_screening",
      propertyMatch,
      status: "approved",
      createdAt: "2026-06-08T17:00:00.000Z",
      updatedAt: "2026-06-08T17:10:00.000Z",
    },
    draft: {
      id: "draft-1",
      propertyId: "property-1",
      provider: "google_solar_v1",
      status: "approved",
      mode: "pre_quote_screening",
      roofSquares: 31.7,
      pitchClass: "steep",
      wastePercent: 12,
      complexityClass: "moderate",
      confidenceScore: 92,
      includedStructures: ["main roof", "attached garage"],
      assumptions: [],
      evidence: [],
      riskFlags: [],
      accuracyBand: { minPercent: 3, maxPercent: 8 },
      sourceStackQuality: "solar_backed",
      roofSegments: [],
      generatedAt: "2026-06-08T17:00:00.000Z",
    },
    approval: {
      id: "approval-1",
      propertyId: "property-1",
      draftId: "draft-1",
      approvedRoofSquares: 33.9,
      approvedPitchClass: "medium",
      approvedWastePercent: 12,
      approvedComplexityClass: "moderate",
      confidenceScore: 82,
      includedStructures: ["main roof", "attached garage"],
      correctionSummary: ["Trace applied."],
      manualMeasurements: {
        source: "manual_geometry",
        areaSqft: 3385,
        roofSquares: 33.9,
        detail: "Area and edge lengths are derived from the manager-adjusted outline geometry.",
        lengthTotals: {
          eavesFt: 121.2,
          rakesFt: 134,
          hipsFt: 0,
          ridgesFt: 0,
          valleysFt: 0,
          flashingFt: 0,
          eavesAndRakesFt: 255.2,
          hipsAndRidgesFt: 0,
        },
        edgeRows: [],
      },
      reviewerName: "Zach",
      reviewerNotes: "",
      approvedAt: "2026-06-08T17:10:00.000Z",
    },
    sourceReadiness: [],
    auditEvents: [],
    approvedSummary: "Approved old trace.",
    persisted: true,
    persistenceMessage: "Loaded from Supabase.",
  };
}
