"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

import { loadGooglePlacesScript } from "./google-maps-loader";

const googleMapsBrowserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();

type GooglePlace = {
  formatted_address?: string;
  name?: string;
  place_id?: string;
};

type GoogleAutocomplete = {
  addListener: (eventName: "place_changed", handler: () => void) => GoogleMapsEventListener;
  getPlace: () => GooglePlace;
};

type GoogleAutocompleteOptions = {
  componentRestrictions: { country: string };
  fields: string[];
  types: string[];
};

type GoogleAutocompleteConstructor = new (
  input: HTMLInputElement,
  options: GoogleAutocompleteOptions,
) => GoogleAutocomplete;

type GoogleMapsEventListener = {
  remove: () => void;
};

type GooglePlacesWindow = Window & {
  google?: {
    maps?: {
      event?: {
        clearInstanceListeners: (instance: GoogleAutocomplete) => void;
      };
      places?: {
        Autocomplete?: GoogleAutocompleteConstructor;
      };
    };
  };
};

export function AddressAutocompleteInput({
  value,
  onValueChange,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onValueChangeRef = useRef(onValueChange);
  const autocompleteRef = useRef<GoogleAutocomplete | null>(null);
  const [isAutocompleteReady, setIsAutocompleteReady] = useState(false);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    if (!googleMapsBrowserKey) {
      return;
    }

    let isDisposed = false;
    let placeChangedListener: GoogleMapsEventListener | null = null;

    loadGooglePlacesScript(googleMapsBrowserKey)
      .then(() => {
        if (isDisposed || !inputRef.current) {
          return;
        }

        const Autocomplete = (window as GooglePlacesWindow).google?.maps?.places?.Autocomplete;

        if (!Autocomplete) {
          return;
        }

        const autocomplete = new Autocomplete(inputRef.current, {
          componentRestrictions: { country: "us" },
          fields: ["formatted_address", "name", "place_id", "geometry"],
          types: ["address"],
        });

        autocompleteRef.current = autocomplete;
        setIsAutocompleteReady(true);

        placeChangedListener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const selectedAddress = place.formatted_address ?? inputRef.current?.value ?? "";

          if (selectedAddress.trim()) {
            onValueChangeRef.current(selectedAddress);
          }
        });
      })
      .catch(() => {
        if (!isDisposed) {
          setIsAutocompleteReady(false);
        }
      });

    return () => {
      isDisposed = true;
      placeChangedListener?.remove();

      if (autocompleteRef.current) {
        (window as GooglePlacesWindow).google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder="Start typing an address"
        autoComplete="street-address"
        disabled={disabled}
        className={googleMapsBrowserKey ? "pr-8" : undefined}
      />
      {googleMapsBrowserKey ? (
        <MapPin
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 transition-colors",
            isAutocompleteReady ? "text-sky-700" : "text-slate-400",
          )}
        />
      ) : null}
    </div>
  );
}
