import {
  mapGoogleAutocompleteResponse,
  normalizeAutocompleteInput,
} from "@/lib/measurements/google-places-autocomplete";

export async function POST(request: Request) {
  const apiKey = getGooglePlacesApiKey();

  if (!apiKey) {
    return Response.json({ error: "Google Places API key is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const input = normalizeAutocompleteInput(String(body?.input ?? ""));

  if (input.length < 3) {
    return Response.json({ suggestions: [] });
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["us"],
      sessionToken: body?.sessionToken,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return Response.json(
      {
        error: getGoogleErrorMessage(payload) ?? "Google Places autocomplete request failed.",
      },
      { status: response.status },
    );
  }

  return Response.json({ suggestions: mapGoogleAutocompleteResponse(payload) });
}

function getGooglePlacesApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim() || "";
}

function getGoogleErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return undefined;
  }

  const error = payload.error;

  if (!error || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }

  return typeof error.message === "string" ? error.message : undefined;
}
