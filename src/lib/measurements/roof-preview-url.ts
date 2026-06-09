import type { PropertyMatch } from "./property-match";
import type { LatLng } from "./source-stack";

export const GOOGLE_SATELLITE_PREVIEW = {
  width: 640,
  height: 420,
  zoom: 20,
  minZoom: 18,
  maxZoom: 21,
};

export function buildGoogleSatelliteRoofPreviewUrl(input: {
  apiKey?: string;
  propertyMatch?: PropertyMatch;
  fallbackAddress: string;
  zoom?: number;
}) {
  const apiKey = input.apiKey?.trim();

  if (!apiKey) {
    return null;
  }

  const center = getPreviewCenter(input.propertyMatch, input.fallbackAddress);

  if (!center) {
    return null;
  }

  const params = new URLSearchParams({
    center,
    zoom: String(normalizeGoogleSatellitePreviewZoom(input.zoom)),
    size: `${GOOGLE_SATELLITE_PREVIEW.width}x${GOOGLE_SATELLITE_PREVIEW.height}`,
    scale: "2",
    maptype: "satellite",
    format: "jpg",
    key: apiKey,
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function normalizeGoogleSatellitePreviewZoom(zoom?: number) {
  if (typeof zoom !== "number" || !Number.isFinite(zoom)) {
    return GOOGLE_SATELLITE_PREVIEW.zoom;
  }

  return Math.min(
    GOOGLE_SATELLITE_PREVIEW.maxZoom,
    Math.max(GOOGLE_SATELLITE_PREVIEW.minZoom, Math.round(zoom)),
  );
}

export function getGoogleSatellitePreviewCenterCoordinates(propertyMatch?: PropertyMatch): LatLng | undefined {
  if (typeof propertyMatch?.latitude !== "number" || typeof propertyMatch.longitude !== "number") {
    return undefined;
  }

  return {
    latitude: propertyMatch.latitude,
    longitude: propertyMatch.longitude,
  };
}

function getPreviewCenter(propertyMatch: PropertyMatch | undefined, fallbackAddress: string) {
  const center = getGoogleSatellitePreviewCenterCoordinates(propertyMatch);

  if (center) {
    return `${formatCoordinate(center.latitude)},${formatCoordinate(center.longitude)}`;
  }

  return propertyMatch?.formattedAddress?.trim() || fallbackAddress.trim() || null;
}

function formatCoordinate(value: number) {
  return (Math.round(value * 1_000_000) / 1_000_000).toFixed(6);
}
