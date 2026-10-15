'use client';

import { useState } from 'react';
import { Crosshair, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/inputs';
import { formatCoords, mapUrl } from '@/lib/format';

export type LocationValue = {
  locationName: string;
  latitude: number | null;
  longitude: number | null;
};

export const EMPTY_LOCATION: LocationValue = { locationName: '', latitude: null, longitude: null };

const COORD_DP = 1_000_000;

function round6(n: number): number {
  return Math.round(n * COORD_DP) / COORD_DP;
}

/**
 * Optional site location: a free-text label plus an optional geotag captured from the browser.
 * Coordinates can be set from the device, opened on a map, or cleared. The server stores latitude
 * and longitude as a pair (see `project_coordinates_pair_check`), so both are always sent together.
 */
export function LocationFields({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { latitude, longitude } = value;

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available in this browser.');
      return;
    }
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          ...value,
          latitude: round6(pos.coords.latitude),
          longitude: round6(pos.coords.longitude),
        });
      },
      (err) => {
        setLocating(false);
        setError(err.message || 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Site location" hint="Optional — a place name for the site.">
        <TextInput
          value={value.locationName}
          onChange={(e) => onChange({ ...value, locationName: e.target.value })}
          placeholder="e.g. Whitefield, Bengaluru"
          maxLength={200}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" loading={locating} onClick={useMyLocation}>
          <Crosshair size={16} aria-hidden />
          {latitude !== null && longitude !== null ? 'Update coordinates' : 'Use my location'}
        </Button>

        {latitude !== null && longitude !== null && (
          <>
            <a
              href={mapUrl(latitude, longitude)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"
            >
              <MapPin size={16} aria-hidden /> {formatCoords(latitude, longitude)}
            </a>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange({ ...value, latitude: null, longitude: null })}
            >
              <X size={16} aria-hidden /> Clear
            </Button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
