import type {
  AccuracyBand,
  DraftMeasurement,
  MeasurementEvidence,
  MeasurementRiskFlag,
  PitchClass,
  RoofSegmentMeasurement,
} from "./draft-provider";
import type { AutoRoofOutline } from "./solar-mask-outline";
import type { SolarRasterPreview } from "./solar-raster-preview";

const SQUARE_METERS_TO_SQUARES = 10.76391041671 / 100;
const SOURCE_DISAGREEMENT_THRESHOLD_PERCENT = 18;

export type MeasurementSourceCode =
  | "address_validation"
  | "google_solar"
  | "public_footprints"
  | "usgs_3dep"
  | "mapbox_satellite"
  | "nearmap"
  | "manual_review";

export type MeasurementSourceReadiness = {
  code: MeasurementSourceCode;
  label: string;
  status: "configured" | "unconfigured" | "available";
  sourceType: MeasurementEvidence["sourceType"];
  role: "address_match" | "roof_geometry" | "imagery" | "elevation" | "review";
  detail: string;
  expectedAccuracyBand?: AccuracyBand;
};

export type AddressValidationSignal = {
  status: "used" | "unavailable";
  validationGranularity?: "SUB_PREMISE" | "PREMISE" | "PREMISE_PROXIMITY" | "BLOCK" | "ROUTE" | "LOCALITY";
  formattedAddress?: string;
};

export type GoogleSolarSignal = {
  status: "used" | "unavailable";
  buildingName?: string;
  imageryQuality?: string;
  imageryDate?: string;
  buildingCenter?: LatLng;
  buildingBoundingBox?: LatLngBox;
  roofSegmentStats?: Array<{
    sourceIndex?: number;
    areaMeters2: number;
    pitchDegrees?: number;
    groundAreaMeters2?: number;
    azimuthDegrees?: number;
    planeHeightAtCenterMeters?: number;
    center?: LatLng;
    boundingBox?: LatLngBox;
  }>;
};

export type PublicFootprintSignal = {
  status: "used" | "unavailable";
  roofSquaresEstimate?: number;
  sourceLabel?: string;
  footprintAreaMeters2?: number;
  roofSurfaceFactor?: number;
};

export type Usge3DepSignal = {
  status: "used" | "unavailable";
  pitchDegrees?: number;
  sourceResolutionMeters?: number;
};

export type SolarDataLayersSignal = {
  status: "used" | "unavailable";
  imageryQuality?: string;
  imageryDate?: string;
  rgbUrl?: string;
  maskUrl?: string;
  dsmUrl?: string;
  autoRoofOutline?: AutoRoofOutline;
  rasterPreview?: SolarRasterPreview;
};

export type MeasurementSourceSignals = {
  addressValidation?: AddressValidationSignal;
  googleSolar?: GoogleSolarSignal;
  solarDataLayers?: SolarDataLayersSignal;
  publicFootprints?: PublicFootprintSignal;
  usgs3dep?: Usge3DepSignal;
};

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type LatLngBox = {
  sw: LatLng;
  ne: LatLng;
};

export type MeasurementSourceEnv = {
  googleMapsApiKey?: string;
  nearmapApiKey?: string;
  mapboxAccessToken?: string;
};

export function squareMetersToRoofSquares(squareMeters: number): number {
  return roundToTenth(squareMeters * SQUARE_METERS_TO_SQUARES);
}

