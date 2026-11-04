/**
 * The game version stamp (plan-bug-report.md D8), read in one place.
 * webpack.common.js injects both values at build time; `typeof` keeps this
 * safe where nothing injects them (vitest).
 */
export const GAME_VERSION: string = typeof __GAME_VERSION__ !== 'undefined' ? __GAME_VERSION__ : 'unknown';
export const BUILD_DATE: string = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'unknown';
