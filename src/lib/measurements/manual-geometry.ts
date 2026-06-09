import type { MeasurementLengthTotals } from "./report";
import type { RoofOutlinePoint, AutoRoofOutline } from "./solar-mask-outline";

export type ManualRoofGeometrySource = "google_solar_mask" | "manual_fallback";

export type ManualRoofEdgeType = "eave" | "rake" | "hip" | "ridge" | "valley" | "flashing";

export type ManualRoofFacet = {
  id: string;
  label: string;
  points: RoofOutlinePoint[];
};

export type ManualRoofGeometry = {
  source: ManualRoofGeometrySource;
  imageWidth: number;
  imageHeight: number;
  pixelSizeFeet: number;
  facets: ManualRoofFacet[];
  detail: string;
};

export type ManualRoofEdgeRow = {
  id: string;
  facetLabel: string;
  type: ManualRoofEdgeType;
  lengthFt: number;
  from: RoofOutlinePoint;
  to: RoofOutlinePoint;
};

export type ManualRoofMeasurements = {
  source: "manual_geometry";
  areaSqft: number;
  roofSquares: number;
  lengthTotals: MeasurementLengthTotals;
  edgeRows: ManualRoofEdgeRow[];
  detail: string;
};

const METERS_TO_FEET = 3.280839895;
const MAX_AUTO_OUTLINE_DRAFT_DISAGREEMENT_PERCENT = 45;

export function buildManualRoofGeometryForDraft(input: {
  roofSquares: number;
  autoRoofOutline?: AutoRoofOutline;
}): ManualRoofGeometry {
  if (input.autoRoofOutline) {
    const autoGeometry = buildManualRoofGeometryFromAutoOutline(input.autoRoofOutline);

    if (isManualGeometryUsableForDraft(autoGeometry, input.roofSquares)) {
      return autoGeometry;
    }
  }

  return buildFallbackManualRoofGeometry({
    roofSquares: input.roofSquares,
  });
}

export function buildManualRoofGeometryFromAutoOutline(outline: AutoRoofOutline): ManualRoofGeometry {
  return {
    source: "google_solar_mask",
    imageWidth: outline.imageWidth,
    imageHeight: outline.imageHeight,
    pixelSizeFeet: outline.pixelSizeMeters ? roundToTenthousandth(outline.pixelSizeMeters * METERS_TO_FEET) : 1,
    facets: outline.polygons.map((polygon) => ({
      id: polygon.id,
      label: polygon.label,
      points: polygon.points,
    })),
    detail: "Editable geometry initialized from the Google Solar roof-mask outline proposal.",
  };
}

export function buildFallbackManualRoofGeometry(input: {
  roofSquares: number;
  imageWidth?: number;
  imageHeight?: number;
}): ManualRoofGeometry {
  const imageWidth = input.imageWidth ?? 120;
  const imageHeight = input.imageHeight ?? 80;
  const width = imageWidth * 0.58;
  const height = imageHeight * 0.48;
  const x = (imageWidth - width) / 2;
  const y = (imageHeight - height) / 2;
  const areaPixels = width * height;
  const areaSqft = Math.max(1, input.roofSquares * 100);

  return {
    source: "manual_fallback",
    imageWidth,
    imageHeight,
    pixelSizeFeet: roundToTenthousandth(Math.sqrt(areaSqft / areaPixels)),
    facets: [
      {
        id: "manual-outline-1",
        label: "Manual outline",
        points: [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ].map(roundPoint),
      },
    ],
    detail: "Editable fallback geometry initialized from the current draft roof area.",
  };
}

export function replaceManualRoofGeometryPoint(
  geometry: ManualRoofGeometry,
  input: {
    facetId: string;
    pointIndex: number;
    point: RoofOutlinePoint;
  },
): ManualRoofGeometry {
  return {
    ...geometry,
    facets: geometry.facets.map((facet) => {
      if (facet.id !== input.facetId) {
        return facet;
      }

      return {
        ...facet,
        points: facet.points.map((point, index) => (index === input.pointIndex ? clampPoint(input.point, geometry) : point)),
      };
    }),
  };
}

