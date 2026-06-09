import type {
  AccuracyBand,
  ComplexityClass,
  PitchClass,
  RoofSegmentMeasurement,
} from "./draft-provider";
import type { ManualRoofMeasurements } from "./manual-geometry";
import type { PropertyMatch } from "./property-match";
import type { AutoRoofOutline } from "./solar-mask-outline";
import type { SolarRasterPreview } from "./solar-raster-preview";

export type MeasurementReportInput = {
  propertyAddress: string;
  customerNotes: string;
  jobNotes: string;
  reviewerName: string;
  reviewerNotes: string;
  approvedAt?: string;
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
  includedStructures: string[];
  sourceStackQuality: string;
  accuracyBand: AccuracyBand;
  propertyMatch?: PropertyMatch;
  roofSegments: RoofSegmentMeasurement[];
  autoRoofOutline?: AutoRoofOutline;
  solarRasterPreview?: SolarRasterPreview;
  manualMeasurements?: ManualRoofMeasurements;
  generatedAt: string;
};

export type MeasurementLengthTotals = {
  eavesFt: number;
  valleysFt: number;
  hipsFt: number;
  ridgesFt: number;
  rakesFt: number;
  wallFlashingFt: number;
  stepFlashingFt: number;
  transitionsFt: number;
  parapetWallsFt: number;
  unspecifiedFt: number;
  hipsAndRidgesFt: number;
  eavesAndRakesFt: number;
};

export type MeasurementReport = {
  cover: {
    title: string;
    propertyAddress: string;
    totalRoofAreaSqft: number;
    roofSquares: number;
    totalFacets: number;
    autoOutlinePolygons: number;
    predominantPitch: PitchClass;
    confidenceScore: number;
    sourceStackQuality: string;
    accuracyLabel: string;
    approvalStatusLabel: string;
    targetStatusLabel: string;
    targetCorrectionLabel: string;
    targetCoordinateLabel: string;
    disclaimer: string;
    generatedAtLabel: string;
  };
  measurements: MeasurementLengthTotals;
  pitchRows: Array<{
    pitch: PitchClass;
    areaSqft: number;
    squares: number;
  }>;
  wasteScenarios: WasteScenario[];
  materialSections: MaterialEstimateSection[];
  facetRows: MeasurementReportFacet[];
  sourceRows: MeasurementReportSourceRow[];
  autoRoofOutline?: AutoRoofOutline;
  solarRasterPreview?: SolarRasterPreview;
  manualMeasurements?: ManualRoofMeasurements;
  notes: string[];
  reviewer: {
    name: string;
    notes: string;
  };
};

export type MeasurementReportSourceRow = {
  label: string;
  value: string;
  source: string;
  status: "review_input" | "provider_estimate" | "proposed" | "heuristic";
  detail: string;
};

export type MeasurementReportFacet = {
  label: string;
  structure: string;
  pitchLabel: string;
  areaSqft: number;
  squares: number;
  boundingBox?: RoofSegmentMeasurement["boundingBox"];
};

export type WasteScenario = {
  percent: number;
  areaSqft: number;
  squares: number;
  isRecommended: boolean;
};

export type MaterialEstimateSection = {
  title: string;
  rows: MaterialEstimateRow[];
};

export type MaterialEstimateRow = {
  product: string;
  unit: string;
  quantities: Record<number, string>;
  isGroup?: boolean;
};

const SHINGLE_PRODUCTS = [
  { name: "IKO Cambridge", coverageSqft: 33.3 },
  { name: "CertainTeed Landmark", coverageSqft: 33.3 },
  { name: "GAF Timberline", coverageSqft: 33.3 },
  { name: "Owens Corning Duration", coverageSqft: 33.3 },
  { name: "BP Mystique", coverageSqft: 33.3 },
];

const STARTER_PRODUCTS = [
  { name: "IKO Leading Edge Plus", coverageFt: 123 },
  { name: "CertainTeed SwiftStart", coverageFt: 100 },
  { name: "GAF Pro-Start", coverageFt: 120 },
  { name: "Owens Corning Starter Strip", coverageFt: 100 },
  { name: "BP Starter Strip", coverageFt: 75 },
];

const ROLL_PRODUCTS = [
  { name: "IKO StormShield", coverageFt: 65 },
  { name: "CertainTeed WinterGuard", coverageFt: 65 },
  { name: "GAF WeatherWatch", coverageFt: 67 },
  { name: "Owens Corning WeatherLock", coverageFt: 72 },
  { name: "BP Weathertex", coverageFt: 65 },
];

