// lib/travellog/types.ts

export interface TravelVisitRow {
  id: string;
  profileId: string;
  placeName: string;
  country: string;
  lat: number;
  lng: number;
  arrivalDate: string;       // 'YYYY-MM-DD'
  departureDate: string | null; // 'YYYY-MM-DD', null = single-day visit
  notes: string | null;
  createdAt: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A visit counts as "explored" (multi-day hotspot) once the stay spans at least one full day. */
export function isExplored(visit: TravelVisitRow): boolean {
  if (!visit.departureDate) return false;
  const arrival = new Date(visit.arrivalDate).getTime();
  const departure = new Date(visit.departureDate).getTime();
  return departure - arrival >= MS_PER_DAY;
}
