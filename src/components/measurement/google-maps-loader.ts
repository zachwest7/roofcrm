const GOOGLE_MAPS_PLACES_SCRIPT_ID = "google-maps-places-js";

let googleMapsPlacesLoadPromise: Promise<void> | null = null;

type GoogleMapsPlacesWindow = Window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete?: unknown;
      };
    };
  };
};

export function buildGoogleMapsPlacesScriptUrl(apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    libraries: "places",
    v: "weekly",
    loading: "async",
  });

  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

export function isGooglePlacesAutocompleteReady(targetWindow?: Window) {
  if (!targetWindow && typeof window === "undefined") {
    return false;
  }

  const googleWindow = (targetWindow ?? window) as GoogleMapsPlacesWindow;

  return typeof googleWindow.google?.maps?.places?.Autocomplete === "function";
}

export function loadGooglePlacesScript(apiKey: string) {
  if (!apiKey.trim()) {
    return Promise.reject(new Error("Missing Google Maps browser key."));
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps Places autocomplete requires a browser."));
  }

  if (isGooglePlacesAutocompleteReady(window)) {
    return Promise.resolve();
  }

  if (googleMapsPlacesLoadPromise) {
    return googleMapsPlacesLoadPromise;
  }

  googleMapsPlacesLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_PLACES_SCRIPT_ID) as HTMLScriptElement | null;

    function handleLoad() {
      if (isGooglePlacesAutocompleteReady(window)) {
        resolve();
        return;
      }

      googleMapsPlacesLoadPromise = null;
      reject(new Error("Google Maps Places autocomplete did not initialize."));
    }

    function handleError() {
      googleMapsPlacesLoadPromise = null;
      reject(new Error("Google Maps JavaScript API failed to load."));
    }

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_PLACES_SCRIPT_ID;
    script.src = buildGoogleMapsPlacesScriptUrl(apiKey);
    script.async = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return googleMapsPlacesLoadPromise;
}
