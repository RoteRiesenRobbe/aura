import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import {describe, expect, it} from 'vitest';

import {SKILL_GLYPHS} from './SkillIcons.generated';

// The client half of C4's twin completeness pin. The Go side asserts every
// api/skills definition AUTHORS an icon; this asserts every authored value is
// actually BUNDLED here - a typo'd path ("lorc/broadswrod") passes the server
// test, ships, and shows up as a letter fallback nobody notices.
//
// ⚑ The content tree is read from disk, not imported: these values live in Go's
// world, and the whole point of the pin is that no one has to remember to copy
// them. jsdom does not stop node:fs from working.
//
// ⚑ Top level only. api/skills/mobs holds the mob-embedded skills, which author
// no icon by ruling D1 and never render a row.
const skillsDir = join(__dirname, '../../../../api/skills');

function authoredIcons(): { file: string, icon: string }[] {
    return readdirSync(skillsDir, {withFileTypes: true})
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => {
            const def = JSON.parse(readFileSync(join(skillsDir, entry.name), 'utf8'));
            return {file: entry.name, icon: def.icon};
        });
}

describe('skill icon glyphs', () => {
    const authored = authoredIcons();

    it('finds the authored skill content', () => {
        expect(authored.length).toBeGreaterThan(50);
    });

    it('bundles a glyph for every icon authored in api/skills', () => {
        const missing = authored
            .filter(({icon}) => !icon || !(icon in SKILL_GLYPHS))
            .map(({file, icon}) => `${file} -> ${icon || '(none)'}`);
        expect(missing, 're-run scripts/fetch-skill-icons.mjs').toEqual([]);
    });

    it('every bundled glyph carries a viewBox and tintable body', () => {
        for (const [path, glyph] of Object.entries(SKILL_GLYPHS)) {
            expect(glyph.viewBox, path).toMatch(/^[\d.\- ]+$/);
            expect(glyph.body.length, path).toBeGreaterThan(0);
            // A hardcoded fill would paint over currentColor and the token would
            // ignore its row's state - the exact thing the strip step removes.
            expect(glyph.body, path).not.toMatch(/fill=/);
        }
    });
});
