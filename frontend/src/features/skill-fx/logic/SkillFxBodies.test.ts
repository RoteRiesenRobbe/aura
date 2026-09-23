import {describe, expect, it} from 'vitest';
import type {Texture} from 'pixi.js';
import {bodyNameOf, declareBodies, resolveBody, setBodyTexture} from './SkillFxBodies';

/**
 * The pure half of the body lookup (plan-skill-vfx.md C3a, §12f.4 D). The other
 * half - `require.context` over the PNG folder, `Assets.load`, `Preloading` -
 * is in SkillFxBodyFiles.ts, which vitest must never import: webpack's context
 * is a compile-time construct with no runtime behind it.
 *
 * ⚑ Neither Pixi nor a GPU is reached here. `resolveBody` hands back whatever
 * was registered under a name, so a plain object stands in for a texture and
 * the test asserts the ROUTING, which is the only thing this module decides.
 */
const fakeTexture = (width: number) => ({width, height: width} as unknown as Texture);

describe('bodyNameOf', () => {
    it('reads the body name out of a require.context key', () => {
        expect(bodyNameOf('./sword.png')).toBe('sword');
        expect(bodyNameOf('./wolf-jaw.png')).toBe('wolf-jaw');
    });

    it('survives a key without the leading dot-slash', () => {
        expect(bodyNameOf('arrow.png')).toBe('arrow');
    });

    it('leaves an upper-case extension alone, because nothing else accepts one', () => {
        // The `require.context` regex and tools/make-skill-fx-manifest.mjs both
        // match lowercase `.png`, so `Arrow.PNG` is not a body in either of
        // them. Stripping it here would invent a third answer.
        expect(bodyNameOf('./Arrow.PNG')).toBe('Arrow.PNG');
    });

    it('leaves a name that is not a PNG alone rather than inventing one', () => {
        expect(bodyNameOf('./notes.txt')).toBe('notes.txt');
    });
});

describe('resolveBody', () => {
    it('draws the placeholder for a layer that authors no body at all', () => {
        // Most layers, and for `flash` and particles the procedural look is the
        // intended one by ruling (§12f.2) - not a missing-art state.
        expect(resolveBody(undefined)).toBeNull();
        expect(resolveBody('')).toBeNull();
    });

    it('hands back the texture once the folder has delivered one', () => {
        const texture = fakeTexture(64);
        declareBodies(['test-sword']);
        setBodyTexture('test-sword', texture);
        expect(resolveBody('test-sword')).toBe(texture);
    });

    it('draws the placeholder while a known body is still decoding', () => {
        // Declared (webpack has seen the file) but not yet loaded. NOT a typo,
        // so it must not warn - and it must not throw either.
        declareBodies(['test-slow']);
        expect(resolveBody('test-slow')).toBeNull();
    });

    it('draws the placeholder for a body the folder does not hold', () => {
        expect(resolveBody('test-no-such-body')).toBeNull();
    });
});
