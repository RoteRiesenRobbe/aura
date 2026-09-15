/**
 * Exposes certain functionality in the browser console.
 */
import {BackendValidTokenEvent, GameSetupEvent, PlayerCreatedEvent} from '../../../core/logic/Events';
import * as Console from '../../console/logic/Console';
import * as DarknessOverlay from '../../../darkness/logic/DarknessOverlay';
import {Player} from "../../../player/logic/Player";
import {IGame} from "../../../core/logic/IGame";


function setup() {
    // only enable this class if token is valid
    let consoleCommands = {
        run: undefined,
        character: undefined,
        pause: undefined,
        play: undefined,
        miniMap: undefined,
        layers: undefined,
        darkness: undefined,
    };

    consoleCommands.run = Console.run;
    PlayerCreatedEvent.subscribe((player: Player) => {
        consoleCommands.character = player.character;
        return true;
    });

    GameSetupEvent.subscribe((game: IGame) => {
        consoleCommands.pause = game.pause;
        consoleCommands.play = game.play;
        // The map module, for the headless harness (plan-world-map.md C2).
        // Campfire markers are pixi children with no DOM of their own, so C1's
        // pass could only screenshot them and read the result by eye — which is
        // not an assertion. This is an internal-tools surface like everything
        // else on this object; nothing in the game reads it back.
        consoleCommands.miniMap = game.miniMap;
        // The world's render layers, for the same reason and by the same
        // precedent (plan-world-map.md C3). The draw ORDER is a PO ruling —
        // campfires above the characters, every other mob layer below — and a
        // stage-index assertion is the only way to pin it; by eye, a fire that
        // has quietly slipped back under the avatar looks like nothing at all.
        consoleCommands.layers = game.layers;
        // ⛔ THE ONE QUERY IN THIS FEATURE A SCREENSHOT CANNOT CHECK
        // (plan-region-atmosphere.md A4). `isHidden` decides whether a mob's
        // nameplate is readable, and since A4 a CLEARING answers it through a
        // path the profile walk cannot see — a clearing names no profile, so it
        // is invisible to `resolveIn`. Get that seam wrong and the picture stays
        // PERFECT: the hole is painted, the mob is lit, and every nameplate
        // inside the lit pocket is hidden with nothing thrown.
        //
        // ⚑ Same precedent and same reason as `miniMap` and `layers` above: an
        // internal-tools surface, read-only, exposed so the harness can ASSERT
        // rather than screenshot. Nothing in the game reads it back.
        consoleCommands.darkness = {isHidden: DarknessOverlay.isHidden};

        return true;
    });

    window['game'] = consoleCommands;
}

BackendValidTokenEvent.subscribe(setup);