const SYNTHETIC_PRODUCTS = [
  { name: "IKO Stormtite", coverageSqft: 1000 },
  { name: "CertainTeed RoofRunner", coverageSqft: 1000 },
  { name: "GAF Deck-Armor", coverageSqft: 1000 },
  { name: "Owens Corning RhinoRoof", coverageSqft: 1000 },
  { name: "BP PRODECK", coverageSqft: 1000 },
];

const RIDGE_PRODUCTS = [
  { name: "IKO Hip and Ridge", coverageFt: 33 },
  { name: "CertainTeed Shadow Ridge", coverageFt: 31 },
  { name: "GAF Seal-A-Ridge", coverageFt: 25 },
  { name: "Owens Corning DecoRidge", coverageFt: 20 },
  { name: "BP Accu-Ridge", coverageFt: 33 },
];

export function buildMeasurementReport(input: MeasurementReportInput): MeasurementReport {
  const roofSquares = roundToTenth(input.approvedRoofSquares);
  const totalRoofAreaSqft = roofSquaresToSquareFeet(roofSquares);
  const measurements = input.manualMeasurements?.lengthTotals ?? buildLengthTotals(roofSquares, input.approvedComplexityClass);
  const wasteScenarios = buildWasteScenarios(roofSquares, input.approvedWastePercent);
  const facetRows = buildFacetRows(input.roofSegments, roofSquares, input.approvedPitchClass, input.includedStructures);
  const autoOutlinePolygons = input.autoRoofOutline?.polygons.length ?? 0;

  return {
    cover: {
      title: "Roof Measurement Report",
      propertyAddress: input.propertyAddress,
      totalRoofAreaSqft,
      roofSquares,
      totalFacets: facetRows.length,
      autoOutlinePolygons,
      predominantPitch: input.approvedPitchClass,
      confidenceScore: input.confidenceScore,
      sourceStackQuality: input.sourceStackQuality,
      accuracyLabel: formatAccuracyBand(input.accuracyBand),
      approvalStatusLabel: formatApprovalStatus(input.approvedAt),
      targetStatusLabel: formatPropertyTargetStatus(input.propertyMatch),
      targetCorrectionLabel: formatTargetCorrection(input.propertyMatch),
      targetCoordinateLabel: formatTargetCoordinates(input.propertyMatch),
      disclaimer:
        "This report is a reviewed quote estimate for sales and scope review. It is not a fully automated production takeoff or final material order.",
      generatedAtLabel: formatReportDate(input.generatedAt),
    },
    measurements,
    pitchRows: [
      {
        pitch: input.approvedPitchClass,
        areaSqft: totalRoofAreaSqft,
        squares: roofSquares,
      },
    ],
    wasteScenarios,
    materialSections: buildMaterialEstimateSections(wasteScenarios, measurements),
    facetRows,
    sourceRows: buildSourceRows(input, totalRoofAreaSqft, roofSquares, facetRows, measurements),
    autoRoofOutline: input.autoRoofOutline,
    solarRasterPreview: input.solarRasterPreview,
    manualMeasurements: input.manualMeasurements,
    notes: [
      "Measurements are rounded for report readability. Quote inputs should be reviewed against source imagery before ordering materials.",
      input.customerNotes ? `Customer notes: ${input.customerNotes}` : "Customer notes: none.",
      input.jobNotes ? `Job notes: ${input.jobNotes}` : "Job notes: none.",
    ],
    reviewer: {
      name: input.reviewerName || "Owner",
      notes: input.reviewerNotes || "No reviewer notes entered.",
    },
  };
}

export function roofSquaresToSquareFeet(squares: number): number {
  return Math.round(squares * 100);
}

export function buildWasteScenarios(baseSquares: number, recommendedWastePercent: number): WasteScenario[] {
  const percents = Array.from(new Set([0, 10, 12, recommendedWastePercent, 15, 20]))
    .filter((percent) => Number.isFinite(percent) && percent >= 0)
    .sort((left, right) => left - right);

  return percents.map((percent) => {
    const areaSqft = Math.round(roofSquaresToSquareFeet(baseSquares) * (1 + percent / 100));

    return {
      percent,
      areaSqft,
      squares: roundToTenth(areaSqft / 100),
      isRecommended: percent === recommendedWastePercent,
    };
  });
}

