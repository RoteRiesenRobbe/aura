import {afterEach, describe, expect, it} from 'vitest';
import * as Zoom from './Zoom';
import {BasicConfig} from '../../../client-data/BasicConfig';

/**
 * The flight zoom override (plan-flight-paths.md C3, landmine 3).
 *
 * The point of these is the COUPLING, not the numbers: the client may only
 * show as much world as the server streams, and the flight values are the
 * ground values times one named factor that also lives in the Go player
 * package. Retuning either side alone has to fail here rather than come back
 * as entities popping in at the screen edges mid-flight — the exact symptom
 * MAX_VISIBLE_WIDTH's comment was written to prevent.
 */
describe('Zoom flight override', () => {
    afterEach(() => {
        Zoom.setFlightZoom(false);
    });

    it('is off by default', () => {
        expect(Zoom.isFlightZoom()).toBe(false);
    });

    it('scales BOTH visible bounds by exactly FLIGHT_VIEWPORT_SCALE', () => {
        // Ground state at the furthest level — the pair flight is derived from.
        while (Zoom.canZoomOut()) {
            Zoom.zoomOut();
        }
        const ground = Zoom.visibleBounds();

        Zoom.setFlightZoom(true);
        const flight = Zoom.visibleBounds();

        expect(flight.height).toBeCloseTo(ground.height * Zoom.FLIGHT_VIEWPORT_SCALE, 5);
        expect(flight.width).toBeCloseTo(ground.width * Zoom.FLIGHT_VIEWPORT_SCALE, 5);
    });

    it('never shows more than the server streams, in flight or on the ground', () => {
        const server = {
            width: BasicConfig.VIEWPORT.WIDTH,
            height: BasicConfig.VIEWPORT.HEIGHT,
        };

        const ground = Zoom.visibleBounds();
        expect(ground.width).toBeLessThanOrEqual(server.width);
        expect(ground.height).toBeLessThanOrEqual(server.height);

        Zoom.setFlightZoom(true);
        const flight = Zoom.visibleBounds();
        expect(flight.width).toBeLessThanOrEqual(server.width * Zoom.FLIGHT_VIEWPORT_SCALE);
        expect(flight.height).toBeLessThanOrEqual(server.height * Zoom.FLIGHT_VIEWPORT_SCALE);
    });

    it('zooms out the view rather than in', () => {
        const grounded = Zoom.viewScale(1920, 1080);
        Zoom.setFlightZoom(true);
        expect(Zoom.viewScale(1920, 1080)).toBeLessThan(grounded);
    });

    it('locks both zoom buttons while flying, and restores the level on landing', () => {
        // Land on a level with both directions available, so "locked" is
        // distinguishable from "already at an end stop".
        while (Zoom.canZoomIn()) {
            Zoom.zoomIn();
        }
        Zoom.zoomOut();
        const level = Zoom.getLevelNumber();
        expect(Zoom.canZoomIn()).toBe(true);
        expect(Zoom.canZoomOut()).toBe(true);

        Zoom.setFlightZoom(true);
        expect(Zoom.canZoomIn()).toBe(false);
        expect(Zoom.canZoomOut()).toBe(false);
        // A press mid-flight must not corrupt the level underneath it — that is
        // why flight is an override and not a fourth level.
        Zoom.zoomIn();
        Zoom.zoomOut();

        Zoom.setFlightZoom(false);
        expect(Zoom.getLevelNumber()).toBe(level);
    });
});
