import { fetchGoogleSolarSignals } from "./google-solar";
import { fetchPublicFootprintSignal } from "./public-footprints";
import { buildSourceSignalsFromPropertyMatch, type PropertyMatch } from "./property-match";
import type { MeasurementSourceCode, MeasurementSourceSignals } from "./source-stack";

export type MeasurementSourcePayloads = Partial<Record<MeasurementSourceCode, unknown>>;
export type MeasurementSourceDetails = Partial<Record<MeasurementSourceCode, string>>;

export type MeasurementSourceContext = {
  signals: MeasurementSourceSignals;
  payloads: MeasurementSourcePayloads;
  details: MeasurementSourceDetails;
};

export async function buildMeasurementSourceContext(input: {
  propertyMatch: PropertyMatch;
  googleMapsApiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<MeasurementSourceContext> {
  const signals = buildSourceSignalsFromPropertyMatch(input.propertyMatch);
  const payloads: MeasurementSourcePayloads = {
    address_validation: input.propertyMatch,
  };
  const details: MeasurementSourceDetails = {};
  const coordinates = getCoordinates(input.propertyMatch);
  const [solarResult, publicFootprintResult] = await Promise.all([
    fetchGoogleSolarSignals({
      apiKey: input.googleMapsApiKey,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      fetchFn: input.fetchFn,
    }),
    fetchPublicFootprintSignal({
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      fetchFn: input.fetchFn,
    }),
  ]);

  Object.assign(signals, solarResult.signals, publicFootprintResult.signals);

  payloads.google_solar = solarResult.payload;
  payloads.public_footprints = publicFootprintResult.payload;
  details.google_solar = solarResult.detail;
  details.public_footprints = publicFootprintResult.detail;

  return {
    signals,
    payloads,
    details,
  };
}

function getCoordinates(match: PropertyMatch) {
  if (typeof match.latitude !== "number" || typeof match.longitude !== "number") {
    return undefined;
  }

  return {
    latitude: match.latitude,
    longitude: match.longitude,
  };
}
