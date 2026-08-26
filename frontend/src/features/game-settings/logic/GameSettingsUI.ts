import '../assets/gameSettings.less';
import * as Preloading from '../../core/logic/Preloading';
import {GameSettings} from './GameSettings';
import {BackendStateChangedEvent, DevelopSetupEvent} from '../../core/logic/Events';
import {parseInt} from 'lodash';
import {preventShortcutPropagation, resetFocus} from '../../common/logic/Utils';
import * as AccountSettings from './AccountSettings';
import * as PanelExclusivity from '../../user-interface/logic/PanelExclusivity';
import {BackendState} from '../../backend/logic/IBackend';

const gameSettings = GameSettings.get();
let rootElement: HTMLElement;
let panelElement: HTMLElement;
let showButton: HTMLElement;

Preloading.renderPartial(require('../assets/settings.partial.html'), onDomReady);


function onDomReady() {
    rootElement = document.getElementById('gameSettings') as HTMLElement;

    setupButtons();
    setupPanel();

    PanelExclusivity.register('settings', hide);
}

function setupButtons() {
    showButton = rootElement.querySelector('#gameSettingsButton');
    preventShortcutPropagation(showButton);
    showButton.addEventListener('click', (event) => {
        event.preventDefault();

        show();
    });

    const closeButton = rootElement.querySelector('#closeGameSettings');
    preventShortcutPropagation(closeButton);
    closeButton.addEventListener('click', (event) => {
        event.preventDefault();

        hide();
    });
}

function setupPanel() {
    panelElement = rootElement.querySelector('#gameSettingsPanel');

    panelElement
        .querySelectorAll('input')
        .forEach(preventShortcutPropagation);

    setupAudioSettings();
    AccountSettings.setup(panelElement);
}

function setupAudioSettings() {
    setupToggle(
        '#muteAllToggle',
        () => gameSettings.audio.masterMuted,
        value => (gameSettings.audio.masterMuted = value),
    );

    setupRange(
        '#masterVolume',
        '#masterVolume + .value',
        () => gameSettings.audio.masterVolume,
        value => (gameSettings.audio.masterVolume = value),
    );

    setupRange(
        '#musicVolume',
        '#musicVolume + .value',
        () => gameSettings.audio.musicVolume,
        value => (gameSettings.audio.musicVolume = value),
    );

    setupToggle(
        '#backgroundAudioToggle',
        () => gameSettings.audio.enableBackgroundAudio,
        value => (gameSettings.audio.enableBackgroundAudio = value),
    );
}


function setupToggle(
    selector: string,
    getValue: () => boolean,
    setValue: (value: boolean) => void,
) {
    const toggle = rootElement.querySelector(selector) as HTMLInputElement;
    toggle.checked = getValue();
    toggle.addEventListener('change', () => {
        setValue(toggle.checked);
    });
}

function setupRange(
    selector: string,
    valueDisplaySelector: string,
    getValue: () => number,
    setValue: (value: number) => void,
) {
    const input = rootElement.querySelector(selector) as HTMLInputElement;
    const display = rootElement.querySelector(valueDisplaySelector) as HTMLElement;
    const updateUI = (value: number) => {
        input.value = String(value);
        display.textContent = (value * 100).toFixed(0);
    };

    updateUI(getValue());
    input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        setValue(val);
        updateUI(val);
    });
}


function show() {
    // Settings is one of the exclusive family (plan-ui-pass.md C2, D1).
    PanelExclusivity.notifyOpened('settings');
    showButton.classList.add('hidden');
    panelElement.classList.remove('hidden');
    // Registering mid-session changes what belongs in the Account group, so it
    // is rebuilt on open rather than once at boot.
    AccountSettings.refresh(panelElement);
}

/**
 * Close the settings panel. Exported so other modules can force-close it when
 * a higher-priority screen takes over (account creation, entering the world),
 * and it is the panel's close function in the exclusivity family.
 *
 * ⚑ A no-op when the panel is already shut, like Journal.close()/Help.close():
 * Escape's blanket close and every family open call it unconditionally, and
 * resetFocus() would otherwise pull focus to <body> on every one of them.
 */
export function hide() {
    if (!isOpen()) return;
    showButton.classList.remove('hidden');
    panelElement.classList.add('hidden');

    resetFocus();
}

function isOpen(): boolean {
    return panelElement && !panelElement.classList.contains('hidden');
}

// ⚑ Live-react to state changes while the panel is open.
//   - Entering the world (PLAYING) force-closes the panel — the player is past
//     every screen the panel could navigate to.
//   - Any other state change refreshes the Account group so "Leave to character
//     select" and the register button update without reopening.
BackendStateChangedEvent.subscribe((msg) => {
    if (msg.newState === BackendState.PLAYING) {
        if (isOpen()) hide();
        return;
    }
    if (isOpen()) {
        AccountSettings.refresh(panelElement);
    }
});

DevelopSetupEvent.subscribe(() => {
    rootElement.classList.add('develop-offset');
});
