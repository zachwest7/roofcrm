import { describe, expect, it } from "vitest";

import { buildGoogleMapsPlacesScriptUrl } from "./google-maps-loader";

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
