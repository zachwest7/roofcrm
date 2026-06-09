"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  createGooglePlacesPropertyMatch,
  type PropertyMatch,
} from "@/lib/measurements/property-match";
import type {
  GooglePlaceAutocompleteSuggestion,
  GooglePlaceDetails,
} from "@/lib/measurements/google-places-autocomplete";
import { cn } from "@/lib/utils";

type AutocompleteResponse = {
  suggestions?: GooglePlaceAutocompleteSuggestion[];
  error?: string;
};

type PlaceDetailsResponse = {
  place?: GooglePlaceDetails;
  error?: string;
};

export function AddressAutocompleteInput({
  value,
  onValueChange,
  disabled,
  onPlaceSelected,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  onPlaceSelected?: (match: PropertyMatch) => void;
}) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<GooglePlaceAutocompleteSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [error, setError] = useState("");
  const [sessionToken, setSessionToken] = useState(createSessionToken);
  const isOpen = isFocused && (suggestions.length > 0 || isLoadingSuggestions || Boolean(error));

  useEffect(() => {
    const input = value.trim();

    if (!isFocused || disabled || input.length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingSuggestions(true);
      setError("");

      try {
        const response = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, sessionToken }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as AutocompleteResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Address suggestions failed.");
        }

        setSuggestions(payload.suggestions ?? []);
        setActiveIndex(0);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setSuggestions([]);
        setError(fetchError instanceof Error ? fetchError.message : "Address suggestions failed.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [disabled, isFocused, sessionToken, value]);

  async function selectSuggestion(suggestion: GooglePlaceAutocompleteSuggestion) {
    setIsSelecting(true);
    setError("");

    try {
      const response = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken }),
      });
      const payload = (await response.json()) as PlaceDetailsResponse;

      if (!response.ok || !payload.place) {
        throw new Error(payload.error ?? "Address details failed.");
      }

      onValueChange(payload.place.formattedAddress);
      onPlaceSelected?.(
        createGooglePlacesPropertyMatch({
          formattedAddress: payload.place.formattedAddress,
          placeId: payload.place.placeId,
          latitude: payload.place.latitude,
          longitude: payload.place.longitude,
          checkedAt: new Date().toISOString(),
        }),
      );
      setSuggestions([]);
      setIsFocused(false);
      setSessionToken(createSessionToken());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Address details failed.");
    } finally {
      setIsSelecting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void selectSuggestion(suggestions[activeIndex] ?? suggestions[0]);
    }

    if (event.key === "Escape") {
      setIsFocused(false);
      setSuggestions([]);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;

          onValueChange(nextValue);
          setIsFocused(true);

          if (nextValue.trim().length < 3) {
            setSuggestions([]);
            setError("");
            setIsLoadingSuggestions(false);
          }
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!wrapperRef.current?.contains(document.activeElement)) {
              setIsFocused(false);
            }
          }, 120);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Start typing an address"
        autoComplete="off"
        disabled={disabled || isSelecting}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className="pr-8"
      />
      {isLoadingSuggestions || isSelecting ? (
        <Loader2
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-sky-700"
        />
      ) : suggestions.length > 0 ? (
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-sky-700"
        />
      ) : (
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        />
      )}

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          {suggestions.length > 0 ? (
            <div className="max-h-72 overflow-y-auto py-1">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.placeId}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex w-full min-w-0 flex-col px-3 py-2 text-left transition-colors",
                    index === activeIndex ? "bg-sky-50 text-slate-950" : "text-slate-800 hover:bg-slate-50",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void selectSuggestion(suggestion)}
                >
                  <span className="truncate text-sm font-medium">{suggestion.mainText}</span>
                  <span className="truncate text-xs leading-5 text-slate-500">{suggestion.secondaryText}</span>
                </button>
              ))}
            </div>
          ) : null}
          {isLoadingSuggestions ? <div className="px-3 py-3 text-sm text-slate-500">Searching addresses...</div> : null}
          {error ? <div className="px-3 py-3 text-sm text-red-700">{error}</div> : null}
          <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-400">
            Powered by Google
          </div>
        </div>
      ) : null}
    </div>
  );
}

function createSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
