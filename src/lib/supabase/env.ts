import { buildMeasurementSourceReadiness } from "@/lib/measurements/source-stack";

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
}

export function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
}

export function getSupabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
}

export function hasSupabasePublicConfig() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function hasSupabaseServerWriteConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}

export function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

export function getNearmapApiKey() {
  return process.env.NEARMAP_API_KEY?.trim() ?? "";
}

export function getMapboxAccessToken() {
  return process.env.MAPBOX_ACCESS_TOKEN?.trim() ?? "";
}

export function getMeasurementSourceReadiness() {
  return buildMeasurementSourceReadiness({
    googleMapsApiKey: getGoogleMapsApiKey(),
    nearmapApiKey: getNearmapApiKey(),
    mapboxAccessToken: getMapboxAccessToken(),
  });
}
