import { describe, expect, it } from "vitest";

import {
  createGooglePlacesPropertyMatch,
  createManuallyAdjustedPropertyMatch,
  createManuallySelectedPropertyTarget,
  createTypedOnlyPropertyMatch,
  mapAddressValidationResponseToPropertyMatch,
} from "./property-match";

describe("property match", () => {
  it("marks precise Google address validation responses as validated property matches", () => {
    const match = mapAddressValidationResponseToPropertyMatch(
      {
        result: {
          verdict: {
            validationGranularity: "PREMISE",
            geocodeGranularity: "PREMISE",
            addressComplete: true,
            hasUnconfirmedComponents: false,
            possibleNextAction: "ACCEPT",
          },
          address: {
            formattedAddress: "123 Cypress Point Dr, Boca Raton, FL 33432, USA",
          },
          geocode: {
            location: {
              latitude: 26.3471,
              longitude: -80.0859,
            },
            placeId: "google-place-123",
          },
        },
      },
      { inputAddress: "123 Cypress Point Dr, Boca Raton, FL" },
    );

    expect(match.status).toBe("validated");
    expect(match.source).toBe("google_address_validation");
    expect(match.formattedAddress).toBe("123 Cypress Point Dr, Boca Raton, FL 33432, USA");
    expect(match.placeId).toBe("google-place-123");
    expect(match.latitude).toBe(26.3471);
    expect(match.longitude).toBe(-80.0859);
    expect(match.validationGranularity).toBe("PREMISE");
    expect(match.detail).toContain("Validated at premise granularity");
  });

  it("keeps approximate validation responses in needs-confirmation state", () => {
    const match = mapAddressValidationResponseToPropertyMatch(
      {
        result: {
          verdict: {
            validationGranularity: "ROUTE",
            geocodeGranularity: "ROUTE",
            addressComplete: false,
            hasUnconfirmedComponents: true,
            possibleNextAction: "CONFIRM",
          },
          address: {
            formattedAddress: "Cypress Point Dr, Boca Raton, FL, USA",
          },
        },
      },
      { inputAddress: "123 Cypress Point Dr, Boca Raton, FL" },
    );

    expect(match.status).toBe("needs_confirmation");
    expect(match.detail).toContain("needs manager confirmation");
  });

  it("captures Google Places selections separately from validated addresses", () => {
    const match = createGooglePlacesPropertyMatch({
      formattedAddress: "123 Cypress Point Dr, Boca Raton, FL",
      placeId: "places-id",
      latitude: 26.3,
      longitude: -80.1,
    });

    expect(match.status).toBe("selected_from_google");
    expect(match.source).toBe("google_places");
    expect(match.detail).toContain("Selected from Google Places");
  });

  it("describes typed addresses as unverified", () => {
    const match = createTypedOnlyPropertyMatch("123 Cypress Point Dr");

    expect(match.status).toBe("typed_only");
    expect(match.source).toBe("manual");
  });

  it("nudges a selected target left so the reviewer can correct a neighboring property", () => {
    const selected = createGooglePlacesPropertyMatch({
      formattedAddress: "19024 Test St",
      placeId: "place-19024",
      latitude: 26.391234,
      longitude: -80.083456,
      checkedAt: "2026-06-08T12:00:00.000Z",
    });

    const adjusted = createManuallyAdjustedPropertyMatch(selected, {
      direction: "left",
      distanceFeet: 40,
      checkedAt: "2026-06-08T12:30:00.000Z",
    });

    expect(adjusted.status).toBe("needs_confirmation");
    expect(adjusted.source).toBe("manual");
    expect(adjusted.formattedAddress).toBe("19024 Test St");
    expect(adjusted.placeId).toBe("place-19024");
    expect(adjusted.latitude).toBeCloseTo(26.391234, 6);
    expect(adjusted.longitude).toBeLessThan(selected.longitude ?? 0);
    expect(adjusted.targetCorrection).toMatchObject({
      direction: "left",
      distanceFeet: 40,
      totalEastFeet: -40,
      totalNorthFeet: 0,
    });
  });

  it("keeps a manually corrected target when address validation returns the original geocode", () => {
    const adjusted = createManuallyAdjustedPropertyMatch(
      createGooglePlacesPropertyMatch({
        formattedAddress: "19024 Test St",
        latitude: 26.391234,
        longitude: -80.083456,
      }),
      {
        direction: "left",
        distanceFeet: 40,
        checkedAt: "2026-06-08T12:30:00.000Z",
      },
    );

    const validated = mapAddressValidationResponseToPropertyMatch(
      {
        result: {
          verdict: {
            validationGranularity: "PREMISE",
            geocodeGranularity: "PREMISE",
            addressComplete: true,
            possibleNextAction: "ACCEPT",
          },
          address: { formattedAddress: "19024 Test St, USA" },
          geocode: {
            location: {
              latitude: 26.391234,
              longitude: -80.083456,
            },
            placeId: "validated-place",
          },
        },
      },
      { inputAddress: "19024 Test St", existingMatch: adjusted },
    );

    expect(validated.status).toBe("needs_confirmation");
    expect(validated.source).toBe("manual");
    expect(validated.latitude).toBe(adjusted.latitude);
    expect(validated.longitude).toBe(adjusted.longitude);
    expect(validated.targetCorrection).toEqual(adjusted.targetCorrection);
    expect(validated.detail).toContain("Manually adjusted");
  });

  it("sets a manually selected map target from a satellite tap", () => {
    const selected = createGooglePlacesPropertyMatch({
      formattedAddress: "19024 Test St",
      placeId: "place-19024",
      latitude: 26.391234,
      longitude: -80.083456,
      checkedAt: "2026-06-08T12:00:00.000Z",
    });

    const adjusted = createManuallySelectedPropertyTarget(selected, {
      coordinates: {
        latitude: 26.391114,
        longitude: -80.08385,
      },
      checkedAt: "2026-06-08T12:45:00.000Z",
    });

    expect(adjusted.status).toBe("needs_confirmation");
    expect(adjusted.source).toBe("manual");
    expect(adjusted.latitude).toBe(26.391114);
    expect(adjusted.longitude).toBe(-80.08385);
    expect(adjusted.formattedAddress).toBe("19024 Test St");
    expect(adjusted.placeId).toBe("place-19024");
    expect(adjusted.detail).toContain("selected on the satellite map");
    expect(adjusted.targetCorrection).toMatchObject({
      method: "map_tap",
      totalEastFeet: expect.any(Number),
      totalNorthFeet: expect.any(Number),
      correctedAt: "2026-06-08T12:45:00.000Z",
    });
  });
});
