import type { MeasurementSourceSignals } from "./source-stack";
import { fetchGoogleSolarMaskOutline, type AutoRoofOutline } from "./solar-mask-outline";
import { fetchGoogleSolarRasterPreview, type SolarRasterPreview } from "./solar-raster-preview";

type LatLng = {
  latitude?: number;
  longitude?: number;
};

type LatLngBox = {
  sw?: LatLng;
  ne?: LatLng;
};

type GoogleSolarDate = {
  year?: number;
  month?: number;
  day?: number;
};

type GoogleSolarRoofSegment = {
  stats?: {
    areaMeters2?: number;
    groundAreaMeters2?: number;
  };
  center?: LatLng;
  boundingBox?: LatLngBox;
  pitchDegrees?: number;
  azimuthDegrees?: number;
  planeHeightAtCenterMeters?: number;
};

type SolarRasterPreviewFetcher = (input: {
  rgbUrl?: string;
  maskUrl?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}) => Promise<SolarRasterPreview | null>;

export type GoogleSolarBuildingInsightsResponse = {
  name?: string;
  center?: LatLng;
  boundingBox?: LatLngBox;
  imageryDate?: GoogleSolarDate;
  imageryProcessedDate?: GoogleSolarDate;
  imageryQuality?: string;
  solarPotential?: {
    roofSegmentStats?: GoogleSolarRoofSegment[];
    wholeRoofStats?: {
      areaMeters2?: number;
      groundAreaMeters2?: number;
    };
    buildingStats?: {
      areaMeters2?: number;
      groundAreaMeters2?: number;
    };
  };
};

export type GoogleSolarDataLayersResponse = {
  imageryDate?: GoogleSolarDate;
  imageryProcessedDate?: GoogleSolarDate;
  imageryQuality?: string;
  rgbUrl?: string;
  maskUrl?: string;
  dsmUrl?: string;
};

export type GoogleSolarFetchResult = {
  signals: Pick<MeasurementSourceSignals, "googleSolar" | "solarDataLayers">;
  payload: {
    buildingInsights?: GoogleSolarBuildingInsightsResponse;
    dataLayers?: GoogleSolarDataLayersResponse;
    error?: {
      status: number;
      detail: string;
    };
  };
  detail: string;
};

export const GOOGLE_SOLAR_DATA_LAYER_PIXEL_SIZE_METERS = 0.25;

export function buildGoogleSolarBuildingInsightsUrl(input: {
  apiKey: string;
  latitude: number;
  longitude: number;
}) {
  const params = new URLSearchParams({
    "location.latitude": formatCoordinate(input.latitude),
    "location.longitude": formatCoordinate(input.longitude),
    requiredQuality: "MEDIUM",
    exactQualityRequired: "false",
    key: input.apiKey,
  });

  return `https://solar.googleapis.com/v1/buildingInsights:findClosest?${params.toString()}`;
}

export function buildGoogleSolarDataLayersUrl(input: {
  apiKey: string;
  latitude: number;
  longitude: number;
}) {
  const params = new URLSearchParams({
    "location.latitude": formatCoordinate(input.latitude),
    "location.longitude": formatCoordinate(input.longitude),
    radiusMeters: "80",
    view: "IMAGERY_LAYERS",
    requiredQuality: "MEDIUM",
    pixelSizeMeters: String(GOOGLE_SOLAR_DATA_LAYER_PIXEL_SIZE_METERS),
    exactQualityRequired: "false",
    key: input.apiKey,
  });

  return `https://solar.googleapis.com/v1/dataLayers:get?${params.toString()}`;
}

