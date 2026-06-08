import { describe, expect, it } from "vitest";

import { buildMeasurementSourceContext } from "./measurement-source-context";
import type { PropertyMatch } from "./property-match";

const propertyMatch: PropertyMatch = {
  status: "validated",
  source: "google_address_validation",
  formattedAddress: "123 Cypress Point Dr, Boca Raton, FL 33431, USA",
  latitude: 26.391234,
  longitude: -80.083456,
  validationGranularity: "PREMISE",
  detail: "Validated at premise granularity.",
};

describe("measurement source context", () => {
  it("combines address validation, Google Solar, and public footprint signals", async () => {
    const result = await buildMeasurementSourceContext({
      propertyMatch,
      googleMapsApiKey: "server-key",
      fetchFn: async (input, init) => {
        const url = String(input);

        if (url.includes("buildingInsights")) {
          return new Response(
            JSON.stringify({
              name: "buildings/google-place-id",
              imageryQuality: "HIGH",
              solarPotential: {
                roofSegmentStats: [
                  {
                    stats: { areaMeters2: 121.5, groundAreaMeters2: 115.1 },
                    pitchDegrees: 18.2,
                  },
                ],
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("dataLayers")) {
          return new Response(JSON.stringify({ imageryQuality: "HIGH", rgbUrl: "https://solar.example/rgb.tif" }), {
            status: 200,
          });
        }

        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            elements: [
              {
                type: "way",
                id: 101,
                tags: { building: "yes" },
                geometry: [
                  { lat: 26.3911, lon: -80.0836 },
                  { lat: 26.3911, lon: -80.0833 },
                  { lat: 26.3914, lon: -80.0833 },
                  { lat: 26.3914, lon: -80.0836 },
                  { lat: 26.3911, lon: -80.0836 },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    expect(result.signals.addressValidation?.status).toBe("used");
    expect(result.signals.googleSolar?.status).toBe("used");
    expect(result.signals.publicFootprints?.status).toBe("used");
    expect(result.payloads.address_validation).toEqual(propertyMatch);
    expect(result.payloads.google_solar).toEqual(expect.objectContaining({ buildingInsights: expect.any(Object) }));
    expect(result.details.google_solar).toContain("1 roof segment");
    expect(result.details.public_footprints).toContain("OpenStreetMap");
  });
});
