import type { MeasurementSourceSignals } from "./source-stack";

export type PropertyMatchStatus =
  | "typed_only"
  | "selected_from_google"
  | "validated"
  | "needs_confirmation"
  | "validation_failed";

export type PropertyMatchSource = "manual" | "google_places" | "google_address_validation";

export type PropertyMatch = {
  status: PropertyMatchStatus;
  source: PropertyMatchSource;
  formattedAddress?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  validationGranularity?: string;
  geocodeGranularity?: string;
  addressComplete?: boolean;
  possibleNextAction?: string;
  detail: string;
  checkedAt?: string;
};

export type GooglePlacesPropertySelection = {
  formattedAddress: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  checkedAt?: string;
};

export type GoogleAddressValidationResponse = {
  result?: {
    verdict?: {
      validationGranularity?: string;
      geocodeGranularity?: string;
      addressComplete?: boolean;
      hasUnconfirmedComponents?: boolean;
      possibleNextAction?: string;
    };
    address?: {
      formattedAddress?: string;
    };
    geocode?: {
      location?: {
        latitude?: number;
        longitude?: number;
      };
      placeId?: string;
    };
  };
};

const PRECISE_GRANULARITIES = new Set(["SUB_PREMISE", "PREMISE"]);
const SOURCE_SIGNAL_GRANULARITIES = new Set([
  "SUB_PREMISE",
  "PREMISE",
  "PREMISE_PROXIMITY",
  "BLOCK",
  "ROUTE",
  "LOCALITY",
]);

export function createTypedOnlyPropertyMatch(address: string): PropertyMatch {
  return {
    status: "typed_only",
    source: "manual",
    formattedAddress: address.trim() || undefined,
    detail: "Typed address has not been matched to a property yet.",
  };
}

export function createGooglePlacesPropertyMatch(selection: GooglePlacesPropertySelection): PropertyMatch {
  return {
    status: "selected_from_google",
    source: "google_places",
    formattedAddress: selection.formattedAddress,
    placeId: selection.placeId,
    latitude: selection.latitude,
    longitude: selection.longitude,
    detail: "Selected from Google Places. Server validation still needs to confirm the property match.",
    checkedAt: selection.checkedAt,
  };
}

export function mapAddressValidationResponseToPropertyMatch(
  response: GoogleAddressValidationResponse,
  fallback: { inputAddress: string; existingMatch?: PropertyMatch },
): PropertyMatch {
  const verdict = response.result?.verdict;
  const validationGranularity = verdict?.validationGranularity;
  const geocodeGranularity = verdict?.geocodeGranularity;
  const possibleNextAction = verdict?.possibleNextAction;
  const addressComplete = Boolean(verdict?.addressComplete);
  const hasUnconfirmedComponents = Boolean(verdict?.hasUnconfirmedComponents);
  const formattedAddress =
    response.result?.address?.formattedAddress ??
    fallback.existingMatch?.formattedAddress ??
    fallback.inputAddress;
  const latitude = response.result?.geocode?.location?.latitude ?? fallback.existingMatch?.latitude;
  const longitude = response.result?.geocode?.location?.longitude ?? fallback.existingMatch?.longitude;
  const placeId = response.result?.geocode?.placeId ?? fallback.existingMatch?.placeId;
  const preciseMatch = Boolean(validationGranularity && PRECISE_GRANULARITIES.has(validationGranularity));
  const accepted = possibleNextAction === "ACCEPT" || !possibleNextAction;
  const status: PropertyMatchStatus =
    preciseMatch && addressComplete && !hasUnconfirmedComponents && accepted ? "validated" : "needs_confirmation";

  return {
    status,
    source: "google_address_validation",
    formattedAddress,
    placeId,
    latitude,
    longitude,
    validationGranularity,
    geocodeGranularity,
    addressComplete,
    possibleNextAction,
    detail:
      status === "validated"
        ? `Validated at ${formatGranularity(validationGranularity)} granularity.`
        : `Address match needs manager confirmation${
            validationGranularity ? ` (${formatGranularity(validationGranularity)} granularity)` : ""
          }.`,
    checkedAt: new Date().toISOString(),
  };
}

export async function validatePropertyAddress(input: {
  address: string;
  existingMatch?: PropertyMatch;
  apiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<PropertyMatch> {
  const existingMatch = input.existingMatch ?? createTypedOnlyPropertyMatch(input.address);
  const apiKey = input.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey?.trim()) {
    return existingMatch;
  }

  const fetchFn = input.fetchFn ?? fetch;
  const response = await fetchFn(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: {
        regionCode: "US",
        addressLines: [input.address],
      },
    }),
  });

  if (!response.ok) {
    return {
      ...existingMatch,
      status: "validation_failed",
      source: existingMatch.source,
      detail: `Address validation failed with HTTP ${response.status}.`,
      checkedAt: new Date().toISOString(),
    };
  }

  const body = (await response.json()) as GoogleAddressValidationResponse;

  return mapAddressValidationResponseToPropertyMatch(body, {
    inputAddress: input.address,
    existingMatch,
  });
}

export function buildSourceSignalsFromPropertyMatch(match: PropertyMatch): MeasurementSourceSignals {
  if (
    match.source !== "google_address_validation" ||
    !match.validationGranularity ||
    !SOURCE_SIGNAL_GRANULARITIES.has(match.validationGranularity)
  ) {
    return {};
  }

  return {
    addressValidation: {
      status: "used",
      validationGranularity: match.validationGranularity as NonNullable<
        MeasurementSourceSignals["addressValidation"]
      >["validationGranularity"],
      formattedAddress: match.formattedAddress,
    },
  };
}

function formatGranularity(granularity?: string) {
  return (granularity ?? "unknown").toLowerCase().replaceAll("_", " ");
}
