import { describe, expect, it } from "vitest";

import {
  mapGoogleAutocompleteResponse,
  mapGooglePlaceDetailsResponse,
  normalizeAutocompleteInput,
} from "./google-places-autocomplete";

describe("normalizeAutocompleteInput", () => {
  it("trims and compacts search text before querying Google", () => {
    expect(normalizeAutocompleteInput("  19024   Lake   Lindsey  ")).toBe("19024 Lake Lindsey");
  });
});

describe("mapGoogleAutocompleteResponse", () => {
  it("maps Places API New suggestions into lightweight address suggestions", () => {
    expect(
      mapGoogleAutocompleteResponse({
        suggestions: [
          {
            placePrediction: {
              place: "places/abc123",
              placeId: "abc123",
              text: { text: "19024 Lake Lindsey Road, Brooksville, FL, USA" },
              structuredFormat: {
                mainText: { text: "19024 Lake Lindsey Road" },
                secondaryText: { text: "Brooksville, FL, USA" },
              },
              types: ["premise", "geocode"],
            },
          },
        ],
      }),
    ).toEqual([
      {
        placeId: "abc123",
        resourceName: "places/abc123",
        text: "19024 Lake Lindsey Road, Brooksville, FL, USA",
        mainText: "19024 Lake Lindsey Road",
        secondaryText: "Brooksville, FL, USA",
        types: ["premise", "geocode"],
      },
    ]);
  });

  it("drops query predictions and malformed place predictions", () => {
    expect(
      mapGoogleAutocompleteResponse({
        suggestions: [
          {},
          { placePrediction: { placeId: "missing-text" } },
          { placePrediction: { text: { text: "Missing place id" } } },
        ],
      }),
    ).toEqual([]);
  });
});

describe("mapGooglePlaceDetailsResponse", () => {
  it("maps selected place details into address coordinates", () => {
    expect(
      mapGooglePlaceDetailsResponse({
        name: "places/abc123",
        id: "abc123",
        formattedAddress: "19024 Lake Lindsey Road, Brooksville, FL 34601, USA",
        location: {
          latitude: 28.628114,
          longitude: -82.420473,
        },
      }),
    ).toEqual({
      placeId: "abc123",
      resourceName: "places/abc123",
      formattedAddress: "19024 Lake Lindsey Road, Brooksville, FL 34601, USA",
      latitude: 28.628114,
      longitude: -82.420473,
    });
  });

  it("returns null when Google omits required details", () => {
    expect(mapGooglePlaceDetailsResponse({ id: "abc123" })).toBeNull();
  });
});