export function buildMeasurementSourceReadiness(env: MeasurementSourceEnv): MeasurementSourceReadiness[] {
  const hasGoogleMaps = Boolean(env.googleMapsApiKey?.trim());
  const hasNearmap = Boolean(env.nearmapApiKey?.trim());
  const hasMapbox = Boolean(env.mapboxAccessToken?.trim());

  return [
    {
      code: "address_validation",
      label: "Google Address Validation",
      status: hasGoogleMaps ? "configured" : "unconfigured",
      sourceType: "paid_api",
      role: "address_match",
      detail: hasGoogleMaps
        ? "Ready to validate address granularity before estimating roof area."
        : "Needs GOOGLE_MAPS_API_KEY before address validation can run.",
      expectedAccuracyBand: { minPercent: 0, maxPercent: 0 },
    },
    {
      code: "google_solar",
      label: "Google Solar roof segments",
      status: hasGoogleMaps ? "configured" : "unconfigured",
      sourceType: "paid_api",
      role: "roof_geometry",
      detail: hasGoogleMaps
        ? "Ready to request roof segment area, pitch, and orientation where coverage exists."
        : "Needs GOOGLE_MAPS_API_KEY before Solar API checks can run.",
      expectedAccuracyBand: { minPercent: 3, maxPercent: 8 },
    },
    {
      code: "public_footprints",
      label: "Public building footprints",
      status: "available",
      sourceType: "public_data",
      role: "roof_geometry",
      detail: "Overture/Microsoft footprint data can cross-check building footprint and included structures.",
      expectedAccuracyBand: { minPercent: 8, maxPercent: 18 },
    },
    {
      code: "usgs_3dep",
      label: "USGS 3DEP elevation",
      status: "available",
      sourceType: "public_data",
      role: "elevation",
      detail: "Public DEM/LiDAR data can improve pitch assumptions when local coverage is good.",
      expectedAccuracyBand: { minPercent: 2, maxPercent: 6 },
    },
    {
      code: "mapbox_satellite",
      label: "Mapbox satellite/aerial tiles",
      status: hasMapbox ? "configured" : "unconfigured",
      sourceType: "paid_api",
      role: "imagery",
      detail: hasMapbox
        ? "Ready to display licensed imagery for reviewer context."
        : "Needs MAPBOX_ACCESS_TOKEN before map imagery can be displayed.",
    },
    {
      code: "nearmap",
      label: "Nearmap imagery/DSM",
      status: hasNearmap ? "configured" : "unconfigured",
      sourceType: "paid_api",
      role: "imagery",
      detail: hasNearmap
        ? "Ready for premium imagery/DSM workflows if the account has the right products."
        : "Optional premium source. Add NEARMAP_API_KEY if you want higher-confidence imagery/DSM.",
      expectedAccuracyBand: { minPercent: 1, maxPercent: 3 },
    },
    {
      code: "manual_review",
      label: "Manager correction",
      status: "available",
      sourceType: "manual",
      role: "review",
      detail: "Required trust layer before quote-ready inputs are approved.",
    },
  ];
}

