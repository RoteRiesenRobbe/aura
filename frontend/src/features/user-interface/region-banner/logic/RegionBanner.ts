/**
 * The region title banner (2026-09-28): on entering a named place, its title in
 * big letters at the top centre of the HUD with an optional smaller subtitle
 * under it, fading in, holding, and fading out.
 *
 * WHEN is RegionNames' call (settle + per-place cooldown, so skimming a border
 * or walking out and back in says nothing); this file is only the DOM half.
 * Joining counts as entering, and so does a respawn: the player's own position
 * is sampled every frame, and there is no player while dead.
 *
 * ⚑ Separate from AlertBanner on purpose: that one queues messages one after
 * another, and a place name that waits behind a level-up is announcing where
 * you WERE. A newer place replaces the one on screen instead.
 */
import {PrerenderEvent} from '../../../core/logic/Events';
import {GameState, IGame} from '../../../core/logic/IGame';
import * as Regions from '../../../regions/logic/Regions';
import {PlaceAnnouncer, PlaceName, placeAt} from '../../../regions/logic/RegionNames';

/** How long the banner holds at full opacity. */
export const HOLD_MS = 3000;
/** Keep in sync with #regionBanner's transitions in HUD.less. */
const FADE_IN_MS = 600;

let element: HTMLElement = null;
let titleElement: HTMLElement = null;
let subtitleElement: HTMLElement = null;
let hideTimeout: ReturnType<typeof setTimeout> = null;
const announcer = new PlaceAnnouncer();

export function setup(game: IGame) {
    element = document.getElementById('regionBanner');
    if (element === null) {
        return;
    }
    titleElement = element.querySelector('.regionTitle');
    subtitleElement = element.querySelector('.regionSubtitle');
    PrerenderEvent.subscribe(() => update(game));
}

function update(game: IGame) {
    const character = game.state === GameState.PLAYING ? game.player?.character : undefined;
    if (!character) {
        // Dead, or not in the world yet: the next place is a fresh entry.
        announcer.reset();
        return;
    }
    const place = placeAt(Regions.loadedRegions(), {x: character.getX(), y: character.getY()});
    const announce = announcer.update(place, performance.now());
    if (announce) {
        show(announce);
    }
}

export function show(place: PlaceName) {
    if (element === null) return;
    titleElement.textContent = place.title;
    subtitleElement.textContent = place.subtitle || '';
    subtitleElement.classList.toggle('hidden', !place.subtitle);

    // Restart the fade-in even when a banner is already up.
    element.classList.remove('visible');
    void element.offsetWidth;
    element.classList.add('visible');

    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => element.classList.remove('visible'), FADE_IN_MS + HOLD_MS);
}
