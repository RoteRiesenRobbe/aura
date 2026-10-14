/**
 * The catalog pins (plan-localization.md §6): completeness (D13), ICU syntax
 * and argument parity (L14), translator notes (D18), number formatting (D16),
 * the translated-from record (D20) and the key-usage scan.
 *
 * Covers the client UI catalogs here and every content ARB under api/lang/
 * (C1 on), so one ICU parser judges both homes.
 *
 * Regenerate the translated-from records after checking the German:
 *   UPDATE_LANG_SOURCE=1 npx vitest run src/lang/catalogs.test.ts
 */
import {describe, expect, it} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'fs';
import {join, relative} from 'path';
import IntlMessageFormat from 'intl-messageformat';

const repoRoot = join(__dirname, '..', '..', '..');
const uiDir = __dirname;
const contentDir = join(repoRoot, 'api', 'lang');
const UPDATE = !!process.env.UPDATE_LANG_SOURCE;

type Arb = Record<string, any>;

function readJson(path: string): any {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function messages(arb: Arb): Record<string, string> {
    const out: Record<string, string> = {};
    Object.keys(arb).forEach(k => {
        if (k.charAt(0) !== '@') {
            out[k] = arb[k];
        }
    });
    return out;
}

interface Pair {
    name: string;
    en: Arb;
    de: Arb;
    dePath: string;
}

/** The en/de pairs: the UI catalogs + one pair per content domain. */
function pairs(): Pair[] {
    const list: Pair[] = [{
        name: 'ui',
        en: readJson(join(uiDir, 'en', 'frontend.arb')),
        de: readJson(join(uiDir, 'de', 'frontend.arb')),
        dePath: join(uiDir, 'de', 'frontend.arb'),
    }];
    const enDir = join(contentDir, 'en');
    if (existsSync(enDir)) {
        readdirSync(enDir).filter(f => f.endsWith('.arb')).forEach(file => {
            const dePath = join(contentDir, 'de', file);
            list.push({
                name: 'content/' + file,
                en: readJson(join(enDir, file)),
                de: existsSync(dePath) ? readJson(dePath) : {},
                dePath,
            });
        });
    }
    return list;
}

interface Args {
    bare: Set<string>;
    numeric: Set<string>;
    all: Set<string>;
}

function argsOf(message: string, locale: string): Args {
    const ast = new IntlMessageFormat(message, locale).getAst();
    const args: Args = {bare: new Set(), numeric: new Set(), all: new Set()};
    const walk = (elements: any[]) => elements.forEach((el: any) => {
        switch (el.type) {
            case 1: // argument
                args.bare.add(el.value);
                args.all.add(el.value);
                break;
            case 2: // number
                args.numeric.add(el.value);
                args.all.add(el.value);
                break;
            case 5: // select
            case 6: // plural
                args.all.add(el.value);
                if (el.type === 6) {
                    args.numeric.add(el.value);
                }
                Object.keys(el.options).forEach(o => walk(el.options[o].value));
                break;
            case 8: // tag
                walk(el.children);
                break;
            default:
                if (el.type === 3 || el.type === 4) {
                    args.all.add(el.value);
                }
        }
    });
    walk(ast);
    return args;
}

const NUMERIC_TYPES = new Set(['int', 'num', 'double', 'number']);

describe('localization catalogs', () => {
    const all = pairs();

    it('every catalog has an @@locale header', () => {
        for (const p of all) {
            expect(p.en['@@locale'], p.name).toBe('en');
            if (Object.keys(p.de).length) {
                expect(p.de['@@locale'], p.name).toBe('de');
            }
        }
    });

    // D32 (C6): a UI key is `<area>.<thing>[.<part>]`, lowercase, hyphenated,
    // and never the dotted prefix of another (rule 5: a nested export stays
    // possible).
    it('UI keys are dotted, lowercase and hyphenated, none a prefix of another (D32)', () => {
        const keys = Object.keys(messages(all[0].en));
        const shape = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
        expect(keys.filter(k => !shape.test(k))).toEqual([]);
        expect(keys.filter(k => keys.some(other => other.startsWith(k + '.')))).toEqual([]);
    });

    // The no-prefix rule above sees only this file. A UI key under a content
    // root (quest.<id>…, mob.<Name>…) could collide with a content key nobody
    // checks against, so the content roots are off limits here.
    it('no UI key starts with a content key root (D32)', () => {
        const contentRoots = new Set(['quest', 'mob', 'skill', 'region', 'zone', 'conv', 'stock']);
        expect(Object.keys(messages(all[0].en)).filter(k => contentRoots.has(k.split('.')[0]))).toEqual([]);
    });

    it('de covers every en key (D13; no allowlist since 2026-10-14)', () => {
        const missing: string[] = [];
        for (const p of all) {
            const de = messages(p.de);
            Object.keys(messages(p.en)).forEach(key => {
                if (!(key in de)) {
                    missing.push(p.name + ': ' + key);
                }
            });
        }
        expect(missing).toEqual([]);
    });

    it('de has no orphaned key (D13)', () => {
        const orphans: string[] = [];
        for (const p of all) {
            const en = messages(p.en);
            Object.keys(messages(p.de)).forEach(key => {
                if (!(key in en)) {
                    orphans.push(p.name + ': ' + key);
                }
            });
        }
        expect(orphans).toEqual([]);
    });

    it('every message parses as ICU, and de uses exactly the en arguments (L14)', () => {
        const problems: string[] = [];
        for (const p of all) {
            const en = messages(p.en);
            const de = messages(p.de);
            Object.keys(en).forEach(key => {
                let enArgs: Args;
                try {
                    enArgs = argsOf(en[key], 'en');
                } catch (e) {
                    problems.push(`${p.name}: en ${key} does not parse: ${(e as Error).message}`);
                    return;
                }
                if (!(key in de)) {
                    return;
                }
                try {
                    const deArgs = argsOf(de[key], 'de');
                    const a = Array.from(enArgs.all).sort().join(',');
                    const b = Array.from(deArgs.all).sort().join(',');
                    if (a !== b) {
                        problems.push(`${p.name}: de ${key} uses {${b}}, en uses {${a}}`);
                    }
                    deArgs.bare.forEach(name => {
                        if (enArgs.numeric.has(name)) {
                            problems.push(`${p.name}: de ${key} prints numeric {${name}} bare; write {${name}, number}`);
                        }
                    });
                } catch (e) {
                    problems.push(`${p.name}: de ${key} does not parse: ${(e as Error).message}`);
                }
            });
        }
        expect(problems).toEqual([]);
    });

    it('every en key carries translator notes; every numeric placeholder is formatted (D18, D16)', () => {
        const problems: string[] = [];
        for (const p of all) {
            const en = messages(p.en);
            Object.keys(en).forEach(key => {
                const meta = p.en['@' + key];
                if (!meta || !meta.description) {
                    problems.push(`${p.name}: ${key} has no description`);
                    return;
                }
                const args = argsOf(en[key], 'en');
                const placeholders = meta.placeholders || {};
                args.all.forEach(name => {
                    const note = placeholders[name];
                    if (!note || !note.description || note.example === undefined) {
                        problems.push(`${p.name}: ${key} placeholder {${name}} lacks description/example`);
                        return;
                    }
                    if (NUMERIC_TYPES.has(note.type) && args.bare.has(name)) {
                        problems.push(`${p.name}: ${key} prints numeric {${name}} bare; write {${name}, number}`);
                    }
                });
            });
        }
        expect(problems).toEqual([]);
    });

    // D30: a key may carry a maximum length (`x-maxLength` in its @ block, and
    // in its note's words); English and German are held to it. Characters are a
    // proxy, the face is proportional. A plural message counts its longest form.
    it('no English or German text is over its length limit (D30)', () => {
        const tooLong: string[] = [];
        for (const p of all) {
            const en = messages(p.en);
            const de = messages(p.de);
            Object.keys(en).forEach(key => {
                const max = p.en['@' + key] && p.en['@' + key]['x-maxLength'];
                if (typeof max !== 'number') {
                    return;
                }
                for (const [loc, text] of [['en', en[key]], ['de', de[key]]] as Array<[string, string | undefined]>) {
                    if (text !== undefined && visibleLength(text) > max) {
                        tooLong.push(`${p.name}: ${loc} ${key} is ${visibleLength(text)} characters, at most ${max}: ${JSON.stringify(text)}`);
                    }
                }
            });
        }
        expect(tooLong).toEqual([]);
    });

    it('a text over its limit is caught (D30)', () => {
        expect(visibleLength('{count, plural, one {Wolf} other {Wolves}}')).toBe(6);
        expect(visibleLength('Abklingfähigkeiten')).toBe(18);
    });

    it('no German translation is outdated against its English (D20)', () => {
        const outdated: string[] = [];
        for (const p of all) {
            if (!Object.keys(p.de).length) {
                continue;
            }
            const recordPath = p.dePath.replace(/\.arb$/, '.translated-from.json');
            const en = messages(p.en);
            const de = messages(p.de);
            if (UPDATE) {
                const record: Record<string, string> = {};
                Object.keys(de).sort().forEach(key => {
                    if (key in en) {
                        record[key] = en[key];
                    }
                });
                writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
                continue;
            }
            const record: Record<string, string> = existsSync(recordPath) ? readJson(recordPath) : {};
            Object.keys(de).forEach(key => {
                if (!(key in en)) {
                    return;
                }
                if (record[key] !== en[key]) {
                    outdated.push(`${p.name}: ${key} outdated: was ${JSON.stringify(record[key])}, now ${JSON.stringify(en[key])}`);
                }
            });
        }
        expect(outdated).toEqual([]);
    });

    it('every key used in TS or HTML exists, and no UI key is computed (key-usage scan)', () => {
        const en = messages(all[0].en);
        const used = new Set<string>();
        const unknown: string[] = [];
        const computed: string[] = [];
        const srcRoot = join(uiDir, '..');
        walkFiles(srcRoot).forEach(file => {
            if (file.endsWith('.test.ts') || file.endsWith('Locale.ts') || file.indexOf('internal-tools') >= 0 || file.indexOf('zone-editor') >= 0) {
                return;
            }
            const text = readFileSync(file, 'utf8');
            const rel = relative(srcRoot, file);
            const patterns = file.endsWith('.html')
                ? [/data-i18n(?:-rich)?="([^"]+)"/g, /data-i18n-attr="[^":]+:([^"]+)"/g]
                : [/\bt\(\s*'([^']+)'/g, /\btParts\(\s*'([^']+)'/g];
            patterns.forEach(re => {
                let m: RegExpExecArray | null;
                while ((m = re.exec(text))) {
                    m[1].split(';').forEach(entry => {
                        const key = entry.indexOf(':') >= 0 ? entry.split(':')[1] : entry;
                        used.add(key);
                        if (!(key in en)) {
                            unknown.push(rel + ': ' + key);
                        }
                    });
                }
            });
            if (file.endsWith('.ts') && !file.endsWith('Locale.ts')) {
                const re = /(?:^|[^.\w])t\(\s*([^'\s)])/g;
                let m: RegExpExecArray | null;
                while ((m = re.exec(text))) {
                    computed.push(rel + ': t(' + m[1] + '…');
                }
            }
        });
        expect(unknown).toEqual([]);
        expect(computed).toEqual([]);
    });
});

// Player-facing text is never a literal (docs/manual-localization.md). Dev
// tools are out of scope (plan-localization.md, Scope).
function isDevOnly(file: string): boolean {
    return /internal-tools|zone-editor|ground-textures|fx-preview/.test(file.replace(/\\/g, '/'));
}

const LETTERS = /[A-Za-z]{2,}/;
const GUIDE = 'player-facing text must come from the catalog: see docs/manual-localization.md';

describe('no hard-coded player-facing text', () => {
    const srcRoot = join(uiDir, '..');
    const files = walkFiles(srcRoot).filter(f => !f.endsWith('.test.ts') && !isDevOnly(f));

    it('TS never assigns a text literal to textContent, innerText, title or placeholder', () => {
        const assign = /\.(textContent|innerText|title|placeholder)\s*=\s*(['"`])((?:\\.|(?!\2).)*)\2/g;
        const found: string[] = [];
        files.filter(f => f.endsWith('.ts')).forEach(file => {
            readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
                for (const m of line.matchAll(assign)) {
                    if (LETTERS.test(m[3].replace(/\$\{[^}]*\}/g, ''))) {
                        found.push(`${relative(srcRoot, file)}:${i + 1}: ${m[0]}`);
                    }
                }
            });
        });
        expect(found, GUIDE).toEqual([]);
    });

    // An element whose own text is words carries data-i18n (or sits inside a
    // data-i18n-rich sentence); a worded title / placeholder / alt /
    // aria-label / button value is named in data-i18n-attr. data-i18n-skip
    // marks text that is deliberately not translated (proper nouns, credits).
    it('HTML partials carry their text through data-i18n', () => {
        const found: string[] = [];
        files.filter(f => f.endsWith('.html')).forEach(file => {
            const doc = new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html');
            doc.body.querySelectorAll('*').forEach(el => {
                if (el.closest('[data-i18n-skip]') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') {
                    return;
                }
                const where = `${relative(srcRoot, file)} <${el.tagName.toLowerCase()}>`;
                const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
                if (LETTERS.test(own) && !el.closest('[data-i18n],[data-i18n-rich]')) {
                    found.push(`${where} text "${own.slice(0, 40)}"`);
                }
                const named = (el.getAttribute('data-i18n-attr') || '').split(';').map(e => e.split(':')[0].trim());
                const attrs = ['title', 'placeholder', 'alt', 'aria-label'];
                if (el.tagName === 'INPUT' && /^(submit|button)$/.test(el.getAttribute('type') || '')) {
                    attrs.push('value');
                }
                attrs.forEach(attr => {
                    const value = el.getAttribute(attr);
                    if (value && LETTERS.test(value) && named.indexOf(attr) < 0) {
                        found.push(`${where} ${attr}="${value.slice(0, 40)}"`);
                    }
                });
            });
        });
        expect(found, GUIDE).toEqual([]);
    });
});

function walkFiles(dir: string): string[] {
    const out: string[] = [];
    readdirSync(dir).forEach(name => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            out.push(...walkFiles(full));
        } else if (name.endsWith('.ts') || name.endsWith('.html')) {
            out.push(full);
        }
    });
    return out;
}

/** What a player reads, in characters: a plural message's longest form (D30). */
function visibleLength(text: string): number {
    if (!text.startsWith('{count, plural,')) {
        return Array.from(text).length;
    }
    let longest = 0;
    for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
        longest = Math.max(longest, Array.from(m[1]).length);
    }
    return longest;
}
