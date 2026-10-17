import * as Console from '../../console/logic/Console';
import {GamePlayingEvent} from '../../../core/logic/Events';
import {IGame} from '../../../core/logic/IGame';
import {isMapPointerEvent} from '../../../zone-editor/logic/_ZoneEditorPanel';

/**
 * The JUMPER cheat: while it is on, a left press on the world, the docked
 * minimap or the full-screen map teleports you there (a WARP in world px).
 * Presses on any other UI are left alone. Typed `#JUMPER` in the console
 * (toggles; `jumper on` / `jumper off` set it). Client-side only and not
 * remembered: a reload turns it off.
 */
let enabled = false;
let Game: IGame = null;

export function isEnabled(): boolean {
    return enabled;
}

/** Warps the player to a WORLD px position. */
export function jumpTo(x: number, y: number) {
    Console.run(`WARP ${Math.round(x)} ${Math.round(y)}`);
}

Console.registerLocalCommandHandler('jumper', (parameters: string[]) => {
    const arg = (parameters[0] ?? '').toLowerCase();
    if (arg === 'on' || arg === 'off') {
        enabled = arg === 'on';
    } else if (arg === '') {
        enabled = !enabled;
    } else {
        Console.logError('usage: jumper [on|off]');
        return;
    }
    Console.log(enabled
        ? 'JUMPER on: click the world, the minimap or the map to teleport'
        : 'JUMPER off');
});

GamePlayingEvent.subscribe((game: IGame) => {
    Game = game;
});

// On documentElement, not the canvas: the #inputAreas overlay sits above the
// canvas and takes world presses (see isMapPointerEvent). pointerdown, never
// click: MouseManager's mousedown preventDefault suppresses the click. The
// minimap and the full-screen map handle their own presses (MiniMap).
document.documentElement.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!enabled || event.button !== 0 || !Game?.player?.camera) {
        return;
    }
    if (!isMapPointerEvent(event, Game.domElement)) {
        return;
    }
    jumpTo(Game.player.camera.getMapX(event.pageX), Game.player.camera.getMapY(event.pageY));
});
