import {meter2px} from '../../../client-data/BasicConfig';

/**
 * Fixed field of view: the visible world area is defined by the zoom level
 * constants below, never by the browser window. The camera scales the world
 * so the current level's world height always fits the canvas — browser zoom
 * and window size only change render sharpness and aspect ratio, not how
 * much of the world is visible.
 */

// Visible world height per zoom level, in world px. Index 0 = nearest.
// [PLACEHOLDER] middle ≈ the pre-zoom 100%-browser-zoom view,
// furthest ≈ the pre-zoom 80%-browser-zoom view.
const ZOOM_LEVEL_HEIGHTS: number[] = [6, 7.6, 9.5].map(m => meter2px(m));

// Hard cap on the visible world width, in world px. Keeps ultrawide windows
// at max zoom-out inside the server's 20 m entity-streaming viewport
// (BasicConfig.VIEWPORT) — beyond it, entities visibly pop in/out.
// [PLACEHOLDER]
const MAX_VISIBLE_WIDTH = meter2px(18);

/**
 * How far the server grows a flyer's area of interest for the duration of a
 * campfire-to-campfire flight (plan-flight-paths.md D3, §4.3).
 *
 * ⚑ SYNCED WITH BACKEND: `flightViewportScale` in
 * `backend/pkg/aura/model/player/flight.go`. The client zoom cap and the
 * server AOI must move TOGETHER — the cap below exists precisely because
 * entities pop in beyond the streamed area, so a client that zoomed out
 * without the server streaming wider would bring that symptom straight back
 * (landmine 3). Both flight values are this one factor times the ground
 * values, never independent literals, so a retune on either side is one
 * number and the safety margins (18/20 wide, 9.5/12 tall) carry over
 * unchanged. `Zoom.test.ts` pins that derivation — and, because it can only
 * see this side, `TestFlightViewportScale_MatchesTheClient` (in the Go
 * package that owns the AOI) reads this file and fails when the two numbers
 * stop agreeing. Retune BOTH.
 *
 * [PLACEHOLDER] — cut twice by the PO's in-air passes on 2026-08-05:
 * 2.5 → 1.75 → 1.2, each time "still too far out". 1.2× linear is ~1.4×
 * streamed AND rendered area, down from ~6.25×, so this is no longer the
 * mobile-perf knob it was built as.
 */
export const FLIGHT_VIEWPORT_SCALE = 1.2;

const DEFAULT_LEVEL_INDEX = 1;

let currentIndex = DEFAULT_LEVEL_INDEX;

/**
 * Flight is an OVERRIDE, not a fourth zoom level: `currentIndex` is never
 * touched while airborne, so landing restores the player's own zoom by
 * construction rather than through a save/restore pair that could go out of
 * sync — the same discipline the server's single `Ground()` re-entry buys
 * (plan-flight-paths.md D13). While it is on, both zoom buttons report
 * unavailable, which greys them out through the existing render path.
 */
let flightZoom = false;

export function setFlightZoom(active: boolean): void {
    flightZoom = active;
}

export function isFlightZoom(): boolean {
    return flightZoom;
}

/** The visible-height/width pair in force right now, in world px. */
export function visibleBounds(): { height: number, width: number } {
    if (flightZoom) {
        return {
            height: ZOOM_LEVEL_HEIGHTS[ZOOM_LEVEL_HEIGHTS.length - 1] * FLIGHT_VIEWPORT_SCALE,
            width: MAX_VISIBLE_WIDTH * FLIGHT_VIEWPORT_SCALE,
        };
    }
    return {height: ZOOM_LEVEL_HEIGHTS[currentIndex], width: MAX_VISIBLE_WIDTH};
}

export function canZoomIn(): boolean {
    return !flightZoom && currentIndex > 0;
}

export function canZoomOut(): boolean {
    return !flightZoom && currentIndex < ZOOM_LEVEL_HEIGHTS.length - 1;
}

export function zoomIn(): void {
    if (canZoomIn()) {
        currentIndex--;
    }
}

export function zoomOut(): void {
    if (canZoomOut()) {
        currentIndex++;
    }
}

/**
 * 1 = nearest … 3 = furthest, for the HUD display.
 */
export function getLevelNumber(): number {
    return currentIndex + 1;
}

/**
 * Screen px per world px. "Cover" semantics: the max() guarantees neither
 * the current world height nor the streaming width cap is ever exceeded.
 */
export function viewScale(screenWidth: number, screenHeight: number): number {
    const bounds = visibleBounds();
    return Math.max(
        screenHeight / bounds.height,
        screenWidth / bounds.width,
    );
}
