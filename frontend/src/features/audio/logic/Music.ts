import {GameSettingChangedEvent} from '../../core/logic/Events';
import {Sound} from '@pixi/sound';
import {GameSettings} from '../../game-settings/logic/GameSettings';

let currentMusic: Sound = null;

// The title track starts on the first unmute, from its beginning: playing it
// silently while muted (the default, plan-audio.md R1) meant unmuting dropped
// the player into the middle of the track, past its build-up.
GameSettingChangedEvent.subscribe(payload => {
    if (payload.path === 'audio.masterMuted' && !payload.newValue && !currentMusic.isPlaying) {
        currentMusic.play();
    }
});

GameSettingChangedEvent.subscribe(payload => {
    if (!payload.path.startsWith('audio.music')) {
        // Not relevant for the Music sub-system
        return;
    }

    const setting = payload.path.substring('audio.'.length);
    switch (setting) {
        case 'musicVolume':
            currentMusic.volume = payload.newValue as number;
            break;
    }
});

function setup() {
    const settings = GameSettings.get().audio;
    currentMusic = Sound.from({
        url: require('../assets/Aura - Main Title.mp3'),
        autoPlay: !settings.masterMuted,
        singleInstance: true,
        loop: true,
        volume: settings.musicVolume,
    });
}

setup();