export function formatFeetAndInches(value: number): string {
  const feet = Math.floor(value);
  const inches = Math.round((value - feet) * 12);

  if (inches === 12) {
    return `${feet + 1}ft 0in`;
  }

  return `${feet}ft ${inches}in`;
}

function buildLengthTotals(roofSquares: number, complexityClass: ComplexityClass): MeasurementLengthTotals {
  const multiplier = complexityClass === "complex" ? 1.22 : complexityClass === "simple" ? 0.86 : 1;
  const eavesFt = roundToTenth(roofSquares * 4.8);
  const rakesFt = roundToTenth(roofSquares * 2.2 * multiplier);
  const hipsFt = roundToTenth(roofSquares * 2.5 * multiplier);
  const ridgesFt = roundToTenth(roofSquares * 2.2);
  const valleysFt = roundToTenth(roofSquares * 1.5 * multiplier);
  const wallFlashingFt = roundToTenth(roofSquares * 0.35 * multiplier);
  const stepFlashingFt = roundToTenth(roofSquares * 0.85 * multiplier);
  const transitionsFt = complexityClass === "complex" ? roundToTenth(roofSquares * 0.35) : 0;
  const parapetWallsFt = 0;
  const unspecifiedFt = roundToTenth(roofSquares * 0.35);

  return {
    eavesFt,
    valleysFt,
    hipsFt,
    ridgesFt,
    rakesFt,
    wallFlashingFt,
    stepFlashingFt,
    transitionsFt,
    parapetWallsFt,
    unspecifiedFt,
    hipsAndRidgesFt: roundToTenth(hipsFt + ridgesFt),
    eavesAndRakesFt: roundToTenth(eavesFt + rakesFt),
  };
}

function buildFacetRows(
  roofSegments: RoofSegmentMeasurement[],
  roofSquares: number,
  pitchClass: PitchClass,
  includedStructures: string[],
): MeasurementReportFacet[] {
  if (roofSegments.length) {
    return roofSegments.map((segment, index) => ({
      label: String.fromCharCode(65 + index),
      structure: "main roof",
      pitchLabel: formatSegmentPitch(segment.pitchDegrees, pitchClass),
      areaSqft: roofSquaresToSquareFeet(segment.squares),
      squares: segment.squares,
      boundingBox: segment.boundingBox,
    }));
  }

  const structures = includedStructures.length ? includedStructures : ["main roof"];
  const rows = [
    { share: 0.36, label: "A", structure: structures[0] ?? "main roof" },
    { share: 0.34, label: "B", structure: structures[0] ?? "main roof" },
    { share: 0.2, label: "C", structure: structures[1] ?? "garage/addition" },
    { share: 0.1, label: "D", structure: "small facets" },
  ];

  return rows.map((row) => {
    const squares = roundToTenth(roofSquares * row.share);

    return {
      label: row.label,
      structure: row.structure,
      pitchLabel: pitchClass,
      areaSqft: roofSquaresToSquareFeet(squares),
      squares,
    };
  });
}

