import { describe, expect, it } from "vitest";

import { buildGoogleMapsPlacesScriptUrl, waitForGooglePlacesAutocomplete } from "./google-maps-loader";

describe("buildGoogleMapsPlacesScriptUrl", () => {
  it("loads the Maps JavaScript API with the Places library", () => {
    const url = new URL(buildGoogleMapsPlacesScriptUrl("browser-key"));

    expect(url.origin).toBe("https://maps.googleapis.com");
    expect(url.pathname).toBe("/maps/api/js");
    expect(url.searchParams.get("key")).toBe("browser-key");
    expect(url.searchParams.get("libraries")).toBe("places");
    expect(url.searchParams.get("v")).toBe("weekly");
    expect(url.searchParams.get("loading")).toBe("async");
  });
});

describe("waitForGooglePlacesAutocomplete", () => {
  it("waits for the Places Autocomplete constructor to become available", async () => {
    const targetWindow = {} as Window & {
      google?: {
        maps?: {
          places?: {
            Autocomplete?: unknown;
          };
        };
      };
    };

    setTimeout(() => {
      targetWindow.google = {
        maps: {
          places: {
            Autocomplete: function Autocomplete() {},
          },
        },
      };
    }, 5);

    await expect(
      waitForGooglePlacesAutocomplete({
        targetWindow,
        intervalMs: 1,
        timeoutMs: 100,
      }),
    ).resolves.toBeUndefined();
  });
});
