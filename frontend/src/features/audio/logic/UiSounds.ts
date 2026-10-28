/**
 * UI one-shots: a panel opening and closing (plan-audio.md lane C, taken early
 * for the spellbook and the journal, 2026-10-28). Flat, never positioned (R8).
 *
 * Two rules worth knowing before editing:
 *
 *   · ⚑ The panels never import this file. It listens to PanelExclusivity's
 *     change feed, so Spellbook.ts keeps running under a plain jsdom fixture
 *     with no PixiJS and no audio file in its graph. A panel joins by adding a
 *     line to PANEL_SOUNDS and calling notifyClosed on its close paths.
 *   · ⚑ A close the registry causes (another panel took the screen) is silent:
 *     the player hears the panel that opened, not two sounds on top of each
 *     other.
 *
 * The id table here is the seed of C1's sound table; C1 takes it over (and the
 * SFX channel) without the panels changing.
 */

import {sound} from '@pixi/sound';
import * as PIXI from 'pixi.js';
import {registerPreload} from '../../core/logic/Preloading';
import * as PanelExclusivity from '../../user-interface/logic/PanelExclusivity';

const FILES = {
    uiPanelOpen: require('../assets/sfx_interface_spellbook_open.wav'),
    uiPanelClose: require('../assets/sfx_interface_spellbook_close.wav'),
};

type UiSoundId = keyof typeof FILES;

/** Which family members are heard, and with what. */
const PANEL_SOUNDS: Partial<Record<PanelExclusivity.PanelId, { open: UiSoundId; close: UiSoundId }>> = {
    spellbook: {open: 'uiPanelOpen', close: 'uiPanelClose'},
    journal: {open: 'uiPanelOpen', close: 'uiPanelClose'},
};

for (const [id, src] of Object.entries(FILES)) {
    PIXI.Assets.add({alias: id, src});
    // noinspection JSIgnoredPromiseFromCall
    registerPreload(PIXI.Assets.load(id));
}

/** Play a UI sound. Before its file has loaded this is silent, never a throw. */
export function playUi(id: UiSoundId) {
    if (sound.exists(id)) {
        sound.play(id);
    }
}

PanelExclusivity.onChange((change) => {
    const sounds = PANEL_SOUNDS[change.id];
    if (!sounds || change.replaced) {
        return;
    }
    playUi(change.open ? sounds.open : sounds.close);
});
