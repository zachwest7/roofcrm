import type { ComplexityClass, PitchClass } from "./draft-provider";
import type { ManualRoofMeasurements } from "./manual-geometry";

export type ApprovedMeasurementSummaryInput = {
  propertyAddress: string;
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
  includedStructures?: string[];
  correctionSummary?: string[];
  manualMeasurements?: ManualRoofMeasurements;
  reviewerName: string;
  reviewerNotes?: string;
  approvedAt: Date;
};

export function formatApprovedMeasurementSummary(input: ApprovedMeasurementSummaryInput): string {
  const approvedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(input.approvedAt);

  return [
    "Approved roof measurement summary",
    `Property: ${input.propertyAddress}`,
    `Approved roof area: ${input.approvedRoofSquares.toFixed(1)} squares`,
    `Pitch: ${input.approvedPitchClass}`,
    `Waste: ${input.approvedWastePercent}%`,
    `Complexity: ${input.approvedComplexityClass}`,
    `Included structures: ${input.includedStructures?.length ? input.includedStructures.join(", ") : "Not specified"}`,
    `Corrections: ${input.correctionSummary?.length ? input.correctionSummary.join(" ") : "Reviewer kept the draft quote inputs."}`,
    ...(input.manualMeasurements
      ? [
          `Manual geometry area: ${input.manualMeasurements.areaSqft.toLocaleString()} sqft / ${input.manualMeasurements.roofSquares.toFixed(1)} squares`,
          `Manual eaves/rakes: ${formatFeetAndInches(input.manualMeasurements.lengthTotals.eavesAndRakesFt)}`,
          `Manual hips/ridges: ${formatFeetAndInches(input.manualMeasurements.lengthTotals.hipsAndRidgesFt)}`,
        ]
      : []),
    `Confidence: ${input.confidenceScore}%`,
    `Reviewer: ${input.reviewerName}`,
    `Approved at: ${approvedDate}`,
    input.reviewerNotes ? `Reviewer notes: ${input.reviewerNotes}` : "Reviewer notes: None",
  ].join("\n");
}

function formatFeetAndInches(value: number): string {
  const feet = Math.floor(value);
  const inches = Math.round((value - feet) * 12);

  if (inches === 12) {
    return `${feet + 1}ft 0in`;
  }

  return `${feet}ft ${inches}in`;
}
