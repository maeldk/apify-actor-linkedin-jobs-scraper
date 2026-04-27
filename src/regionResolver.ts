/**
 * ISO-2 country code → LinkedIn country-level geoId.
 *
 * Static map of major markets verified from `_lib/linkedin/catalog.json` and the
 * LinkedIn typeahead endpoint. LinkedIn geoIds have been stable across years.
 * If a code isn't here, the resolver returns null and main.ts logs a warning
 * — users should fall back to `geoIds[]` for unsupported markets.
 */
import { REGION_PRESETS } from './constants.js';

export const ISO2_TO_GEOID: Record<string, string> = {
  // Europe
  AT: '103883259', // Austria
  BE: '100565514', // Belgium
  BG: '105333783', // Bulgaria
  CH: '106693272', // Switzerland
  CY: '105642983', // Cyprus
  CZ: '104508036', // Czech Republic
  DE: '101282230', // Germany
  DK: '104514075', // Denmark
  EE: '102974008', // Estonia
  ES: '105646813', // Spain
  FI: '100456013', // Finland
  FR: '105015875', // France
  GB: '101165590', // United Kingdom
  GR: '104677530', // Greece
  HR: '104688944', // Croatia
  HU: '100288700', // Hungary
  IE: '104738515', // Ireland
  IS: '105238872', // Iceland
  IT: '103350119', // Italy
  LT: '101464403', // Lithuania
  LU: '104042105', // Luxembourg
  LV: '104341318', // Latvia
  MT: '106659145', // Malta
  NL: '102890719', // Netherlands
  NO: '103819153', // Norway
  PL: '105072130', // Poland
  PT: '100364837', // Portugal
  RO: '106670623', // Romania
  RS: '101855366', // Serbia
  SE: '105117694', // Sweden
  SI: '106137034', // Slovenia
  SK: '103119917', // Slovakia
  UA: '102264497', // Ukraine

  // Americas
  AR: '100446943', // Argentina
  BO: '104379274', // Bolivia
  BR: '106057199', // Brazil
  CA: '101174742', // Canada
  CL: '104621616', // Chile
  CO: '100876405', // Colombia
  CR: '101739942', // Costa Rica
  DO: '105057336', // Dominican Republic
  EC: '106373116', // Ecuador
  GT: '100877388', // Guatemala
  GY: '105836293', // Guyana
  JM: '105126983', // Jamaica
  MX: '103323778', // Mexico
  PA: '100808673', // Panama
  PE: '102927786', // Peru
  PR: '105245958', // Puerto Rico
  PY: '104065273', // Paraguay
  US: '103644278', // United States
  UY: '100867946', // Uruguay
  VE: '101490751', // Venezuela

  // Asia-Pacific
  AU: '101452733', // Australia
  BN: '103809722', // Brunei
  HK: '103291313', // Hong Kong SAR
  ID: '102478259', // Indonesia
  IN: '102713980', // India
  JP: '101355337', // Japan
  KH: '102500897', // Cambodia
  KR: '105149562', // South Korea
  LA: '100664862', // Laos
  MM: '104136533', // Myanmar
  MY: '106808692', // Malaysia
  NZ: '105490917', // New Zealand
  PH: '103121230', // Philippines
  SG: '102454443', // Singapore
  TH: '105146118', // Thailand
  TW: '104187078', // Taiwan
  VN: '104195383', // Vietnam

  // Middle East
  AE: '104305776', // United Arab Emirates
  BH: '100425729', // Bahrain
  IL: '101620260', // Israel
  KW: '103239229', // Kuwait
  OM: '100620810', // Oman
  QA: '104170880', // Qatar
  SA: '100459316', // Saudi Arabia
  TR: '102105699', // Turkey

  // Africa
  DZ: '106395874', // Algeria
  EG: '106155005', // Egypt
  KE: '100710459', // Kenya
  MA: '102787409', // Morocco
  NG: '105365761', // Nigeria
  TN: '102134353', // Tunisia
  ZA: '104035573', // South Africa

  // Other MENA
  JO: '103710677', // Jordan
  LB: '101834488', // Lebanon
};

export interface ResolvedRegions {
  geoIds: string[];
  unresolved: string[];
}

/**
 * Resolve an array of ISO-2 codes (and one optional regionPreset) into geoIds.
 * Codes outside ISO2_TO_GEOID surface in `unresolved` so main.ts can warn.
 * Output preserves input order; duplicates are removed.
 */
export function resolveRegions(
  regions: string[] | undefined,
  preset: keyof typeof REGION_PRESETS | undefined,
): ResolvedRegions {
  const codes = new Set<string>();
  if (preset && REGION_PRESETS[preset]) {
    for (const c of REGION_PRESETS[preset]) codes.add(c);
  }
  if (regions) {
    for (const c of regions) {
      const upper = c.trim().toUpperCase();
      if (upper) codes.add(upper);
    }
  }

  const geoIds: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    const id = ISO2_TO_GEOID[code];
    if (!id) { unresolved.push(code); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    geoIds.push(id);
  }
  return { geoIds, unresolved };
}
