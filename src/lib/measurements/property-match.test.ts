import { describe, expect, it } from "vitest";

import {
  createGooglePlacesPropertyMatch,
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
});
