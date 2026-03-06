export type UnitSystem = 'metric' | 'imperial';

const IN_PER_M   = 39.3701;
const FT_PER_M   = 3.28084;
const FT2_PER_M2 = 10.7639;

export const mToIn   = (m: number) => m * IN_PER_M;
export const inToM   = (v: number) => v / IN_PER_M;
export const mToFt   = (m: number) => m * FT_PER_M;
export const ftToM   = (v: number) => v / FT_PER_M;
export const m2ToFt2 = (m: number) => m * FT2_PER_M2;

/** Format a length in meters as a display string */
export function fmtLg(m: number, unit: UnitSystem, d = 2): string {
  return unit === 'imperial' ? `${(m * FT_PER_M).toFixed(d)} ft` : `${m.toFixed(d)} m`;
}

/** Format an area in m² as a display string */
export function fmtAr(m2: number, unit: UnitSystem, d = 2): string {
  return unit === 'imperial' ? `${(m2 * FT2_PER_M2).toFixed(d)} ft²` : `${m2.toFixed(d)} m²`;
}

/** Unit abbreviation for small lengths (lame width, gap…) */
export const unitSm = (unit: UnitSystem): string => unit === 'imperial' ? 'in' : 'm';

/** Unit abbreviation for large lengths (entraxe, perimeter…) */
export const unitLg = (unit: UnitSystem): string => unit === 'imperial' ? 'ft' : 'm';

/** Detect unit system from browser locale (en-US → imperial) */
export function detectUnit(): UnitSystem {
  const lang = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
  return lang === 'en-us' ? 'imperial' : 'metric';
}
