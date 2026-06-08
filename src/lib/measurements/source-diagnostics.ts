import type { DraftMeasurement } from "./draft-provider";
import type { PropertyMatch } from "./property-match";
import type { MeasurementSourceCode, MeasurementSourceReadiness } from "./source-stack";

export type SourceDiagnosticStatus = "pass" | "warning" | "fail" | "info";

export type SourceDiagnosticCategory = "property" | "solar" | "public_data" | "review";

export type SourceDiagnostic = {
  id: string;
  category: SourceDiagnosticCategory;
  label: string;
  status: SourceDiagnosticStatus;
  value: string;
  detail: string;
};

export function buildSourceDiagnostics(input: {
  propertyMatch: PropertyMatch;
  sourceReadiness: MeasurementSourceReadiness[];
  draft: DraftMeasurement;
}): SourceDiagnostic[] {
  const hasCoordinates = hasPropertyCoordinates(input.propertyMatch);
  const googleSolarReadiness = getReadiness(input.sourceReadiness, "google_solar");
  const publicFootprintReadiness = getReadiness(input.sourceReadiness, "public_footprints");
  const hasSolarSegments = input.draft.roofSegments.some((segment) => segment.source === "google_solar");
  const solarLayerCount = getSolarLayerCount(input.draft);
  const publicFootprintEvidence = input.draft.evidence.find((item) => item.label.includes("Public footprint"));
  const highRiskCount = input.draft.riskFlags.filter((flag) => flag.severity === "high").length;

  return [
    {
      id: "property-match",
      category: "property",
      label: "Property match",
      status: getPropertyMatchStatus(input.propertyMatch),
      value: formatPropertyMatchValue(input.propertyMatch),
      detail: input.propertyMatch.detail,
    },
    {
      id: "coordinates",
      category: "property",
      label: "Coordinate lock",
      status: hasCoordinates ? "pass" : "warning",
      value: hasCoordinates
        ? `${input.propertyMatch.latitude?.toFixed(6)}, ${input.propertyMatch.longitude?.toFixed(6)}`
        : "Missing",
      detail: hasCoordinates
        ? "Coordinates are available for provider and public-data lookups."
        : "Provider roof geometry cannot run until the address resolves to property coordinates.",
    },
    {
      id: "solar-segments",
      category: "solar",
      label: "Google Solar segments",
      status: hasSolarSegments ? "pass" : googleSolarReadiness?.status === "configured" ? "warning" : "info",
      value: hasSolarSegments ? `${input.draft.roofSegments.length} segment(s)` : "No segments",
      detail: hasSolarSegments
        ? "Solar roof segment area and pitch were used in the draft."
        : hasCoordinates
          ? "Google Solar did not return usable roof segments for this draft."
          : "Google Solar is waiting on a precise property match with coordinates.",
    },
    {
      id: "solar-imagery",
      category: "solar",
      label: "Solar imagery layers",
      status: solarLayerCount > 0 ? "pass" : hasSolarSegments ? "warning" : "info",
      value: solarLayerCount > 0 ? `${solarLayerCount} layer(s)` : "No layers",
      detail: solarLayerCount > 0
        ? formatSolarImageryDetail(input.draft)
        : "RGB, roof mask, and DSM layers were not available for the current draft.",
    },
    {
      id: "solar-preview",
      category: "solar",
      label: "Raster preview",
      status: input.draft.solarRasterPreview ? "pass" : input.draft.imageryLayers ? "warning" : "info",
      value: input.draft.solarRasterPreview
        ? `${input.draft.solarRasterPreview.imageWidth} x ${input.draft.solarRasterPreview.imageHeight} px`
        : "Not generated",
      detail: input.draft.solarRasterPreview
        ? `${input.draft.solarRasterPreview.roofPixels.toLocaleString()} roof-mask pixels tinted over Solar RGB imagery.`
        : "No generated RGB + mask preview is attached to this draft.",
    },
    {
      id: "public-footprint",
      category: "public_data",
      label: "Public footprint check",
      status: publicFootprintEvidence ? "pass" : publicFootprintReadiness ? "warning" : "info",
      value: publicFootprintEvidence ? "Used" : "No match",
      detail: publicFootprintEvidence?.detail ?? "No public building-footprint cross-check is attached to this draft.",
    },
    {
      id: "review-blockers",
      category: "review",
      label: "Review blockers",
      status: highRiskCount > 0 ? "warning" : "pass",
      value: highRiskCount > 0 ? `${highRiskCount} high risk` : "No high risk",
      detail:
        highRiskCount > 0
          ? "High-severity risk flags remain visible for manager review."
          : "No high-severity risk flags are present on the current draft.",
    },
  ];
}

function getPropertyMatchStatus(match: PropertyMatch): SourceDiagnosticStatus {
  if (match.status === "validated") {
    return "pass";
  }

  if (match.status === "validation_failed") {
    return "fail";
  }

  return "warning";
}

function formatPropertyMatchValue(match: PropertyMatch) {
  if (match.status === "typed_only") {
    return "Typed address only";
  }

  return match.status.replaceAll("_", " ");
}

function hasPropertyCoordinates(match: PropertyMatch) {
  return typeof match.latitude === "number" && typeof match.longitude === "number";
}

function getReadiness(
  readiness: MeasurementSourceReadiness[],
  code: MeasurementSourceCode,
) {
  return readiness.find((source) => source.code === code);
}

function getSolarLayerCount(draft: DraftMeasurement) {
  return [draft.imageryLayers?.rgbUrl, draft.imageryLayers?.maskUrl, draft.imageryLayers?.dsmUrl].filter(Boolean).length;
}

function formatSolarImageryDetail(draft: DraftMeasurement) {
  const quality = draft.imageryLayers?.imageryQuality ? `${draft.imageryLayers.imageryQuality} quality` : "Unknown quality";
  const date = draft.imageryLayers?.imageryDate ? ` from ${draft.imageryLayers.imageryDate}` : "";

  return `${quality} Solar imagery layers${date}.`;
}
