// lib/travellog/passportData.ts
//
// A curated (not exhaustive) list of common travel destinations for the
// onboarding "digital passport" step, plus first-level subdivisions for the
// handful of countries where travelers commonly think in terms of state/
// province. Countries not listed here just get recorded on their own, with
// no subdivision step — most countries don't have widely-recognized
// first-level divisions relevant to a casual travel context.

export const PASSPORT_COUNTRIES = [
  'United States', 'Canada', 'Mexico', 'United Kingdom', 'Ireland', 'France',
  'Germany', 'Spain', 'Portugal', 'Italy', 'Netherlands', 'Belgium',
  'Switzerland', 'Austria', 'Greece', 'Turkey', 'Sweden', 'Norway',
  'Denmark', 'Finland', 'Poland', 'Czech Republic', 'Iceland', 'Croatia',
  'Japan', 'South Korea', 'China', 'India', 'Thailand', 'Vietnam',
  'Indonesia', 'Malaysia', 'Singapore', 'Philippines', 'Australia',
  'New Zealand', 'United Arab Emirates', 'Egypt', 'South Africa', 'Kenya',
  'Morocco', 'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia',
] as const;

export type PassportCountry = (typeof PASSPORT_COUNTRIES)[number];

export const STATES_BY_COUNTRY: Partial<Record<PassportCountry, string[]>> = {
  'United States': [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
    'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
    'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
    'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  ],
  Canada: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
    'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan',
    'Northwest Territories', 'Nunavut', 'Yukon',
  ],
  Australia: [
    'New South Wales', 'Queensland', 'South Australia', 'Tasmania', 'Victoria',
    'Western Australia', 'Australian Capital Territory', 'Northern Territory',
  ],
  India: [
    'Delhi', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Rajasthan',
    'Gujarat', 'West Bengal', 'Uttar Pradesh', 'Goa', 'Punjab', 'Telangana',
  ],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  Germany: [
    'Baden-Württemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
    'Hesse', 'Lower Saxony', 'Mecklenburg-Vorpommern', 'North Rhine-Westphalia',
    'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt',
    'Schleswig-Holstein', 'Thuringia',
  ],
  Mexico: [
    'Baja California', 'Baja California Sur', 'Jalisco', 'Mexico City', 'Nuevo León',
    'Oaxaca', 'Quintana Roo', 'Yucatán',
  ],
  Brazil: [
    'São Paulo', 'Rio de Janeiro', 'Bahia', 'Minas Gerais', 'Amazonas', 'Paraná',
    'Pernambuco', 'Ceará',
  ],
};

export function statesFor(country: string): string[] {
  return STATES_BY_COUNTRY[country as PassportCountry] ?? [];
}