function buildSourceRows(
  input: MeasurementReportInput,
  totalRoofAreaSqft: number,
  roofSquares: number,
  facetRows: MeasurementReportFacet[],
  measurements: MeasurementLengthTotals,
): MeasurementReportSourceRow[] {
  const rows: MeasurementReportSourceRow[] = [
    {
      label: "Quote roof area",
      value: `${totalRoofAreaSqft.toLocaleString()} sqft`,
      source: "Review input",
      status: "review_input",
      detail: `${roofSquares.toFixed(1)} squares carried into the quote packet from the current review inputs.`,
    },
    {
      label: "Pitch class",
      value: input.approvedPitchClass,
      source: "Review input",
      status: "review_input",
      detail: "Uses the approved pitch class unless a manager changes it before quote approval.",
    },
  ];

  if (input.roofSegments.length) {
    const segmentAreaSqft = facetRows.reduce((total, row) => total + row.areaSqft, 0);

    rows.push({
      label: "Solar roof segments",
      value: `${facetRows.length} facets / ${segmentAreaSqft.toLocaleString()} sqft`,
      source: "Google Solar roof segment stats",
      status: "provider_estimate",
      detail: "Facet count, pitch labels, and segment areas come from provider roof segment stats, then remain subject to manager review.",
    });
  } else {
    rows.push({
      label: "Facet split",
      value: `${facetRows.length} estimated facets`,
      source: "Report heuristic",
      status: "heuristic",
      detail: "Facet rows are a report-only split because no roof segment source was available.",
    });
  }

  if (input.autoRoofOutline) {
    rows.push({
      label: "Auto roof outline",
      value: formatAutoOutlineValue(input.autoRoofOutline),
      source: "Google Solar roof mask",
      status: "proposed",
      detail: "The outline is a proposed mask boundary, not a confirmed roof facet diagram.",
    });
  }

  if (input.solarRasterPreview) {
    rows.push({
      label: "Solar imagery overlay",
      value: formatSolarRasterPreviewValue(input.solarRasterPreview),
      source: "Google Solar RGB + roof mask",
      status: "provider_estimate",
      detail: "Rendered Solar RGB imagery with the roof mask tinted underneath the proposed outline for visual review.",
    });
  }

  if (input.manualMeasurements) {
    rows.push({
      label: "Manual geometry trace",
      value: `${input.manualMeasurements.areaSqft.toLocaleString()} sqft / ${input.manualMeasurements.edgeRows.length} traced edges`,
      source: "Reviewer-adjusted outline",
      status: "review_input",
      detail: "Area and edge lengths are derived from the manager-adjusted roof outline geometry.",
    });
  }

  rows.push(
    {
      label: "Length totals",
      value: `${formatFeetAndInches(measurements.eavesAndRakesFt)} eaves + rakes`,
      source: input.manualMeasurements ? "Reviewer-adjusted outline" : "Report heuristic",
      status: input.manualMeasurements ? "review_input" : "heuristic",
      detail: input.manualMeasurements
        ? "Eaves, rakes, hips, and other edge totals are calculated from traced geometry."
        : "Eaves, rakes, valleys, hips, ridges, and flashings are estimated from approved area and complexity until manually traced.",
    },
    {
      label: "Waste factor",
      value: `${input.approvedWastePercent}%`,
      source: "Review input",
      status: "review_input",
      detail: "Waste is approved by the reviewer and used to generate material quantities.",
    },
  );

  return rows;
}

function formatSolarRasterPreviewValue(preview: SolarRasterPreview) {
  return `${preview.imageWidth} x ${preview.imageHeight} px / ${preview.roofPixels.toLocaleString()} roof pixels`;
}

function formatAutoOutlineValue(outline: AutoRoofOutline) {
  const polygonLabel = `${outline.polygons.length} ${outline.polygons.length === 1 ? "polygon" : "polygons"}`;

  if (typeof outline.areaSqft === "number") {
    return `${polygonLabel} / ${outline.areaSqft.toLocaleString()} sqft mask area`;
  }

  return `${polygonLabel} / ${outline.areaPixels.toLocaleString()} mask pixels`;
}

function buildMaterialEstimateSections(
  wasteScenarios: WasteScenario[],
  measurements: MeasurementLengthTotals,
): MaterialEstimateSection[] {
  return [
    {
      title: "Roofing",
      rows: [
        {
          product: "Shingle total",
          unit: "sqft",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) => `${scenario.areaSqft.toLocaleString()} sqft`),
          isGroup: true,
        },
        ...SHINGLE_PRODUCTS.map((product) => ({
          product: product.name,
          unit: "bundle",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            String(Math.ceil(scenario.areaSqft / product.coverageSqft)),
          ),
        })),
      ],
    },
    {
      title: "Starter",
      rows: [
        {
          product: "Starter (eaves + rakes)",
          unit: "ft",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            `${Math.round(measurements.eavesAndRakesFt * (1 + scenario.percent / 100))} ft`,
          ),
          isGroup: true,
        },
        ...STARTER_PRODUCTS.map((product) => ({
          product: product.name,
          unit: "bundle",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            String(Math.ceil((measurements.eavesAndRakesFt * (1 + scenario.percent / 100)) / product.coverageFt)),
          ),
        })),
      ],
    },
    {
      title: "Underlayment",
      rows: [
        {
          product: "Ice and water (eaves + valleys + flashings)",
          unit: "ft",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            `${Math.round(getIceAndWaterFeet(measurements) * (1 + scenario.percent / 100))} ft`,
          ),
          isGroup: true,
        },
        ...ROLL_PRODUCTS.map((product) => ({
          product: product.name,
          unit: "roll",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            String(Math.ceil((getIceAndWaterFeet(measurements) * (1 + scenario.percent / 100)) / product.coverageFt)),
          ),
        })),
        {
          product: "Synthetic total",
          unit: "sqft",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) => `${scenario.areaSqft.toLocaleString()} sqft`),
          isGroup: true,
        },
        ...SYNTHETIC_PRODUCTS.map((product) => ({
          product: product.name,
          unit: "roll",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            String(Math.ceil(scenario.areaSqft / product.coverageSqft)),
          ),
        })),
      ],
    },
    {
      title: "Accessories",
      rows: [
        {
          product: "Capping (hips + ridges)",
          unit: "ft",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            `${Math.round(measurements.hipsAndRidgesFt * (1 + scenario.percent / 100))} ft`,
          ),
          isGroup: true,
        },
        ...RIDGE_PRODUCTS.map((product) => ({
          product: product.name,
          unit: "bundle",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            String(Math.ceil((measurements.hipsAndRidgesFt * (1 + scenario.percent / 100)) / product.coverageFt)),
          ),
        })),
        {
          product: "8' Valley (no laps)",
          unit: "sheet",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            String(Math.ceil((measurements.valleysFt * (1 + scenario.percent / 100)) / 8)),
          ),
        },
        {
          product: "10' Drip Edge (eaves + rakes; no laps)",
          unit: "sheet",
          quantities: mapWasteQuantities(wasteScenarios, (scenario) =>
            String(Math.ceil((measurements.eavesAndRakesFt * (1 + scenario.percent / 100)) / 10)),
          ),
        },
      ],
    },
  ];
}

