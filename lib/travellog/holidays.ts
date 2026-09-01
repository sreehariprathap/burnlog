import { addDays, format } from 'date-fns';

export interface Holiday {
  date: string;
  name: string;
}

interface NagerHoliday {
  date: string;
  name: string;
  countryCode: string;
}

async function fetchYear(countryCode: string, year: number): Promise<NagerHoliday[]> {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`);
    if (!res.ok) return [];
    return (await res.json()) as NagerHoliday[];
  } catch {
    return [];
  }
}

/**
 * Fetches public holidays for `countryCode` falling within
 * [fromDate, fromDate + horizonDays]. Free, no API key (date.nager.at).
 * Best-effort: any fetch failure resolves to an empty array rather than
 * throwing — a missing holidays signal should never block suggestions.
 */
export async function fetchUpcomingHolidays(
  countryCode: string,
  fromDate: Date,
  horizonDays: number = 60
): Promise<Holiday[]> {
  const toDate = addDays(fromDate, horizonDays);
  const years = Array.from(new Set([fromDate.getFullYear(), toDate.getFullYear()]));

  const results = await Promise.all(years.map((year) => fetchYear(countryCode, year)));
  const all = results.flat();

  const fromKey = format(fromDate, 'yyyy-MM-dd');
  const toKey = format(toDate, 'yyyy-MM-dd');

  return all
    .filter((h) => h.date >= fromKey && h.date <= toKey)
    .map((h) => ({ date: h.date, name: h.name }));
}
