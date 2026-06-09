import { mapGooglePlaceDetailsResponse } from "@/lib/measurements/google-places-autocomplete";

export async function POST(request: Request) {
  const apiKey = getGooglePlacesApiKey();

  if (!apiKey) {
    return Response.json({ error: "Google Places API key is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const placeId = String(body?.placeId ?? "").trim();

  if (!placeId) {
    return Response.json({ error: "A placeId is required." }, { status: 400 });
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,name,formattedAddress,location",
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return Response.json(
      {
        error: getGoogleErrorMessage(payload) ?? "Google Place Details request failed.",
      },
      { status: response.status },
    );
  }

  const place = mapGooglePlaceDetailsResponse(payload);

  if (!place) {
    return Response.json({ error: "Google did not return address details for this place." }, { status: 502 });
  }

  return Response.json({ place });
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