function mapWasteQuantities(
  wasteScenarios: WasteScenario[],
  getValue: (scenario: WasteScenario) => string,
): Record<number, string> {
  return wasteScenarios.reduce<Record<number, string>>((quantities, scenario) => {
    quantities[scenario.percent] = getValue(scenario);

    return quantities;
  }, {});
}

function getIceAndWaterFeet(measurements: MeasurementLengthTotals): number {
  return roundToTenth(
    measurements.eavesFt + measurements.valleysFt + measurements.wallFlashingFt + measurements.stepFlashingFt,
  );
}

function formatSegmentPitch(pitchDegrees: number | undefined, fallback: PitchClass) {
  if (typeof pitchDegrees !== "number") {
    return fallback;
  }

  return `${Math.round((pitchDegrees / 45) * 12)}/12`;
}

function formatAccuracyBand(band: AccuracyBand) {
  if (band.minPercent === band.maxPercent) {
    return `+/- ${band.maxPercent}%`;
  }

  return `+/- ${band.minPercent}-${band.maxPercent}%`;
}

function formatApprovalStatus(approvedAt?: string) {
  return approvedAt ? `Approved ${formatReportDate(approvedAt)}` : "Draft review packet";
}

function formatPropertyTargetStatus(match?: PropertyMatch) {
  const labels: Record<PropertyMatch["status"], string> = {
    typed_only: "Typed address only",
    selected_from_google: "Selected from Google",
    validated: "Validated property",
    needs_confirmation: "Needs confirmation",
    validation_failed: "Validation failed",
  };

  return match ? labels[match.status] : "No property target";
}

function formatTargetCorrection(match?: PropertyMatch) {
  const correction = match?.targetCorrection;

  if (!correction) {
    return "No manual target correction";
  }

  const method = correction.method === "map_tap" ? "Map tap" : "Nudge";
  const offset = formatTargetOffset(correction.totalEastFeet, correction.totalNorthFeet);

  return offset ? `${method}: ${offset}` : method;
}

function formatTargetOffset(totalEastFeet: number, totalNorthFeet: number) {
  const parts = [];

  if (totalEastFeet !== 0) {
    parts.push(`${Math.abs(totalEastFeet).toFixed(0)} ft ${totalEastFeet > 0 ? "east" : "west"}`);
  }

  if (totalNorthFeet !== 0) {
    parts.push(`${Math.abs(totalNorthFeet).toFixed(0)} ft ${totalNorthFeet > 0 ? "north" : "south"}`);
  }

  return parts.join(", ");
}

function formatTargetCoordinates(match?: PropertyMatch) {
  if (typeof match?.latitude !== "number" || typeof match.longitude !== "number") {
    return "Coordinates unavailable";
  }

  return `${match.latitude.toFixed(6)}, ${match.longitude.toFixed(6)}`;
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
