import {describe, expect, it, vi} from 'vitest';
import {MusicMix} from './MusicMix';

const FADE = 1000;

function mix(warn = vi.fn()) {
    return {warn, mix: new MusicMix(new Set(['title', 'forest']), 'title', FADE, warn)};
}

describe('MusicMix', () => {
    it('starts the fallback at full volume, with no fade', () => {
        const {mix: m} = mix();
        expect(m.start()).toBe('title');
        expect(m.advance(0).volumes.get('title')).toBe(1);
    });

    it('crossfades to a new track: the new one starts from zero, the old one fades out and stops', () => {
        const {mix: m} = mix();
        m.start();
        expect(m.want('forest')).toBe('forest');
        const half = m.advance(FADE / 2);
        expect(half.volumes.get('forest')).toBeCloseTo(0.5);
        expect(half.volumes.get('title')).toBeCloseTo(0.5);
        expect(half.stopped).toEqual([]);
        const done = m.advance(FADE / 2);
        expect(done.volumes.get('forest')).toBe(1);
        expect(done.stopped).toEqual(['title']);
        expect(m.advance(16).volumes.has('title')).toBe(false);
    });

    it('never restarts the track already playing (D9)', () => {
        const {mix: m} = mix();
        m.start();
        expect(m.want('title')).toBeNull();
    });

    it('turns a fading track around instead of restarting it', () => {
        const {mix: m} = mix();
        m.start();
        m.want('forest');
        m.advance(FADE / 4);
        // Back out of the forest before the fade ends: the title is still
        // audible, so it fades back up and is not started again.
        expect(m.want('title')).toBeNull();
        expect(m.advance(0).volumes.get('title')).toBeCloseTo(0.75);
    });

    it('starts a track again once its fade-out finished', () => {
        const {mix: m} = mix();
        m.start();
        m.want('forest');
        m.advance(FADE);
        expect(m.want('title')).toBe('title');
    });

    it('plays the fallback for an unknown id, and says so once (D4)', () => {
        const {mix: m, warn} = mix();
        m.start();
        expect(m.want('forset')).toBeNull();
        expect(m.want('forset')).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(m.current).toBe('title');
    });

    it('stops everything on silence and remembers what to start again', () => {
        const {mix: m} = mix();
        m.start();
        m.want('forest');
        expect(m.silence().sort()).toEqual(['forest', 'title']);
        expect(m.advance(16).volumes.size).toBe(0);
        // A region change while silent only moves the wish.
        expect(m.want('title')).toBeNull();
        expect(m.start()).toBe('title');
        expect(m.advance(0).volumes.get('title')).toBe(1);
    });

    it('does not let a silent mix start anything', () => {
        const {mix: m} = mix();
        expect(m.want('forest')).toBeNull();
        expect(m.current).toBe('forest');
        expect(m.start()).toBe('forest');
    });
});
