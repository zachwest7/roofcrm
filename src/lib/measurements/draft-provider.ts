import { calibrateDraftWithSources, type MeasurementSourceSignals } from "./source-stack";

export type MeasurementMode = "pre_quote_screening" | "quote_ready_review";

export type MeasurementStatus = "needs_review" | "ready_for_approval" | "approved";

export type PitchClass = "low" | "medium" | "steep" | "unknown";

export type ComplexityClass = "simple" | "moderate" | "complex";

export type RiskFlagCode =
  | "ADDRESS_ONLY"
  | "PITCH_ASSUMED"
  | "HUMAN_REVIEW_REQUIRED"
  | "DETACHED_STRUCTURE_INCLUDED"
  | "COMPLEXITY_FROM_NOTES"
  | "SOURCE_DISAGREEMENT"
  | "ADDRESS_UNVERIFIED"
  | "FOOTPRINT_ONLY";

export type MeasurementRiskFlag = {
  code: RiskFlagCode;
  label: string;
  severity: "low" | "medium" | "high";
  detail: string;
};

export type DraftMeasurementInput = {
  address: string;
  includeGarage: boolean;
  includeShed: boolean;
  mode: MeasurementMode;
  notes?: string;
  sourceSignals?: MeasurementSourceSignals;
};

export type AccuracyBand = {
  minPercent: number;
  maxPercent: number;
};

export type DraftMeasurement = {
  provider: "address_only_v1" | "google_solar_v1" | "public_footprint_v1" | "manual_review_v1";
  status: MeasurementStatus;
  mode: MeasurementMode;
  roofSquares: number;
  pitchClass: PitchClass;
  wastePercent: number;
  complexityClass: ComplexityClass;
  confidenceScore: number;
  includedStructures: string[];
  assumptions: string[];
  evidence: MeasurementEvidence[];
  riskFlags: MeasurementRiskFlag[];
  accuracyBand: AccuracyBand;
  sourceStackQuality: "address_only" | "footprint_backed" | "solar_backed" | "review_ready";
  sourceDisagreementPercent?: number;
};

export type MeasurementEvidence = {
  sourceType: "manual" | "public_data" | "provider_estimate" | "paid_api";
  label: string;
  detail: string;
  confidenceImpact: number;
};

const COMPLEXITY_TERMS = [
  "addition",
  "dormer",
  "valley",
  "skylight",
  "flat",
  "tile",
  "chimney",
  "multi",
];

export function generateDraftMeasurement(input: DraftMeasurementInput): DraftMeasurement {
  const notes = input.notes?.toLowerCase() ?? "";
  const complexityHits = COMPLEXITY_TERMS.filter((term) => notes.includes(term));
  const complexityClass = getComplexityClass(complexityHits.length, input.includeShed);
  const includedStructures = getIncludedStructures(input);
  const wastePercent = complexityClass === "complex" ? 15 : complexityClass === "moderate" ? 12 : 10;
  const roofSquares = estimateRoofSquares(input.address, input.includeGarage, input.includeShed, complexityClass);
  const riskFlags = getRiskFlags(input, complexityHits.length);

  const draft: DraftMeasurement = {
    provider: "address_only_v1",
    status: "needs_review",
    mode: input.mode,
    roofSquares,
    pitchClass: "medium",
    wastePercent,
    complexityClass,
    confidenceScore: getConfidenceScore(input, complexityHits.length),
    includedStructures,
    assumptions: [
      "Address-only draft uses a conservative single-family roof size baseline.",
      "Pitch is assumed until manager review or provider data confirms it.",
      "Waste factor is based on detected complexity clues and included structures.",
    ],
    evidence: [
      {
        sourceType: "manual",
        label: "Property intake",
        detail: input.address,
        confidenceImpact: 18,
      },
      {
        sourceType: "provider_estimate",
        label: "Address-only draft provider",
        detail: "V1 deterministic estimate; external imagery and roof facets not connected yet.",
        confidenceImpact: 22,
      },
    ],
    riskFlags,
    accuracyBand: { minPercent: 10, maxPercent: 25 },
    sourceStackQuality: "address_only",
  };

  return input.sourceSignals ? calibrateDraftWithSources(draft, input.sourceSignals) : draft;
}

function getComplexityClass(complexityHits: number, includeShed: boolean): ComplexityClass {
  if (complexityHits >= 4 || (includeShed && complexityHits >= 3)) {
    return "complex";
  }

  if (complexityHits >= 1 || includeShed) {
    return "moderate";
  }

  return "moderate";
}

function getIncludedStructures(input: DraftMeasurementInput): string[] {
  const structures = ["main roof"];

  if (input.includeGarage) {
    structures.push("attached garage");
  }

  if (input.includeShed) {
    structures.push("detached shed");
  }

  return structures;
}

function estimateRoofSquares(
  address: string,
  includeGarage: boolean,
  includeShed: boolean,
  complexityClass: ComplexityClass,
): number {
  const addressSeed = [...address].reduce((total, char) => total + char.charCodeAt(0), 0);
  const baseline = 22 + (addressSeed % 5);
  const garageSquares = includeGarage ? 3.2 : 0;
  const shedSquares = includeShed ? 1.4 : 0;
  const complexitySquares = complexityClass === "complex" ? 2.8 : 1.2;

  return roundToTenth(baseline + garageSquares + shedSquares + complexitySquares);
}

function getConfidenceScore(input: DraftMeasurementInput, complexityHits: number): number {
  let score = input.mode === "quote_ready_review" ? 45 : 42;

  if (input.includeGarage) {
    score -= 2;
  }

  if (input.includeShed) {
    score -= 6;
  }

  if (complexityHits > 0) {
    score -= Math.min(8, complexityHits * 2);
  }

  return Math.max(28, score);
}

function getRiskFlags(input: DraftMeasurementInput, complexityHits: number): MeasurementRiskFlag[] {
  const flags: MeasurementRiskFlag[] = [
    {
      code: "ADDRESS_ONLY",
      label: "Address-only estimate",
      severity: "high",
      detail: "No connected imagery, roof facets, parcel geometry, or pitch source has confirmed the draft.",
    },
    {
      code: "PITCH_ASSUMED",
      label: "Pitch assumed",
      severity: "medium",
      detail: "Pitch is set to medium until reviewed or replaced by provider data.",
    },
    {
      code: "HUMAN_REVIEW_REQUIRED",
      label: "Manager review required",
      severity: "high",
      detail: "V1 drafts cannot be approved without a manager confirming quote inputs.",
    },
  ];

  if (input.includeShed) {
    flags.push({
      code: "DETACHED_STRUCTURE_INCLUDED",
      label: "Detached structure included",
      severity: "medium",
      detail: "Shed coverage needs visual confirmation before quote inputs are approved.",
    });
  }

  if (complexityHits > 0) {
    flags.push({
      code: "COMPLEXITY_FROM_NOTES",
      label: "Complexity mentioned in notes",
      severity: complexityHits >= 4 ? "high" : "medium",
      detail: "Job notes mention roof features that can increase waste or measurement uncertainty.",
    });
  }

  return flags;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
