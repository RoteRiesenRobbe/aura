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

const DEFAULT_LEVEL_INDEX = 1;

let currentIndex = DEFAULT_LEVEL_INDEX;

export function canZoomIn(): boolean {
    return currentIndex > 0;
}

export function canZoomOut(): boolean {
    return currentIndex < ZOOM_LEVEL_HEIGHTS.length - 1;
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
 * the level's world height nor the streaming width cap is ever exceeded.
 */
export function viewScale(screenWidth: number, screenHeight: number): number {
    return Math.max(
        screenHeight / ZOOM_LEVEL_HEIGHTS[currentIndex],
        screenWidth / MAX_VISIBLE_WIDTH,
    );
}
