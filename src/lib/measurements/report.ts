import type {
  AccuracyBand,
  ComplexityClass,
  PitchClass,
  RoofSegmentMeasurement,
} from "./draft-provider";
import type { AutoRoofOutline } from "./solar-mask-outline";

export type MeasurementReportInput = {
  propertyAddress: string;
  customerNotes: string;
  jobNotes: string;
  reviewerName: string;
  reviewerNotes: string;
  approvedRoofSquares: number;
  approvedPitchClass: PitchClass;
  approvedWastePercent: number;
  approvedComplexityClass: ComplexityClass;
  confidenceScore: number;
  includedStructures: string[];
  sourceStackQuality: string;
  accuracyBand: AccuracyBand;
  roofSegments: RoofSegmentMeasurement[];
  autoRoofOutline?: AutoRoofOutline;
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
    predominantPitch: PitchClass;
    confidenceScore: number;
    sourceStackQuality: string;
    accuracyLabel: string;
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
  autoRoofOutline?: AutoRoofOutline;
  notes: string[];
  reviewer: {
    name: string;
    notes: string;
  };
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
  const measurements = buildLengthTotals(roofSquares, input.approvedComplexityClass);
  const wasteScenarios = buildWasteScenarios(roofSquares, input.approvedWastePercent);
  const facetRows = buildFacetRows(input.roofSegments, roofSquares, input.approvedPitchClass, input.includedStructures);
  const totalFacets = input.autoRoofOutline?.polygons.length ?? facetRows.length;

  return {
    cover: {
      title: "Roof Measurement Report",
      propertyAddress: input.propertyAddress,
      totalRoofAreaSqft,
      roofSquares,
      totalFacets,
      predominantPitch: input.approvedPitchClass,
      confidenceScore: input.confidenceScore,
      sourceStackQuality: input.sourceStackQuality,
      accuracyLabel: formatAccuracyBand(input.accuracyBand),
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
    autoRoofOutline: input.autoRoofOutline,
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

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
