import { describe, expect, it } from "vitest";

import { buildOverpassFootprintQuery, fetchPublicFootprintSignal } from "./public-footprints";

describe("public footprint source adapter", () => {
  it("builds an Overpass query around the property coordinates", () => {
    const query = buildOverpassFootprintQuery({
      latitude: 26.391234,
      longitude: -80.083456,
      radiusMeters: 45,
    });

    expect(query).toContain("[out:json]");
    expect(query).toContain('["building"]');
    expect(query).toContain("around:45,26.391234,-80.083456");
  });

  it("maps the nearest building footprint into a public footprint signal", async () => {
    const result = await fetchPublicFootprintSignal({
      latitude: 26.391234,
      longitude: -80.083456,
      fetchFn: async () =>
        new Response(
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
        ),
    });

    expect(result.signals.publicFootprints?.status).toBe("used");
    expect(result.signals.publicFootprints?.sourceLabel).toBe("OpenStreetMap building footprint");
    expect(result.signals.publicFootprints?.footprintAreaMeters2).toBeGreaterThan(800);
    expect(result.signals.publicFootprints?.roofSquaresEstimate).toBeGreaterThan(9);
    expect(result.payload.selectedElementId).toBe(101);
  });

  it("keeps public footprints unavailable when no building polygon is returned", async () => {
    const result = await fetchPublicFootprintSignal({
      latitude: 26.391234,
      longitude: -80.083456,
      fetchFn: async () => new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    });

    expect(result.signals.publicFootprints?.status).toBe("unavailable");
    expect(result.detail).toContain("No public building footprint");
  });
});
