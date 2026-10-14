import {GameSettingChangedEvent} from '../../core/logic/Events';
import {sound} from '@pixi/sound';
import {AudioSettings, GameSettings} from '../../game-settings/logic/GameSettings';

GameSettingChangedEvent.subscribe(payload => {
    if (!payload.path.startsWith('audio.')) {
        // Not relevant for the Audio System
        return;
    }

    const setting = payload.path.substring('audio.'.length);
    switch (setting) {
        case 'masterMuted':
            muteToggles.forEach(toggle => (toggle.checked = payload.newValue as boolean));
            if (payload.newValue) {
                sound.muteAll();
            } else {
                sound.unmuteAll();
            }
            break;
        case 'masterVolume':
            sound.volumeAll = payload.newValue as number;
            break;
    }
});

const muteToggles: HTMLInputElement[] = [];

/**
 * Adopt a checkbox as a "Mute all" switch. There is more than one (settings
 * panel + account screens) and they all edit `audio.masterMuted`, so this
 * module keeps every copy showing the current value.
 */
export function registerMuteToggle(toggle: HTMLInputElement): void {
    if (!toggle || muteToggles.indexOf(toggle) !== -1) {
        return;
    }
    muteToggles.push(toggle);
    toggle.checked = GameSettings.get().audio.masterMuted;
    toggle.addEventListener('change', () => {
        GameSettings.get().audio.masterMuted = toggle.checked;
    });
}

function setupBackgroundAudio() {
    sound.disableAutoPause = true;
    document.addEventListener('visibilitychange', () => {
        updateMuting(GameSettings.get().audio);
    });
}

function setup() {
    const settings = GameSettings.get().audio;
    updateMuting(settings);

    sound.volumeAll = settings.masterVolume;

    setupBackgroundAudio();
}

function updateMuting(settings: AudioSettings) {
    if (settings.masterMuted) {
        sound.muteAll();
        return;
    }

    if (document.visibilityState === 'hidden' && !settings.enableBackgroundAudio) {
        sound.muteAll();
        return;
    }

    sound.unmuteAll();
}

setup();
