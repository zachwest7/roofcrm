import { describe, expect, it } from "vitest";

import {
  buildGoogleSolarBuildingInsightsUrl,
  buildGoogleSolarDataLayersUrl,
  fetchGoogleSolarSignals,
} from "./google-solar";

const buildingInsightsResponse = {
  name: "buildings/google-place-id",
  center: { latitude: 26.39123, longitude: -80.08345 },
  boundingBox: {
    sw: { latitude: 26.391, longitude: -80.0837 },
    ne: { latitude: 26.3915, longitude: -80.0832 },
  },
  imageryDate: { year: 2025, month: 2, day: 12 },
  imageryQuality: "HIGH",
  solarPotential: {
    roofSegmentStats: [
      {
        stats: { areaMeters2: 121.5, groundAreaMeters2: 115.1 },
        center: { latitude: 26.39118, longitude: -80.08358 },
        boundingBox: {
          sw: { latitude: 26.39108, longitude: -80.08368 },
          ne: { latitude: 26.39128, longitude: -80.08348 },
        },
        pitchDegrees: 18.2,
        azimuthDegrees: 91,
      },
      {
        stats: { areaMeters2: 98.25, groundAreaMeters2: 91.2 },
        center: { latitude: 26.39135, longitude: -80.08334 },
        boundingBox: {
          sw: { latitude: 26.39124, longitude: -80.08344 },
          ne: { latitude: 26.39146, longitude: -80.08325 },
        },
        pitchDegrees: 21.7,
        azimuthDegrees: 271,
      },
    ],
  },
};

describe("google solar source adapter", () => {
  it("builds official Solar API request urls without leaking client-side state", () => {
    const insightsUrl = new URL(
      buildGoogleSolarBuildingInsightsUrl({
        apiKey: "server-key",
        latitude: 26.391234,
        longitude: -80.083456,
      }),
    );
    const layersUrl = new URL(
      buildGoogleSolarDataLayersUrl({
        apiKey: "server-key",
        latitude: 26.391234,
        longitude: -80.083456,
      }),
    );

    expect(insightsUrl.origin).toBe("https://solar.googleapis.com");
    expect(insightsUrl.pathname).toBe("/v1/buildingInsights:findClosest");
    expect(insightsUrl.searchParams.get("location.latitude")).toBe("26.391234");
    expect(insightsUrl.searchParams.get("location.longitude")).toBe("-80.083456");
    expect(insightsUrl.searchParams.get("requiredQuality")).toBe("MEDIUM");
    expect(insightsUrl.searchParams.get("key")).toBe("server-key");

    expect(layersUrl.pathname).toBe("/v1/dataLayers:get");
    expect(layersUrl.searchParams.get("view")).toBe("IMAGERY_LAYERS");
    expect(layersUrl.searchParams.get("radiusMeters")).toBe("80");
    expect(layersUrl.searchParams.get("pixelSizeMeters")).toBe("0.25");
  });

  it("maps Solar roof segment stats and imagery layers into measurement signals", async () => {
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      calls.push(url);

      if (url.includes("buildingInsights")) {
        return new Response(JSON.stringify(buildingInsightsResponse), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          imageryDate: { year: 2025, month: 2, day: 12 },
          imageryQuality: "HIGH",
          rgbUrl: "https://solar.example/rgb.tif",
          maskUrl: "https://solar.example/mask.tif",
          dsmUrl: "https://solar.example/dsm.tif",
        }),
        { status: 200 },
      );
    };

    const result = await fetchGoogleSolarSignals({
      apiKey: "server-key",
      latitude: 26.391234,
      longitude: -80.083456,
      fetchFn,
      maskOutlineFetcher: async () => ({
        source: "google_solar_mask",
        status: "proposed",
        imageWidth: 8,
        imageHeight: 6,
        areaPixels: 22,
        confidenceScore: 76,
        polygons: [
          {
            id: "auto-roof-outline-1",
            label: "Auto roof outline",
            areaPixels: 22,
            points: [
              { x: 1, y: 1 },
              { x: 7, y: 1 },
              { x: 7, y: 3 },
              { x: 6, y: 3 },
              { x: 6, y: 5 },
              { x: 1, y: 5 },
            ],
          },
        ],
        detail: "Auto outline extracted from Google Solar roof mask pixels. Manager review is still required.",
      }),
      rasterPreviewFetcher: async () => ({
        source: "google_solar_rgb_mask",
        imageWidth: 8,
        imageHeight: 6,
        imageDataUrl: "data:image/png;base64,preview",
        roofPixels: 22,
        maskOpacity: 0.44,
        detail: "Rendered from Google Solar RGB imagery with the roof mask tinted for manager review.",
      }),
    });

    expect(calls).toHaveLength(2);
    expect(result.signals.googleSolar?.status).toBe("used");
    expect(result.signals.googleSolar?.imageryQuality).toBe("HIGH");
    expect(result.signals.googleSolar?.roofSegmentStats).toHaveLength(2);
    expect(result.signals.googleSolar?.roofSegmentStats?.[0]).toEqual(
      expect.objectContaining({
        areaMeters2: 121.5,
        pitchDegrees: 18.2,
        azimuthDegrees: 91,
      }),
    );
    expect(result.signals.solarDataLayers?.status).toBe("used");
    expect(result.signals.solarDataLayers?.rgbUrl).toBe("https://solar.example/rgb.tif");
    expect(result.signals.solarDataLayers?.autoRoofOutline?.polygons[0].points).toContainEqual({ x: 7, y: 3 });
    expect(result.signals.solarDataLayers?.rasterPreview?.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.payload.buildingInsights).toEqual(buildingInsightsResponse);
  });

  it("keeps Solar unavailable when coverage is missing", async () => {
    const result = await fetchGoogleSolarSignals({
      apiKey: "server-key",
      latitude: 26.391234,
      longitude: -80.083456,
      fetchFn: async () => new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 }),
    });

    expect(result.signals.googleSolar?.status).toBe("unavailable");
    expect(result.detail).toContain("not available");
    expect(result.payload.error?.status).toBe(404);
  });
});
