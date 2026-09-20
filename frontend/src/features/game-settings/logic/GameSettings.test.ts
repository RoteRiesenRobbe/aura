import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// isMobile() memoizes its detection in module state and reads matchMedia, which
// jsdom does not implement, so the platform is mocked rather than simulated.
const isMobile = vi.fn(() => false);
vi.mock('../../user-interface/logic/Mobile', () => ({
    isMobile: () => isMobile(),
    apply: () => undefined,
}));

import {GameSettings} from './GameSettings';

// GameSettings is a process-wide singleton built ONCE, merging the browser-local
// JSON over the constructed defaults. Every claim below is about that merge, so
// each test needs a fresh instance and a known localStorage.
function resetSingleton() {
    (GameSettings as unknown as {instance: unknown}).instance = null;
}

beforeEach(() => {
    resetSingleton();
    localStorage.clear();
    isMobile.mockReturnValue(false);
});

afterEach(() => {
    resetSingleton();
    localStorage.clear();
});

function storeGameSettings(value: unknown) {
    localStorage.setItem('gameSettings', JSON.stringify(value));
}

describe('vfx density', () => {
    // §12d.1 (PO): fill rate is the measured mobile failure mode, so a phone
    // starts reduced and a desktop does not.
    it('defaults to full on the desktop', () => {
        expect(GameSettings.get().vfx.density).toBe('full');
    });

    it('defaults to low on a phone', () => {
        isMobile.mockReturnValue(true);
        expect(GameSettings.get().vfx.density).toBe('low');
    });

    it('lets a stored choice win over the platform default', () => {
        isMobile.mockReturnValue(true);
        storeGameSettings({vfx: {density: 'full'}});

        expect(GameSettings.get().vfx.density).toBe('full');
    });

    // The state every existing player's browser is in: a stored blob written
    // before `vfx` existed. lodash merge leaves an absent branch alone, so the
    // platform default has to survive it - otherwise the first release of this
    // setting would read `undefined` for everyone who has ever opened settings.
    it('keeps the platform default when the stored blob predates the setting', () => {
        isMobile.mockReturnValue(true);
        storeGameSettings({audio: {masterMuted: false, masterVolume: 0.3}});

        const settings = GameSettings.get();
        expect(settings.vfx.density).toBe('low');
        expect(settings.audio.masterVolume).toBe(0.3);
    });
});
