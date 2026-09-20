import onChange from 'on-change';
import {GameSettingChangedEvent} from '../../core/logic/Events';
import {DevicePrefs} from '../../common/logic/DevicePrefs';
import {isMobile} from '../../user-interface/logic/Mobile';
import _merge = require('lodash/merge');
import _debounce = require('lodash/debounce');

export class GameSettings {
    private static instance: GameSettings = null;
    public readonly audio = new AudioSettings();
    public readonly vfx = new VfxSettings();

    public static get(): GameSettings {
        if (this.instance === null) {
            const gameSettings: GameSettings = _merge(new GameSettings(), JSON.parse(DevicePrefs.rawGameSettings));

            this.instance = onChange(gameSettings, (path, value, previousValue) => {
                GameSettingChangedEvent.trigger({
                    path: path,
                    newValue: value,
                    oldValue: previousValue,
                });

                GameSettings.save(onChange.target(gameSettings));
            });

            // TODO replace with a migration system
            if (gameSettings.audio.masterVolume > 1 && gameSettings.audio.masterVolume <= 100) {
                gameSettings.audio.masterVolume /= 100.0;
            }
        }

        return this.instance;
    }

    /**
     * Debounced save function to ensure the settings are not saved more than once every 250ms into the account.
     */
    private static save = _debounce((gameSettings) => {
        DevicePrefs.rawGameSettings = JSON.stringify(gameSettings);
    }, 250);
}

export class AudioSettings {
    public masterMuted: boolean = true;
    public masterVolume: number = 0.7;
    public enableBackgroundAudio: boolean = false;
    public musicVolume: number = 1.0;
}

/** How much skill VFX dressing draws (plan-skill-vfx.md §7.3, §12d.1). */
export type VfxDensity = 'off' | 'low' | 'full';

export class VfxSettings {
    // Fill rate is the proven mobile failure mode, so a phone starts on `low`.
    // A stored choice wins through the merge in GameSettings.get().
    public density: VfxDensity = isMobile() ? 'low' : 'full';
}