export function calibrateDraftWithSources(
  draft: DraftMeasurement,
  signals: MeasurementSourceSignals,
): DraftMeasurement {
  const evidence: MeasurementEvidence[] = [...draft.evidence];
  const hasGeometrySource =
    signals.googleSolar?.status === "used" ||
    signals.publicFootprints?.status === "used" ||
    signals.usgs3dep?.status === "used";
  const riskFlags = hasGeometrySource
    ? draft.riskFlags.filter((flag) => flag.code !== "ADDRESS_ONLY")
    : [...draft.riskFlags];
  let nextDraft: DraftMeasurement = { ...draft, evidence, riskFlags };
  let confidenceBonus = 0;

  if (signals.addressValidation?.status === "used") {
    const granularity = signals.addressValidation.validationGranularity ?? "PREMISE_PROXIMITY";
    const highQualityMatch = granularity === "PREMISE" || granularity === "SUB_PREMISE";
    confidenceBonus += highQualityMatch ? 12 : 4;
    evidence.push({
      sourceType: "paid_api",
      label: "Address validation",
      detail: highQualityMatch
        ? `Validated at ${granularity.toLowerCase().replace("_", " ")} granularity.`
        : `Address match is approximate: ${granularity.toLowerCase().replace("_", " ")}.`,
      confidenceImpact: highQualityMatch ? 12 : 4,
    });

    if (!highQualityMatch) {
      riskFlags.push({
        code: "ADDRESS_UNVERIFIED",
        label: "Address match needs confirmation",
        severity: "medium",
        detail: "The address did not validate to a precise building/premise match.",
      });
    }
  }

  const solarAreaSquares = getSolarRoofSquares(signals.googleSolar);
  const solarPitchClass = getSolarPitchClass(signals.googleSolar);

  if (solarAreaSquares) {
    nextDraft = {
      ...nextDraft,
      provider: "google_solar_v1",
      roofSquares: solarAreaSquares,
      pitchClass: solarPitchClass ?? nextDraft.pitchClass,
      confidenceScore: Math.max(nextDraft.confidenceScore, 70),
      accuracyBand: { minPercent: 3, maxPercent: 8 },
      sourceStackQuality: "solar_backed",
      roofSegments: getSolarRoofSegments(signals.googleSolar),
    };
    confidenceBonus += 18;
    evidence.push({
      sourceType: "paid_api",
      label: "Google Solar roof segments",
      detail: `Roof area derived from ${signals.googleSolar?.roofSegmentStats?.length ?? 0} roof segment(s).`,
      confidenceImpact: 18,
    });
  }

  if (signals.solarDataLayers?.status === "used") {
    nextDraft = {
      ...nextDraft,
      imageryLayers: {
        source: "google_solar",
        imageryQuality: signals.solarDataLayers.imageryQuality,
        imageryDate: signals.solarDataLayers.imageryDate,
        rgbUrl: signals.solarDataLayers.rgbUrl,
        maskUrl: signals.solarDataLayers.maskUrl,
        dsmUrl: signals.solarDataLayers.dsmUrl,
      },
      autoRoofOutline: signals.solarDataLayers.autoRoofOutline,
      solarRasterPreview: signals.solarDataLayers.rasterPreview,
    };
    evidence.push({
      sourceType: "paid_api",
      label: "Google Solar imagery layers",
      detail: formatSolarDataLayersEvidenceDetail(signals.solarDataLayers),
      confidenceImpact: signals.solarDataLayers.autoRoofOutline || signals.solarDataLayers.rasterPreview ? 8 : 4,
    });

    if (signals.solarDataLayers.autoRoofOutline || signals.solarDataLayers.rasterPreview) {
      confidenceBonus += 6;
    }
  }

  if (!solarAreaSquares && signals.publicFootprints?.status === "used" && signals.publicFootprints.roofSquaresEstimate) {
    nextDraft = {
      ...nextDraft,
      provider: "public_footprint_v1",
      roofSquares: roundToTenth(signals.publicFootprints.roofSquaresEstimate),
      confidenceScore: Math.max(nextDraft.confidenceScore, 54),
      accuracyBand: { minPercent: 8, maxPercent: 18 },
      sourceStackQuality: "footprint_backed",
    };
    confidenceBonus += 8;
    evidence.push({
      sourceType: "public_data",
      label: "Public footprint estimate",
      detail: `${signals.publicFootprints.sourceLabel ?? "Building footprint"} used as the primary fallback.`,
      confidenceImpact: 8,
    });
    riskFlags.push({
      code: "FOOTPRINT_ONLY",
      label: "Footprint-only geometry",
      severity: "medium",
      detail: "Footprint data does not reliably confirm roof pitch, overhangs, or roof-plane complexity.",
    });
  }

  if (signals.publicFootprints?.status === "used" && signals.publicFootprints.roofSquaresEstimate) {
    evidence.push({
      sourceType: "public_data",
      label: "Public footprint cross-check",
      detail: `${signals.publicFootprints.sourceLabel ?? "Building footprint"} estimates ${roundToTenth(
        signals.publicFootprints.roofSquaresEstimate,
      ).toFixed(1)} squares.`,
      confidenceImpact: 4,
    });

    const disagreement = getDisagreementPercent(nextDraft.roofSquares, signals.publicFootprints.roofSquaresEstimate);
    nextDraft = { ...nextDraft, sourceDisagreementPercent: disagreement };

    if (disagreement >= SOURCE_DISAGREEMENT_THRESHOLD_PERCENT) {
      confidenceBonus -= disagreement >= 28 ? 28 : 22;
      riskFlags.push({
        code: "SOURCE_DISAGREEMENT",
        label: "Source area disagreement",
        severity: disagreement >= 28 ? "high" : "medium",
        detail: `Primary estimate and footprint cross-check differ by about ${Math.round(disagreement)}%.`,
      });
    }
  }

  if (signals.usgs3dep?.status === "used" && signals.usgs3dep.pitchDegrees) {
    const pitchClass = getPitchClassFromDegrees(signals.usgs3dep.pitchDegrees);
    nextDraft = {
      ...nextDraft,
      pitchClass,
      confidenceScore: Math.max(nextDraft.confidenceScore, 58),
    };
    confidenceBonus += 6;
    evidence.push({
      sourceType: "public_data",
      label: "USGS 3DEP pitch check",
      detail: `Elevation data suggests ${signals.usgs3dep.pitchDegrees.toFixed(1)} degree pitch.`,
      confidenceImpact: 6,
    });
  }

  const boundedConfidence = clamp(nextDraft.confidenceScore + confidenceBonus, 0, 92);

  return {
    ...nextDraft,
    evidence,
    riskFlags: dedupeRiskFlags(riskFlags),
    confidenceScore: boundedConfidence,
  };
}

