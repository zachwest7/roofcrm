import { describe, expect, it } from "vitest";

import { buildGoogleSatelliteRoofPreviewUrl, getGoogleSatellitePreviewCenterCoordinates } from "./roof-preview-url";

describe("buildGoogleSatelliteRoofPreviewUrl", () => {
  it("builds a satellite static map url centered on validated coordinates", () => {
    const url = new URL(
      buildGoogleSatelliteRoofPreviewUrl({
        apiKey: "browser-key",
        propertyMatch: {
          status: "validated",
          source: "google_address_validation",
          formattedAddress: "123 Cypress Point Dr, Boca Raton, FL 33431, USA",
          latitude: 26.3912345,
          longitude: -80.0834567,
          detail: "Validated at premise granularity.",
        },
        fallbackAddress: "123 Cypress Point Dr, Boca Raton, FL",
      }) ?? "",
    );

    expect(url.origin).toBe("https://maps.googleapis.com");
    expect(url.pathname).toBe("/maps/api/staticmap");
    expect(url.searchParams.get("center")).toBe("26.391235,-80.083457");
    expect(url.searchParams.get("zoom")).toBe("20");
    expect(url.searchParams.get("size")).toBe("640x420");
    expect(url.searchParams.get("scale")).toBe("2");
    expect(url.searchParams.get("maptype")).toBe("satellite");
    expect(url.searchParams.get("key")).toBe("browser-key");
  });

  it("falls back to the address when coordinates are not available", () => {
    const url = new URL(
      buildGoogleSatelliteRoofPreviewUrl({
        apiKey: "browser-key",
        propertyMatch: {
          status: "typed_only",
          source: "manual",
          formattedAddress: "123 Cypress Point Dr, Boca Raton, FL",
          detail: "Typed address has not been matched to a property yet.",
        },
        fallbackAddress: "123 Cypress Point Dr, Boca Raton, FL",
      }) ?? "",
    );

    expect(url.searchParams.get("center")).toBe("123 Cypress Point Dr, Boca Raton, FL");
  });

  it("uses a caller-provided zoom level for field review controls", () => {
    const url = new URL(
      buildGoogleSatelliteRoofPreviewUrl({
        apiKey: "browser-key",
        propertyMatch: {
          status: "selected_from_google",
          source: "google_places",
          formattedAddress: "123 Cypress Point Dr, Boca Raton, FL",
          latitude: 26.3912345,
          longitude: -80.0834567,
          detail: "Selected from Google Places.",
        },
        fallbackAddress: "123 Cypress Point Dr, Boca Raton, FL",
        zoom: 21,
      }) ?? "",
    );

    expect(url.searchParams.get("zoom")).toBe("21");
  });

  it("does not build a public image url without a browser key", () => {
    expect(
      buildGoogleSatelliteRoofPreviewUrl({
        apiKey: "",
        propertyMatch: {
          status: "typed_only",
          source: "manual",
          detail: "Typed address has not been matched to a property yet.",
        },
        fallbackAddress: "123 Cypress Point Dr, Boca Raton, FL",
      }),
    ).toBeNull();
  });

  it("returns center coordinates only when the property match has lat/lng", () => {
    expect(
      getGoogleSatellitePreviewCenterCoordinates({
        status: "selected_from_google",
        source: "google_places",
        formattedAddress: "123 Cypress Point Dr, Boca Raton, FL",
        latitude: 26.3912345,
        longitude: -80.0834567,
        detail: "Selected from Google Places.",
      }),
    ).toEqual({ latitude: 26.3912345, longitude: -80.0834567 });

    expect(
      getGoogleSatellitePreviewCenterCoordinates({
        status: "typed_only",
        source: "manual",
        formattedAddress: "123 Cypress Point Dr, Boca Raton, FL",
        detail: "Typed address has not been matched to a property yet.",
      }),
    ).toBeUndefined();
  });
});
