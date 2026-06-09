import { GOOGLE_SATELLITE_PREVIEW, normalizeGoogleSatellitePreviewZoom } from "@/lib/measurements/roof-preview-url";

export async function GET(request: Request) {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    return Response.json({ error: "Google Maps API key is not configured." }, { status: 500 });
  }

  const requestUrl = new URL(request.url);
  const center = requestUrl.searchParams.get("center")?.trim();

  if (!center || center.length > 220) {
    return Response.json({ error: "A valid map center is required." }, { status: 400 });
  }

  const params = new URLSearchParams({
    center,
    zoom: String(normalizeGoogleSatellitePreviewZoom(Number(requestUrl.searchParams.get("zoom")))),
    size: `${GOOGLE_SATELLITE_PREVIEW.width}x${GOOGLE_SATELLITE_PREVIEW.height}`,
    scale: "2",
    maptype: "satellite",
    format: "jpg",
    key: apiKey,
  });

  const googleResponse = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!googleResponse.ok) {
    const message = await googleResponse.text().catch(() => "");

    return Response.json(
      { error: message || "Google Static Maps request failed." },
      { status: googleResponse.status },
    );
  }

  return new Response(await googleResponse.arrayBuffer(), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": googleResponse.headers.get("content-type") ?? "image/jpeg",
    },
  });
}

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim() || "";
}
