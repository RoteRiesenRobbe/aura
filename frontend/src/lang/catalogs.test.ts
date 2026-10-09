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
    allowlist: string[];
}

/** The en/de pairs: the UI catalogs + one pair per content domain. */
function pairs(): Pair[] {
    const list: Pair[] = [{
        name: 'ui',
        en: readJson(join(uiDir, 'en.arb')),
        de: readJson(join(uiDir, 'de.arb')),
        dePath: join(uiDir, 'de.arb'),
        allowlist: readJson(join(uiDir, 'de.allowlist.json')),
    }];
    const enDir = join(contentDir, 'en');
    if (existsSync(enDir)) {
        const allowPath = join(contentDir, 'de', 'allowlist.json');
        const allow: string[] = existsSync(allowPath) ? readJson(allowPath) : [];
        readdirSync(enDir).filter(f => f.endsWith('.arb')).forEach(file => {
            const dePath = join(contentDir, 'de', file);
            list.push({
                name: 'content/' + file,
                en: readJson(join(enDir, file)),
                de: existsSync(dePath) ? readJson(dePath) : {},
                dePath,
                allowlist: allow,
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

    it('de covers every en key, except the allowlist (D13)', () => {
        const missing: string[] = [];
        for (const p of all) {
            const de = messages(p.de);
            Object.keys(messages(p.en)).forEach(key => {
                if (!(key in de) && p.allowlist.indexOf(key) < 0 && !isStockCovered(p, key)) {
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

    it('no German translation is outdated against its English (D20)', () => {
        const outdated: string[] = [];
        for (const p of all) {
            if (!Object.keys(p.de).length) {
                continue;
            }
            const sourcePath = p.dePath.replace(/\.arb$/, '.source.json');
            const en = messages(p.en);
            const de = messages(p.de);
            if (UPDATE) {
                const record: Record<string, string> = {};
                Object.keys(de).sort().forEach(key => {
                    if (key in en) {
                        record[key] = en[key];
                    }
                });
                writeFileSync(sourcePath, JSON.stringify(record, null, 2) + '\n');
                continue;
            }
            const record: Record<string, string> = existsSync(sourcePath) ? readJson(sourcePath) : {};
            Object.keys(de).forEach(key => {
                if (!(key in en) || p.allowlist.indexOf(key) >= 0) {
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

/** A dialogue line whose English is a stock phrase is covered by the phrase's German (§8). */
function isStockCovered(p: Pair, key: string): boolean {
    const links = p.en['@' + key] && p.en['@' + key].x_stock;
    return !!links && ('stock.' + links) in messages(p.de);
}

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
