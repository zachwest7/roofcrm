import type { MeasurementSourceSignals } from "./source-stack";
import { squareMetersToRoofSquares } from "./source-stack";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_RADIUS_METERS = 45;
const ROOF_SURFACE_FACTOR = 1.08;

type OverpassGeometryPoint = {
  lat: number;
  lon: number;
};

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

export type PublicFootprintFetchResult = {
  signals: Pick<MeasurementSourceSignals, "publicFootprints">;
  payload: {
    selectedElementId?: number;
    selectedElementType?: string;
    selectedBuildingTag?: string;
    footprintAreaMeters2?: number;
    error?: {
      status?: number;
      detail: string;
    };
  };
  detail: string;
};

export function buildOverpassFootprintQuery(input: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
}) {
  const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS_METERS;

  return `
[out:json][timeout:8];
(
  way(around:${radiusMeters},${formatCoordinate(input.latitude)},${formatCoordinate(input.longitude)})["building"];
  relation(around:${radiusMeters},${formatCoordinate(input.latitude)},${formatCoordinate(input.longitude)})["building"];
);
out tags center geom;
`.trim();
}

export async function fetchPublicFootprintSignal(input: {
  latitude?: number;
  longitude?: number;
  fetchFn?: typeof fetch;
}): Promise<PublicFootprintFetchResult> {
  if (typeof input.latitude !== "number" || typeof input.longitude !== "number") {
    return unavailable("Public footprint skipped because property coordinates are missing.");
  }

  const fetchFn = input.fetchFn ?? fetch;

  try {
    const response = await fetchFn(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        data: buildOverpassFootprintQuery({
          latitude: input.latitude,
          longitude: input.longitude,
        }),
      }),
    });

    if (!response.ok) {
      return unavailable(`Public footprint request failed with HTTP ${response.status}.`, {
        status: response.status,
        detail: response.statusText || "OpenStreetMap footprint request failed.",
      });
    }

    const body = (await response.json()) as OverpassResponse;
    const selected = selectNearestFootprint(body.elements ?? [], {
      latitude: input.latitude,
      longitude: input.longitude,
    });

    if (!selected) {
      return unavailable("No public building footprint was returned near the property.");
    }

    const roofAreaMeters2 = selected.footprintAreaMeters2 * ROOF_SURFACE_FACTOR;

    return {
      signals: {
        publicFootprints: {
          status: "used",
          roofSquaresEstimate: squareMetersToRoofSquares(roofAreaMeters2),
          sourceLabel: "OpenStreetMap building footprint",
          footprintAreaMeters2: Math.round(selected.footprintAreaMeters2),
          roofSurfaceFactor: ROOF_SURFACE_FACTOR,
        },
      },
      payload: {
        selectedElementId: selected.element.id,
        selectedElementType: selected.element.type,
        selectedBuildingTag: selected.element.tags?.building,
        footprintAreaMeters2: selected.footprintAreaMeters2,
      },
      detail: "OpenStreetMap building footprint was used as a public geometry cross-check.",
    };
  } catch (error) {
    return unavailable("Public footprint request failed before a response was returned.", {
      detail: error instanceof Error ? error.message : "Unknown footprint request error.",
    });
  }
}

function selectNearestFootprint(elements: OverpassElement[], origin: { latitude: number; longitude: number }) {
  return elements
    .map((element) => {
      const geometry = element.geometry ?? [];
      const footprintAreaMeters2 = getPolygonAreaMeters2(geometry, origin.latitude);
      const center = getGeometryCenter(geometry);

      if (!footprintAreaMeters2 || !center) {
        return null;
      }

      return {
        element,
        footprintAreaMeters2,
        distanceMeters: getDistanceMeters(origin, center),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
}

function getPolygonAreaMeters2(points: OverpassGeometryPoint[], latitude: number) {
  if (points.length < 4) {
    return 0;
  }

  const projected = points.map((point) => ({
    x: point.lon * metersPerLongitudeDegree(latitude),
    y: point.lat * metersPerLatitudeDegree(),
  }));

  const area = projected.reduce((total, point, index) => {
    const next = projected[(index + 1) % projected.length];

    return total + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(area) / 2;
}

function getGeometryCenter(points: OverpassGeometryPoint[]) {
  if (!points.length) {
    return undefined;
  }

  const totals = points.reduce(
    (current, point) => ({
      latitude: current.latitude + point.lat,
      longitude: current.longitude + point.lon,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: totals.latitude / points.length,
    longitude: totals.longitude / points.length,
  };
}

function getDistanceMeters(
  origin: { latitude: number; longitude: number },
  target: { latitude: number; longitude: number },
) {
  const deltaLat = (target.latitude - origin.latitude) * metersPerLatitudeDegree();
  const deltaLng = (target.longitude - origin.longitude) * metersPerLongitudeDegree(origin.latitude);

  return Math.sqrt(deltaLat ** 2 + deltaLng ** 2);
}

function metersPerLatitudeDegree() {
  return 111_320;
}

function metersPerLongitudeDegree(latitude: number) {
  return Math.cos((latitude * Math.PI) / 180) * 111_320;
}

function formatCoordinate(value: number) {
  return (Math.round(value * 1_000_000) / 1_000_000).toFixed(6);
}

function unavailable(
  detail: string,
  error?: {
    status?: number;
    detail: string;
  },
): PublicFootprintFetchResult {
  return {
    signals: {
      publicFootprints: { status: "unavailable" },
    },
    payload: error ? { error } : {},
    detail,
  };
}
