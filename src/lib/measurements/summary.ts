import type { ComplexityClass, PitchClass } from "./draft-provider";

export type ApprovedMeasurementSummaryInput = {
  propertyAddress: string;
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
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
    `Confidence: ${input.confidenceScore}%`,
    `Reviewer: ${input.reviewerName}`,
    `Approved at: ${approvedDate}`,
    input.reviewerNotes ? `Reviewer notes: ${input.reviewerNotes}` : "Reviewer notes: None",
  ].join("\n");
}