function getSolarRoofSquares(signal?: GoogleSolarSignal): number | undefined {
  if (signal?.status !== "used" || !signal.roofSegmentStats?.length) {
    return undefined;
  }

  const areaMeters2 = signal.roofSegmentStats.reduce((total, segment) => total + segment.areaMeters2, 0);

  return squareMetersToRoofSquares(areaMeters2);
}

function formatSolarDataLayersEvidenceDetail(signal: SolarDataLayersSignal) {
  const artifacts = ["Solar RGB"];

  if (signal.maskUrl) {
    artifacts.push("roof mask");
  }

  if (signal.dsmUrl) {
    artifacts.push("DSM layer");
  }

  if (signal.autoRoofOutline) {
    artifacts.push("auto roof outline proposal");
  }

  if (signal.rasterPreview) {
    artifacts.push("raster preview");
  }

  return `${formatList(artifacts)} generated for reviewer evidence.`;
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "Solar imagery layers";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function getSolarPitchClass(signal?: GoogleSolarSignal): PitchClass | undefined {
  if (signal?.status !== "used" || !signal.roofSegmentStats?.length) {
    return undefined;
  }

  const pitchValues = signal.roofSegmentStats
    .map((segment) => segment.pitchDegrees)
    .filter((pitch): pitch is number => typeof pitch === "number");

  if (!pitchValues.length) {
    return undefined;
  }

  const weightedAverage = pitchValues.reduce((total, pitch) => total + pitch, 0) / pitchValues.length;

  return getPitchClassFromDegrees(weightedAverage);
}

function getSolarRoofSegments(signal?: GoogleSolarSignal): RoofSegmentMeasurement[] {
  if (signal?.status !== "used" || !signal.roofSegmentStats?.length) {
    return [];
  }

  return signal.roofSegmentStats.map((segment, index) => ({
    id: `solar-segment-${segment.sourceIndex ?? index}`,
    label: `Solar ${String.fromCharCode(65 + index)}`,
    source: "google_solar",
    areaMeters2: segment.areaMeters2,
    groundAreaMeters2: segment.groundAreaMeters2,
    squares: squareMetersToRoofSquares(segment.areaMeters2),
    pitchDegrees: segment.pitchDegrees,
    azimuthDegrees: segment.azimuthDegrees,
    center: segment.center,
    boundingBox: segment.boundingBox,
  }));
}

function getPitchClassFromDegrees(pitchDegrees: number): PitchClass {
  if (pitchDegrees < 10) {
    return "low";
  }

  if (pitchDegrees >= 30) {
    return "steep";
  }

  return "medium";
}

function getDisagreementPercent(primarySquares: number, comparisonSquares: number): number {
  if (primarySquares <= 0 || comparisonSquares <= 0) {
    return 0;
  }

  return Math.round((Math.abs(primarySquares - comparisonSquares) / primarySquares) * 1000) / 10;
}

function dedupeRiskFlags(flags: MeasurementRiskFlag[]): MeasurementRiskFlag[] {
  const seen = new Set<string>();

  return flags.filter((flag) => {
    if (seen.has(flag.code)) {
      return false;
    }

    seen.add(flag.code);
    return true;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
