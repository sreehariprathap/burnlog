// lib/travellog/geocode.ts

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Looks up a place name via OpenStreetMap's Nominatim (free, no API key).
 * Returns the single best match, or null if nothing was found or the
 * request failed — callers fall back to manual lat/lng entry either way.
 */
export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;

    const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const first = results[0];
    if (!first) return null;

    return {
      lat: Number(first.lat),
      lng: Number(first.lon),
      displayName: first.display_name,
    };
  } catch {
    return null;
  }
}
