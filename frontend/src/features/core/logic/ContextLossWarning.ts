import * as AlertBanner from '../../user-interface/alert-banner/logic/AlertBanner';

/**
 * backlog §29 option A — detect and say so.
 *
 * When the browser drops the WebGL context, every GL getter starts returning
 * null. PixiJS reads LINK_STATUS as null, concludes the shader program failed,
 * and its error reporter then dies on `gl.getShaderSource(shader).split()` —
 * destroying the real diagnostic. The throw escapes the rAF callback, so the
 * render loop stops: a blank world with a perfectly healthy HUD, websocket and
 * server tick, plus a handful of TypeErrors that name the wrong thing. It cost
 * four sightings to identify (§29.1); this makes the next one self-labelling.
 *
 * This does NOT fix rendering. Recovery (option B) was not taken: the restore
 * half works, the GPU-state rebuild does not come for free. Hence also no
 * preventDefault() and no `webglcontextrestored` listener — preventing the
 * default is what would permit a restore we have no intention of driving.
 *
 * ⚑ Install on the WORLD canvas only. MiniMap owns a second Application with
 * its own context (the 5th sighting had the minimap rendering while the world
 * did not), and pixi deliberately loses two throwaway probe contexts at boot —
 * neither is this failure.
 */
export function installContextLossWarning(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('webglcontextlost', () => {
        // The log is the load-bearing half: AlertBanner.show() no-ops until the
        // HUD is set up, and a mid-boot loss is the reproduced case.
        console.error('[webgl] world context lost — rendering has stopped. Reload the page. (backlog §29)');
        AlertBanner.show('Graphics context lost — please reload the page.', 'warning');
    });
}
