// lib/travellog/countryViewBox.ts
//
// Crops the world map down to the bounding box of a set of points, for the
// per-country mini-maps. Shared by the Map tab's country grid and the
// passport's country pages — it lived inside MapContent until the passport
// needed the same crop.

import { projectPoint, type MapPoint } from '@/components/ui/world-map';

const COUNTRY_MAP_PADDING_DEG = 5;

export function countryViewBox(points: MapPoint[]): string {
  const projected = points.map((p) => projectPoint(p.lat, p.lng));
  const padX = (COUNTRY_MAP_PADDING_DEG / 360) * 800;
  const padY = (COUNTRY_MAP_PADDING_DEG / 180) * 400;
  const minX = Math.max(0, Math.min(...projected.map((p) => p.x)) - padX);
  const maxX = Math.min(800, Math.max(...projected.map((p) => p.x)) + padX);
  const minY = Math.max(0, Math.min(...projected.map((p) => p.y)) - padY);
  const maxY = Math.min(400, Math.max(...projected.map((p) => p.y)) + padY);
  // Keep the 2:1 aspect ratio the map is rendered at, otherwise the crop
  // looks stretched — widen whichever axis is too narrow for it. The floor
  // keeps a single-city country (a zero-size bounding box) from cropping
  // down to a comically zoomed-in dot with oversized text.
  const w = Math.max(maxX - minX, 60);
  const h = Math.max(maxY - minY, 30);
  const aspect = 2;
  if (w / h > aspect) {
    const targetH = w / aspect;
    const cy = (minY + maxY) / 2;
    return `${minX} ${cy - targetH / 2} ${w} ${targetH}`;
  }
  const targetW = h * aspect;
  const cx = (minX + maxX) / 2;
  return `${cx - targetW / 2} ${minY} ${targetW} ${h}`;
}
