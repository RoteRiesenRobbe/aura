/**
 * Exposes certain functionality in the browser console.
 */
import {BackendValidTokenEvent, GameSetupEvent, PlayerCreatedEvent} from '../../../core/logic/Events';
import * as Console from '../../console/logic/Console';
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

        return true;
    });

    window['game'] = consoleCommands;
}

BackendValidTokenEvent.subscribe(setup);
