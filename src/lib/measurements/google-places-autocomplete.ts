export type GooglePlaceAutocompleteSuggestion = {
  placeId: string;
  resourceName: string;
  text: string;
  mainText: string;
  secondaryText: string;
  types: string[];
};

export type GooglePlaceDetails = {
  placeId: string;
  resourceName: string;
  formattedAddress: string;
  latitude?: number;
  longitude?: number;
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      place?: string;
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
      types?: string[];
    };
  }>;
};

type GooglePlaceDetailsResponse = {
  name?: string;
  id?: string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

export function normalizeAutocompleteInput(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export function mapGoogleAutocompleteResponse(response: GoogleAutocompleteResponse): GooglePlaceAutocompleteSuggestion[] {
  return (response.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId && prediction.text?.text))
    .map((prediction) => ({
      placeId: prediction.placeId ?? "",
      resourceName: prediction.place ?? `places/${prediction.placeId}`,
      text: prediction.text?.text ?? "",
      mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
      types: prediction.types ?? [],
    }));
}

export function mapGooglePlaceDetailsResponse(response: GooglePlaceDetailsResponse): GooglePlaceDetails | null {
  const placeId = response.id ?? response.name?.replace(/^places\//, "");
  const formattedAddress = response.formattedAddress?.trim();

  if (!placeId || !formattedAddress) {
    return null;
  }

  return {
    placeId,
    resourceName: response.name ?? `places/${placeId}`,
    formattedAddress,
    latitude: response.location?.latitude,
    longitude: response.location?.longitude,
  };
}
