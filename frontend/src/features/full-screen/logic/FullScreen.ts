import fscreen from 'fscreen';
import {GameJoinEvent, screen, StartScreenDomReadyEvent} from "../../core/logic/Events";
import {DevicePrefs} from "../../common/logic/DevicePrefs";

/**
 * The fullscreen device preference and every control that edits it.
 *
 * ⚑ There is more than one toggle now (start screen + the account screens), and
 * they all edit ONE value. So this module owns the list rather than each screen
 * owning its own checkbox: a screen that read `DevicePrefs.fullScreen` at mount
 * and never heard about later changes would show a stale switch the moment the
 * player flipped the other one.
 *
 * ⚑ A toggle APPLIES immediately (PO 2026-08-02). It used to only record the
 * preference and act on it at join time — which on the account screens, where a
 * player can sit for a while, reads as a broken switch.
 */

const toggles: HTMLInputElement[] = [];

/**
 * Adopt a checkbox as a fullscreen toggle: seed it from the stored preference,
 * keep it in sync with the others, and apply on change.
 */
export function registerFullscreenToggle(toggle: HTMLInputElement): void {
    if (!toggle || toggles.indexOf(toggle) !== -1) {
        return;
    }
    toggles.push(toggle);
    toggle.checked = isFullscreenActive() || DevicePrefs.fullScreen;
    toggle.addEventListener('change', () => apply(toggle.checked));
}

function isFullscreenActive(): boolean {
    return !!fscreen.fullscreenElement;
}

function syncToggles(enabled: boolean): void {
    toggles.forEach((toggle) => {
        toggle.checked = enabled;
    });
}

function apply(enabled: boolean): void {
    DevicePrefs.fullScreen = enabled;
    syncToggles(enabled);

    if (enabled) {
        if (!isFullscreenActive()) {
            // The change event IS the user gesture browsers require here.
            fscreen.requestFullscreen(document.body);
        }
    } else if (isFullscreenActive()) {
        fscreen.exitFullscreen();
    }
}

// Fullscreen can also end without passing through a toggle — Esc, F11, or the
// browser refusing the request. The switches must not keep claiming otherwise,
// and the preference follows: leaving fullscreen is the player saying no.
fscreen.addEventListener('fullscreenchange', () => {
    const active = isFullscreenActive();
    DevicePrefs.fullScreen = active;
    syncToggles(active);
});

StartScreenDomReadyEvent.subscribe(() => {
    registerFullscreenToggle(document.getElementById('fullscreenToggle') as HTMLInputElement);
});

// Backstop for the case no toggle was ever touched this session: the preference
// is on from a previous visit and nothing has entered fullscreen yet.
GameJoinEvent.subscribe((screen: screen) => {
    if (screen === 'start' && DevicePrefs.fullScreen && !isFullscreenActive()) {
        fscreen.requestFullscreen(document.body);
    }
});
