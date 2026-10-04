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
// ⚑ Both directories. The top level is every player skill, each of which
// authors an icon (D1). api/skills/mobs holds the mob-embedded skills, where an
// icon is optional: the buff tray draws a mob's timed effect as a circle on the
// player (plan-buff-tray.md C0), so the ones that land one author an icon and
// the rest stay bare. The Go content test owns "who must"; this pin owns "what
// was authored is bundled", so a bare mob skill is simply not in the list.
const skillsDir = join(__dirname, '../../../../api/skills');

function authoredIcons(): { file: string, icon: string }[] {
    return [skillsDir, join(skillsDir, 'mobs')].flatMap(dir =>
        readdirSync(dir, {withFileTypes: true})
            .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
            .map(entry => {
                const def = JSON.parse(readFileSync(join(dir, entry.name), 'utf8'));
                return {file: dir === skillsDir ? entry.name : `mobs/${entry.name}`, icon: def.icon, required: dir === skillsDir};
            })
            .filter(({icon, required}) => required || icon));
}

describe('skill icon glyphs', () => {
    const authored = authoredIcons();

    it('finds the authored skill content', () => {
        expect(authored.length).toBeGreaterThan(50);
    });

    it('bundles a glyph for every icon authored in api/skills and api/skills/mobs', () => {
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
