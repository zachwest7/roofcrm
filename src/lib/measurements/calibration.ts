import type { ComplexityClass, PitchClass } from "./draft-provider";

export type CalibrationSeverity = "none" | "minor" | "material" | "major";

export type ApprovalAreaComparison = {
  draftRoofSquares: number;
  approvedRoofSquares: number;
  deltaSquares: number;
  deltaPercent: number;
  direction: "increased" | "decreased" | "unchanged";
  severity: CalibrationSeverity;
  detail: string;
};

export type ApprovalChangeSummaryInput = {
  draftRoofSquares: number;
  approvedRoofSquares: number;
  draftPitchClass: PitchClass;
  approvedPitchClass: PitchClass;
  draftWastePercent: number;
  approvedWastePercent: number;
  draftComplexityClass: ComplexityClass;
  approvedComplexityClass: ComplexityClass;
  draftIncludedStructures: string[];
  approvedIncludedStructures: string[];
};

export function compareApprovedMeasurementToDraft(input: {
  draftRoofSquares: number;
  approvedRoofSquares: number;
}): ApprovalAreaComparison {
  const deltaSquares = roundToTenth(input.approvedRoofSquares - input.draftRoofSquares);
  const deltaPercent =
    input.draftRoofSquares > 0 ? roundToTenth((Math.abs(deltaSquares) / input.draftRoofSquares) * 100) : 0;
  const direction = deltaSquares > 0 ? "increased" : deltaSquares < 0 ? "decreased" : "unchanged";
  const severity = getCalibrationSeverity(deltaPercent);

  return {
    draftRoofSquares: roundToTenth(input.draftRoofSquares),
    approvedRoofSquares: roundToTenth(input.approvedRoofSquares),
    deltaSquares,
    deltaPercent,
    direction,
    severity,
    detail:
      direction === "unchanged"
        ? "Reviewer kept the draft roof area."
        : `Reviewer ${direction} roof area by ${Math.abs(deltaSquares).toFixed(1)} squares (${deltaPercent.toFixed(1)}%).`,
  };
}

export function buildApprovalChangeSummary(input: ApprovalChangeSummaryInput): string[] {
  const changes: string[] = [];
  const areaComparison = compareApprovedMeasurementToDraft(input);

  if (areaComparison.direction !== "unchanged") {
    changes.push(
      `Roof area ${areaComparison.direction} by ${Math.abs(areaComparison.deltaSquares).toFixed(1)} squares (${areaComparison.deltaPercent.toFixed(1)}%).`,
    );
  }

  if (input.draftPitchClass !== input.approvedPitchClass) {
    changes.push(`Pitch changed from ${input.draftPitchClass} to ${input.approvedPitchClass}.`);
  }

  if (input.draftWastePercent !== input.approvedWastePercent) {
    changes.push(`Waste changed from ${input.draftWastePercent}% to ${input.approvedWastePercent}%.`);
  }

  if (input.draftComplexityClass !== input.approvedComplexityClass) {
    changes.push(`Complexity changed from ${input.draftComplexityClass} to ${input.approvedComplexityClass}.`);
  }

  const removedStructures = input.draftIncludedStructures.filter(
    (structure) => !input.approvedIncludedStructures.includes(structure),
  );
  const addedStructures = input.approvedIncludedStructures.filter(
    (structure) => !input.draftIncludedStructures.includes(structure),
  );

  for (const structure of removedStructures) {
    changes.push(`Removed ${structure} from approved scope.`);
  }

  for (const structure of addedStructures) {
    changes.push(`Added ${structure} to approved scope.`);
  }

  return changes.length ? changes : ["Reviewer kept the draft quote inputs."];
}

function getCalibrationSeverity(deltaPercent: number): CalibrationSeverity {
  if (deltaPercent === 0) {
    return "none";
  }

  if (deltaPercent < 2) {
    return "minor";
  }

  if (deltaPercent < 15) {
    return "material";
  }

  return "major";
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}