export async function fetchGoogleSolarSignals(input: {
  apiKey?: string;
  latitude?: number;
  longitude?: number;
  fetchFn?: typeof fetch;
  maskOutlineFetcher?: (input: {
    maskUrl?: string;
    apiKey?: string;
    pixelSizeMeters?: number;
    fetchFn?: typeof fetch;
  }) => Promise<AutoRoofOutline | null>;
  rasterPreviewFetcher?: SolarRasterPreviewFetcher;
}): Promise<GoogleSolarFetchResult> {
  const apiKey = input.apiKey?.trim();

  if (!apiKey || typeof input.latitude !== "number" || typeof input.longitude !== "number") {
    return {
      signals: {
        googleSolar: { status: "unavailable" },
        solarDataLayers: { status: "unavailable" },
      },
      payload: {},
      detail: "Google Solar skipped because a server key or property coordinates are missing.",
    };
  }

  const fetchFn = input.fetchFn ?? fetch;
  const buildingUrl = buildGoogleSolarBuildingInsightsUrl({
    apiKey,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  let buildingResponse: Response;

  try {
    buildingResponse = await fetchFn(buildingUrl);
  } catch (error) {
    return {
      signals: {
        googleSolar: { status: "unavailable" },
        solarDataLayers: { status: "unavailable" },
      },
      payload: {
        error: {
          status: 0,
          detail: error instanceof Error ? error.message : "Solar API request failed before a response was returned.",
        },
      },
      detail: "Google Solar request failed before a response was returned.",
    };
  }

  if (!buildingResponse.ok) {
    return {
      signals: {
        googleSolar: { status: "unavailable" },
        solarDataLayers: { status: "unavailable" },
      },
      payload: {
        error: {
          status: buildingResponse.status,
          detail: await safeReadError(buildingResponse),
        },
      },
      detail: `Google Solar roof segments are not available for this property (HTTP ${buildingResponse.status}).`,
    };
  }

  const buildingInsights = (await buildingResponse.json()) as GoogleSolarBuildingInsightsResponse;
  const roofSegmentStats = mapRoofSegmentStats(buildingInsights);

  if (!roofSegmentStats.length) {
    return {
      signals: {
        googleSolar: { status: "unavailable" },
        solarDataLayers: { status: "unavailable" },
      },
      payload: { buildingInsights },
      detail: "Google Solar returned the building but no roof segment stats.",
    };
  }

  const dataLayers = await fetchSolarDataLayers({
    apiKey,
    latitude: input.latitude,
    longitude: input.longitude,
    fetchFn,
  });
  const autoRoofOutline = dataLayers?.maskUrl
    ? await (input.maskOutlineFetcher ?? fetchGoogleSolarMaskOutline)({
        maskUrl: dataLayers.maskUrl,
        apiKey,
        pixelSizeMeters: GOOGLE_SOLAR_DATA_LAYER_PIXEL_SIZE_METERS,
        fetchFn,
      })
    : null;
  const rasterPreview = dataLayers?.rgbUrl
    ? await safeFetchSolarRasterPreview(input.rasterPreviewFetcher ?? fetchGoogleSolarRasterPreview, {
        rgbUrl: dataLayers.rgbUrl,
        maskUrl: dataLayers.maskUrl,
        apiKey,
        fetchFn,
      })
    : null;

  return {
    signals: {
      googleSolar: {
        status: "used",
        buildingName: buildingInsights.name,
        imageryQuality: buildingInsights.imageryQuality,
        imageryDate: formatGoogleDate(buildingInsights.imageryDate),
        buildingCenter: mapLatLng(buildingInsights.center),
        buildingBoundingBox: mapLatLngBox(buildingInsights.boundingBox),
        roofSegmentStats,
      },
      solarDataLayers: dataLayers
        ? {
            status: "used",
            imageryQuality: dataLayers.imageryQuality,
            imageryDate: formatGoogleDate(dataLayers.imageryDate),
            rgbUrl: dataLayers.rgbUrl,
            maskUrl: dataLayers.maskUrl,
            dsmUrl: dataLayers.dsmUrl,
            autoRoofOutline: autoRoofOutline ?? undefined,
            rasterPreview: rasterPreview ?? undefined,
          }
        : { status: "unavailable" },
    },
    payload: {
      buildingInsights,
      dataLayers: dataLayers ?? undefined,
    },
    detail: `Google Solar returned ${roofSegmentStats.length} roof segment(s).`,
  };
}

async function safeFetchSolarRasterPreview(
  rasterPreviewFetcher: SolarRasterPreviewFetcher,
  input: {
    rgbUrl?: string;
    maskUrl?: string;
    apiKey?: string;
    fetchFn?: typeof fetch;
  },
) {
  try {
    return await rasterPreviewFetcher(input);
  } catch {
    return null;
  }
}

async function fetchSolarDataLayers(input: {
  apiKey: string;
  latitude: number;
  longitude: number;
  fetchFn: typeof fetch;
}) {
  let response: Response;

  try {
    response = await input.fetchFn(
      buildGoogleSolarDataLayersUrl({
        apiKey: input.apiKey,
        latitude: input.latitude,
        longitude: input.longitude,
      }),
    );
  } catch {
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as GoogleSolarDataLayersResponse;
}

function mapRoofSegmentStats(response: GoogleSolarBuildingInsightsResponse) {
  return (
    response.solarPotential?.roofSegmentStats
      ?.map((segment, index) => ({
        sourceIndex: index,
        areaMeters2: segment.stats?.areaMeters2,
        groundAreaMeters2: segment.stats?.groundAreaMeters2,
        pitchDegrees: segment.pitchDegrees,
        azimuthDegrees: segment.azimuthDegrees,
        planeHeightAtCenterMeters: segment.planeHeightAtCenterMeters,
        center: mapLatLng(segment.center),
        boundingBox: mapLatLngBox(segment.boundingBox),
      }))
      .filter((segment): segment is NonNullable<typeof segment> & { areaMeters2: number } =>
        typeof segment.areaMeters2 === "number",
      ) ?? []
  );
}

function mapLatLng(value?: LatLng) {
  if (typeof value?.latitude !== "number" || typeof value.longitude !== "number") {
    return undefined;
  }

  return {
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

function mapLatLngBox(value?: LatLngBox) {
  const sw = mapLatLng(value?.sw);
  const ne = mapLatLng(value?.ne);

  if (!sw || !ne) {
    return undefined;
  }

  return { sw, ne };
}

function formatGoogleDate(value?: GoogleSolarDate) {
  if (!value?.year || !value.month || !value.day) {
    return undefined;
  }

  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function formatCoordinate(value: number) {
  return (Math.round(value * 1_000_000) / 1_000_000).toFixed(6);
}

async function safeReadError(response: Response) {
  try {
    const body = await response.json();

    return JSON.stringify(body);
  } catch {
    return response.statusText || "Solar API request failed.";
  }
}
