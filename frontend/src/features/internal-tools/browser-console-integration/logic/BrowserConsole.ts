/**
 * Exposes certain functionality in the browser console.
 */
import {BackendValidTokenEvent, GameSetupEvent, PlayerCreatedEvent} from '../../../core/logic/Events';
import * as Console from '../../console/logic/Console';
import {Player} from "../../../player/logic/Player";
import {IGame} from "../../../core/logic/IGame";
import {SkillEventData} from "../../../backend/logic/SkillEventNumbers";
import * as SkillFx from "../../../skill-fx/logic/SkillFx";
import {GameSettings} from "../../../game-settings/logic/GameSettings";

// The last non-empty skill-event list and a running total (plan-skill-vfx.md
// C1). Floating numbers are transient PIXI.Text with no DOM of their own, so a
// harness can otherwise only poll the number layer and hope to catch a frame;
// the events are what the client actually decided from. Internal-tools surface
// like everything else on this object - nothing in the game reads it back.
let lastSkillEvents: readonly SkillEventData[] = [];
let skillEventCount = 0;

export function recordSkillEvents(events: readonly SkillEventData[]): void {
    if (events.length === 0) {
        return;
    }
    lastSkillEvents = events;
    skillEventCount += events.length;
}

function setup() {
    // only enable this class if token is valid
    let consoleCommands = {
        run: undefined,
        character: undefined,
        pause: undefined,
        play: undefined,
        miniMap: undefined,
        layers: undefined,
        skillEvents: undefined,
        skillFx: undefined,
        settings: undefined,
    };

    consoleCommands.run = Console.run;
    // Gated with the rest of the handle: recorded always (an assignment and an
    // add), reachable only once the token is valid.
    consoleCommands.skillEvents = () => ({last: lastSkillEvents, total: skillEventCount});
    // What the VFX manager actually did with those events (plan-skill-vfx.md
    // C2a): live Fx, spawns per kind and evictions. Same reason as the events
    // above: an Fx is a pooled Graphics with no DOM, so a harness can only
    // screenshot it and hope; the counters are what the client decided.
    consoleCommands.skillFx = () => SkillFx.counters();
    // The live settings object (plan-skill-vfx.md C2b). It is the on-change
    // PROXY, so `window.game.settings().vfx.density = 'low'` fires
    // GameSettingChangedEvent and persists exactly as the settings panel does
    // - which is what lets the harness drive the density slider without
    // reloading the page to rewrite localStorage.
    consoleCommands.settings = () => GameSettings.get();
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

        return true;
    });

    window['game'] = consoleCommands;
}

BackendValidTokenEvent.subscribe(setup);
