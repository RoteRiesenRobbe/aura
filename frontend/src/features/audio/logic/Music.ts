import {GameSettingChangedEvent, PrerenderEvent} from '../../core/logic/Events';
import {Sound} from '@pixi/sound';
import {GameSettings} from '../../game-settings/logic/GameSettings';
import {GameState, IGame} from '../../core/logic/IGame';
import * as Regions from '../../regions/logic/Regions';
import {MusicMix} from './MusicMix';

/**
 * The music (plan-audio.md C4's forest slice, built ahead of C1/C2): the title
 * plays in the menu and wherever no region names a track; a region's profile
 * names one with `music` (terrain-profiles.json), and walking in crossfades.
 * Follows the LOCAL player only (archive/plan-region-audio.md D7).
 *
 * ⚑ Both tracks are decoded WebAudio, like every sound today (backlog §19).
 * A track loads the first time it is wanted (pixi's `play()` loads on demand),
 * so a muted player loads none; streaming long tracks stays C1's.
 */

/** How long a crossfade takes. [PLACEHOLDER] */
export const CROSSFADE_MS = 2500;

const TRACKS: Record<string, Sound> = {
    title: Sound.from({
        url: require('../assets/Aura - Main Title.mp3'),
        singleInstance: true,
        loop: true,
        volume: 0,
    }),
    forest: Sound.from({
        url: require('../assets/Aura - Forest Track.mp3'),
        singleInstance: true,
        loop: true,
        volume: 0,
    }),
};

const mix = new MusicMix(new Set(Object.keys(TRACKS)), Regions.DEFAULT_PROFILE.music, CROSSFADE_MS);
let volumes = new Map<string, number>();

function applyVolumes() {
    const slider = GameSettings.get().audio.musicVolume;
    Object.keys(TRACKS).forEach(id => {
        TRACKS[id].volume = slider * (volumes.get(id) || 0);
    });
}

function begin(id: string) {
    if (id === null) {
        return;
    }
    TRACKS[id].play();
    // A track still loading starts late (pixi plays it on load). By then it
    // may no longer be wanted: its fade target is 0, so `tick` stops it.
}

function tick(deltaMS: number) {
    const frame = mix.advance(deltaMS);
    volumes = frame.volumes;
    frame.stopped.forEach(id => TRACKS[id].stop());
    applyVolumes();
}

/** Nothing plays while muted (plan-audio.md R1): unmuting starts the wanted
 *  track from its beginning, past none of its build-up. */
function setMuted(muted: boolean) {
    if (muted) {
        mix.silence().forEach(id => TRACKS[id].stop());
        volumes = new Map();
    } else {
        begin(mix.start());
        volumes = mix.advance(0).volumes;
    }
    applyVolumes();
}

GameSettingChangedEvent.subscribe(payload => {
    if (payload.path === 'audio.masterMuted') {
        setMuted(payload.newValue as boolean);
    } else if (payload.path === 'audio.musicVolume') {
        applyVolumes();
    }
});

/** Starts following the local player's region. Called once the game exists;
 *  until then (and while dead) the current track holds. */
export function setup(game: IGame) {
    PrerenderEvent.subscribe((deltaMS: number) => {
        const character = game.state === GameState.PLAYING ? game.player?.character : undefined;
        if (character) {
            begin(mix.want(Regions.resolve('music', {x: character.getX(), y: character.getY()})));
        }
        tick(deltaMS);
    });
}

if (!GameSettings.get().audio.masterMuted) {
    setMuted(false);
}
