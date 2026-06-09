import type { MeasurementSourceSignals } from "./source-stack";

export type PropertyMatchStatus =
  | "typed_only"
  | "selected_from_google"
  | "validated"
  | "needs_confirmation"
  | "validation_failed";

export type PropertyMatchSource = "manual" | "google_places" | "google_address_validation";
export type PropertyTargetAdjustmentDirection = "left" | "right" | "up" | "down";

export type PropertyTargetCorrection = {
  method?: "nudge" | "map_tap";
  direction: PropertyTargetAdjustmentDirection;
  distanceFeet: number;
  totalEastFeet: number;
  totalNorthFeet: number;
  correctedAt: string;
};

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
  targetCorrection?: PropertyTargetCorrection;
};

export type GooglePlacesPropertySelection = {
  formattedAddress: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  checkedAt?: string;
};

export type ManualPropertyTargetAdjustment = {
  direction: PropertyTargetAdjustmentDirection;
  distanceFeet: number;
  checkedAt?: string;
};

export type ManualPropertyTargetSelection = {
  coordinates: {
    latitude: number;
    longitude: number;
  };
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

export function createManuallyAdjustedPropertyMatch(
  match: PropertyMatch,
  adjustment: ManualPropertyTargetAdjustment,
): PropertyMatch {
  if (typeof match.latitude !== "number" || typeof match.longitude !== "number") {
    return {
      ...match,
      status: "needs_confirmation",
      source: "manual",
      detail: "Cannot manually adjust the roof target until this address has map coordinates.",
      checkedAt: adjustment.checkedAt ?? new Date().toISOString(),
    };
  }

  const checkedAt = adjustment.checkedAt ?? new Date().toISOString();
  const eastFeet = getEastFeet(adjustment.direction, adjustment.distanceFeet);
  const northFeet = getNorthFeet(adjustment.direction, adjustment.distanceFeet);
  const previousCorrection = match.targetCorrection;
  const totalEastFeet = roundFeet((previousCorrection?.totalEastFeet ?? 0) + eastFeet);
  const totalNorthFeet = roundFeet((previousCorrection?.totalNorthFeet ?? 0) + northFeet);
  const shiftedCoordinates = shiftCoordinatesByFeet(
    {
      latitude: match.latitude,
      longitude: match.longitude,
    },
    { eastFeet, northFeet },
  );

  return {
    ...match,
    status: "needs_confirmation",
    source: "manual",
    latitude: shiftedCoordinates.latitude,
    longitude: shiftedCoordinates.longitude,
    detail: `Manually adjusted roof target ${formatAdjustmentDistance(adjustment.distanceFeet)} ${formatDirection(
      adjustment.direction,
    )}. Confirm this is the correct structure before quote approval.`,
    checkedAt,
    targetCorrection: {
      method: "nudge",
      direction: adjustment.direction,
      distanceFeet: adjustment.distanceFeet,
      totalEastFeet,
      totalNorthFeet,
      correctedAt: checkedAt,
    },
  };
}

export function createManuallySelectedPropertyTarget(
  match: PropertyMatch,
  selection: ManualPropertyTargetSelection,
): PropertyMatch {
  if (typeof match.latitude !== "number" || typeof match.longitude !== "number") {
    return {
      ...match,
      status: "needs_confirmation",
      source: "manual",
      detail: "Cannot select a roof target from the map until this address has map coordinates.",
      checkedAt: selection.checkedAt ?? new Date().toISOString(),
    };
  }

  const checkedAt = selection.checkedAt ?? new Date().toISOString();
  const eastFeet = roundFeet(
    (selection.coordinates.longitude - match.longitude) * feetPerLongitudeDegree(match.latitude),
  );
  const northFeet = roundFeet((selection.coordinates.latitude - match.latitude) * feetPerLatitudeDegree());
  const previousCorrection = match.targetCorrection;
  const totalEastFeet = roundFeet((previousCorrection?.totalEastFeet ?? 0) + eastFeet);
  const totalNorthFeet = roundFeet((previousCorrection?.totalNorthFeet ?? 0) + northFeet);
  const distanceFeet = roundFeet(Math.hypot(eastFeet, northFeet));

  return {
    ...match,
    status: "needs_confirmation",
    source: "manual",
    latitude: roundCoordinate(selection.coordinates.latitude),
    longitude: roundCoordinate(selection.coordinates.longitude),
    detail: "Roof target was manually selected on the satellite map. Confirm this is the correct structure before quote approval.",
    checkedAt,
    targetCorrection: {
      method: "map_tap",
      direction: getDominantDirection(eastFeet, northFeet),
      distanceFeet,
      totalEastFeet,
      totalNorthFeet,
      correctedAt: checkedAt,
    },
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
  const hasManualTargetCorrection = Boolean(fallback.existingMatch?.targetCorrection);
  const latitude = hasManualTargetCorrection
    ? fallback.existingMatch?.latitude
    : response.result?.geocode?.location?.latitude ?? fallback.existingMatch?.latitude;
  const longitude = hasManualTargetCorrection
    ? fallback.existingMatch?.longitude
    : response.result?.geocode?.location?.longitude ?? fallback.existingMatch?.longitude;
  const placeId = response.result?.geocode?.placeId ?? fallback.existingMatch?.placeId;
  const preciseMatch = Boolean(validationGranularity && PRECISE_GRANULARITIES.has(validationGranularity));
  const accepted = possibleNextAction === "ACCEPT" || !possibleNextAction;
  const status: PropertyMatchStatus =
    preciseMatch && addressComplete && !hasUnconfirmedComponents && accepted && !hasManualTargetCorrection
      ? "validated"
      : "needs_confirmation";

  return {
    status,
    source: hasManualTargetCorrection ? "manual" : "google_address_validation",
    formattedAddress,
    placeId,
    latitude,
    longitude,
    validationGranularity,
    geocodeGranularity,
    addressComplete,
    possibleNextAction,
    detail:
      hasManualTargetCorrection
        ? `Manually adjusted roof target after address validation${
            validationGranularity ? ` (${formatGranularity(validationGranularity)} granularity)` : ""
          }.`
        : status === "validated"
        ? `Validated at ${formatGranularity(validationGranularity)} granularity.`
        : `Address match needs manager confirmation${
            validationGranularity ? ` (${formatGranularity(validationGranularity)} granularity)` : ""
          }.`,
    checkedAt: new Date().toISOString(),
    targetCorrection: fallback.existingMatch?.targetCorrection,
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

function shiftCoordinatesByFeet(
  coordinates: { latitude: number; longitude: number },
  offset: { eastFeet: number; northFeet: number },
) {
  const latitude = coordinates.latitude + offset.northFeet / feetPerLatitudeDegree();
  const longitude = coordinates.longitude + offset.eastFeet / feetPerLongitudeDegree(coordinates.latitude);

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

function getEastFeet(direction: PropertyTargetAdjustmentDirection, distanceFeet: number) {
  if (direction === "left") {
    return -distanceFeet;
  }

  if (direction === "right") {
    return distanceFeet;
  }

  return 0;
}

function getNorthFeet(direction: PropertyTargetAdjustmentDirection, distanceFeet: number) {
  if (direction === "up") {
    return distanceFeet;
  }

  if (direction === "down") {
    return -distanceFeet;
  }

  return 0;
}

function feetPerLatitudeDegree() {
  return 364_000;
}

function feetPerLongitudeDegree(latitude: number) {
  return Math.cos((latitude * Math.PI) / 180) * feetPerLatitudeDegree();
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000_000) / 10_000_000;
}

function roundFeet(value: number) {
  return Math.round(value * 10) / 10;
}

function formatAdjustmentDistance(distanceFeet: number) {
  return `${roundFeet(distanceFeet)} ft`;
}

function formatDirection(direction: PropertyTargetAdjustmentDirection) {
  const labels: Record<PropertyTargetAdjustmentDirection, string> = {
    left: "west",
    right: "east",
    up: "north",
    down: "south",
  };

  return labels[direction];
}

function getDominantDirection(eastFeet: number, northFeet: number): PropertyTargetAdjustmentDirection {
  if (Math.abs(eastFeet) >= Math.abs(northFeet)) {
    return eastFeet >= 0 ? "right" : "left";
  }

  return northFeet >= 0 ? "up" : "down";
}