export function calculateManualRoofMeasurements(geometry: ManualRoofGeometry): ManualRoofMeasurements {
  const areaSqft = Math.round(
    geometry.facets.reduce((total, facet) => total + getPolygonAreaPixels(facet.points), 0) *
      geometry.pixelSizeFeet *
      geometry.pixelSizeFeet,
  );
  const edgeRows = geometry.facets.flatMap((facet) => buildEdgeRows(facet, geometry.pixelSizeFeet));
  const lengthTotals = buildLengthTotalsFromEdges(edgeRows);

  return {
    source: "manual_geometry",
    areaSqft,
    roofSquares: roundToTenth(areaSqft / 100),
    lengthTotals,
    edgeRows,
    detail: "Area and edge lengths are derived from the manager-adjusted outline geometry.",
  };
}

function isManualGeometryUsableForDraft(geometry: ManualRoofGeometry, roofSquares: number) {
  if (roofSquares <= 0) {
    return true;
  }

  const geometryRoofSquares = calculateManualRoofMeasurements(geometry).roofSquares;

  if (geometryRoofSquares <= 0) {
    return true;
  }

  const disagreementPercent = (Math.abs(geometryRoofSquares - roofSquares) / roofSquares) * 100;

  return disagreementPercent <= MAX_AUTO_OUTLINE_DRAFT_DISAGREEMENT_PERCENT;
}

function buildEdgeRows(facet: ManualRoofFacet, pixelSizeFeet: number): ManualRoofEdgeRow[] {
  return facet.points.map((point, index) => {
    const next = facet.points[(index + 1) % facet.points.length];
    const lengthFt = roundToTenth(getDistancePixels(point, next) * pixelSizeFeet);

    return {
      id: `${facet.id}-edge-${index}`,
      facetLabel: facet.label,
      type: classifyEdge(point, next),
      lengthFt,
      from: point,
      to: next,
    };
  });
}

function classifyEdge(from: RoofOutlinePoint, to: RoofOutlinePoint): ManualRoofEdgeType {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);

  if (dx === 0 && dy === 0) {
    return "flashing";
  }

  if (dx >= dy * 1.8) {
    return "eave";
  }

  if (dy >= dx * 1.8) {
    return "rake";
  }

  return "hip";
}

function buildLengthTotalsFromEdges(edgeRows: ManualRoofEdgeRow[]): MeasurementLengthTotals {
  const eavesFt = sumEdges(edgeRows, "eave");
  const rakesFt = sumEdges(edgeRows, "rake");
  const hipsFt = sumEdges(edgeRows, "hip");
  const ridgesFt = sumEdges(edgeRows, "ridge");
  const valleysFt = sumEdges(edgeRows, "valley");
  const flashingFt = sumEdges(edgeRows, "flashing");

  return {
    eavesFt,
    valleysFt,
    hipsFt,
    ridgesFt,
    rakesFt,
    wallFlashingFt: flashingFt,
    stepFlashingFt: 0,
    transitionsFt: 0,
    parapetWallsFt: 0,
    unspecifiedFt: 0,
    hipsAndRidgesFt: roundToTenth(hipsFt + ridgesFt),
    eavesAndRakesFt: roundToTenth(eavesFt + rakesFt),
  };
}

function sumEdges(edgeRows: ManualRoofEdgeRow[], type: ManualRoofEdgeType) {
  return roundToTenth(
    edgeRows
      .filter((row) => row.type === type)
      .reduce((total, row) => total + row.lengthFt, 0),
  );
}

function getPolygonAreaPixels(points: RoofOutlinePoint[]) {
  if (points.length < 3) {
    return 0;
  }

  return (
    Math.abs(
      points.reduce((total, point, index) => {
        const next = points[(index + 1) % points.length];

        return total + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2
  );
}

function getDistancePixels(from: RoofOutlinePoint, to: RoofOutlinePoint) {
  return Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
}

function clampPoint(point: RoofOutlinePoint, geometry: ManualRoofGeometry) {
  return roundPoint({
    x: Math.min(geometry.imageWidth, Math.max(0, point.x)),
    y: Math.min(geometry.imageHeight, Math.max(0, point.y)),
  });
}

function roundPoint(point: RoofOutlinePoint) {
  return {
    x: Math.round(point.x * 10) / 10,
    y: Math.round(point.y * 10) / 10,
  };
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToTenthousandth(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
