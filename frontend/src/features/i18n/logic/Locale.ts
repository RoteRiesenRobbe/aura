/**
 * The client's i18n machinery (plan-localization.md C0a).
 *
 * - The locale is resolved ONCE, before anything renders (D11: switching
 *   reloads the page), from localStorage, then - only once German is
 *   complete (D2 amendment (b), Q3) - from `navigator.languages`, then `en`.
 * - Messages are ICU MessageFormat in ARB files (D16, D17), formatted with
 *   `intl-messageformat`; one compiled message is cached per (locale, key)
 *   because the conversation view re-renders every tick (D14 (3)).
 * - A missing or broken message degrades readable, never blank (D14).
 * - `en-XA` is the dev-only pseudo-locale (D21), chosen only by an explicit pin.
 */
import IntlMessageFormat from 'intl-messageformat';
import enArb from '../../../lang/en.arb?raw';
import deArb from '../../../lang/de.arb?raw';

export const SOURCE_LOCALE = 'en';
export const SUPPORTED_LOCALES: readonly string[] = ['en', 'de'];
export const PSEUDO_LOCALE = 'en-XA';
export const STORAGE_KEY = 'aura.locale';

/**
 * ⛔ Q3 (PO 2026-10-07): browser-language detection turns on only when German
 * is complete (C4's exit check: a full German playthrough and an empty
 * allowlist). Until then German is opt-in through the settings toggle.
 */
export const DETECTION_ENABLED = false;

export type Messages = Record<string, string>;

/** An ARB file's messages, with its `@` metadata stripped (D18). */
export function parseArb(text: string): Messages {
    const raw = JSON.parse(text);
    const out: Messages = {};
    Object.keys(raw).forEach(key => {
        if (key.charAt(0) !== '@') {
            out[key] = raw[key];
        }
    });
    return out;
}

/**
 * BCP 47 negotiation by truncation (D2 amendment (a)): `de-AT` → `de` → none.
 * The first preference with any supported truncation wins.
 */
export function negotiate(preferences: readonly string[], supported: readonly string[] = SUPPORTED_LOCALES): string | null {
    for (const preference of preferences) {
        let tag = (preference || '').trim();
        while (tag) {
            const lower = tag.toLowerCase();
            const hit = supported.find(s => s.toLowerCase() === lower);
            if (hit) {
                return hit;
            }
            const cut = tag.lastIndexOf('-');
            tag = cut > 0 ? tag.slice(0, cut) : '';
        }
    }
    return null;
}

export function resolveLocale(stored: string | null, languages: readonly string[], detection = DETECTION_ENABLED): string {
    if (stored === PSEUDO_LOCALE) {
        return PSEUDO_LOCALE;
    }
    if (stored) {
        const chosen = negotiate([stored]);
        if (chosen) {
            return chosen;
        }
    }
    if (detection) {
        const detected = negotiate(languages);
        if (detected) {
            return detected;
        }
    }
    return SOURCE_LOCALE;
}

function readStoredLocale(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        return null;
    }
}

function browserLanguages(): readonly string[] {
    if (typeof navigator === 'undefined') {
        return [];
    }
    if (navigator.languages && navigator.languages.length) {
        return navigator.languages;
    }
    return navigator.language ? [navigator.language] : [];
}

const catalogs: Record<string, Messages> = {
    en: parseArb(enArb),
    de: parseArb(deArb),
};

let currentLocale = resolveLocale(readStoredLocale(), browserLanguages());

/** The resolved locale: `en`, `de`, or the pseudo-locale `en-XA`. */
export function locale(): string {
    return currentLocale;
}

/**
 * The locale `Intl` formats numbers, plurals and lists with: the pseudo-locale
 * formats as English.
 */
export function formatLocale(): string {
    return currentLocale === PSEUDO_LOCALE ? SOURCE_LOCALE : currentLocale;
}

/** The locale whose catalogs (server content too) this client asks for. */
export function contentLocale(): string {
    return currentLocale;
}

/** Test seam: re-resolve with explicit inputs. */
export function setLocaleForTest(value: string) {
    currentLocale = value;
    cache.clear();
}

/**
 * Writes the choice and reloads (D11): the client has no teardown path, so a
 * live re-render of every text surface is not on offer. The caller confirms.
 */
export function chooseLocale(value: string) {
    try {
        window.localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
        // A blocked storage keeps the current locale; nothing else to do.
        return;
    }
    window.location.reload();
}

/** A locale's own name for itself ("Deutsch"), for the settings toggle. */
export function nativeName(tag: string): string {
    try {
        const Display = (Intl as any).DisplayNames;
        if (Display) {
            const name: string = new Display([tag], {type: 'language'}).of(tag);
            if (name) {
                return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
            }
        }
    } catch (e) {
        // fall through
    }
    return tag;
}

// ---------------------------------------------------------------- pseudo D21

const PSEUDO_MAP: Record<string, string> = {
    a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
    n: 'ñ', o: 'ó', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
    A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
    N: 'Ñ', O: 'Ó', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/**
 * English with accented letters, ~35 % padding and brackets (D21). Every ASCII
 * letter is mapped, so any plain-ASCII word left on screen under `en-XA` is a
 * string this plan missed. Mirrors the Go side's `lang.Pseudo`.
 */
export function pseudo(text: string): string {
    if (!text) {
        return text;
    }
    let out = '';
    for (const ch of text) {
        out += PSEUDO_MAP[ch] || ch;
    }
    const pad = Math.ceil(text.length * 0.35);
    return '[' + out + '·'.repeat(pad) + ']';
}

// ---------------------------------------------------------------- formatting

const cache = new Map<string, IntlMessageFormat | null>();

function compiled(catalogLocale: string, key: string): IntlMessageFormat | null {
    const cacheKey = catalogLocale + '\u0000' + key;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    const source = catalogs[catalogLocale] && catalogs[catalogLocale][key];
    let message: IntlMessageFormat | null = null;
    if (typeof source === 'string') {
        try {
            message = new IntlMessageFormat(source, catalogLocale === PSEUDO_LOCALE ? SOURCE_LOCALE : catalogLocale);
        } catch (e) {
            // D14 (2): a broken translation falls back to the English message.
            message = null;
        }
    }
    cache.set(cacheKey, message);
    return message;
}

function catalogFor(localeTag: string): string {
    return localeTag === PSEUDO_LOCALE ? SOURCE_LOCALE : localeTag;
}

export type Params = Record<string, unknown>;

/** D14: an unresolvable key renders as the key plus its literal args. */
export function readableFallback(key: string, params?: Params): string {
    const values = params ? Object.keys(params).map(name => String(params[name])) : [];
    return values.length ? key + ' (' + values.join(', ') + ')' : key;
}

function formatWith(message: IntlMessageFormat, params?: Params): string | null {
    try {
        const result = message.format(params as any);
        return Array.isArray(result) ? result.join('') : String(result);
    } catch (e) {
        // A missing argument throws; fall back rather than blank the row.
        return null;
    }
}

/** Whether the shipped English catalog has this key (D10's precedence). */
export function hasMessage(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(catalogs[SOURCE_LOCALE], key);
}

function translate(key: string, params?: Params): string | null {
    const own = compiled(catalogFor(currentLocale), key);
    let text = own ? formatWith(own, params) : null;
    if (text === null && catalogFor(currentLocale) !== SOURCE_LOCALE) {
        const en = compiled(SOURCE_LOCALE, key);
        text = en ? formatWith(en, params) : null;
    }
    if (text === null) {
        return null;
    }
    return currentLocale === PSEUDO_LOCALE ? pseudo(text) : text;
}

/**
 * A UI message by its literal key. The key-usage scan (Locale.test.ts) reads
 * every `t('…')` call, so the key is always a string literal here; a key that
 * arrives at runtime (a server message key) goes through `tKey`.
 */
export function t(key: string, params?: Params): string {
    const text = translate(key, params);
    return text === null ? readableFallback(key, params) : text;
}

/**
 * A message whose key was computed at runtime (a wire key, C2). D14 (1): when
 * the client has no template, a non-empty `fallback` (the server's English,
 * D10) wins over the readable key + args.
 */
export function tKey(key: string, params?: Params, fallback?: string): string {
    const text = translate(key, params);
    if (text !== null) {
        return text;
    }
    if (fallback) {
        return fallback;
    }
    return readableFallback(key, params);
}

/**
 * A message with ICU rich-text tags (`Signed in as <user>{name}</user>.`),
 * formatted to parts: one handler per tag returns the Node it wraps the chunks
 * in. Never innerHTML.
 */
export function tParts(key: string, params: Params, tags: Record<string, (chunks: string) => Node>): Node[] {
    const handlers: Record<string, (chunks: any[]) => Node> = {};
    Object.keys(tags).forEach(tag => {
        handlers[tag] = (chunks: any[]) => tags[tag](chunks.map(c => (typeof c === 'string' ? c : '')).join(''));
    });
    const all = Object.assign({}, params, handlers);
    const attempt = (catalogLocale: string): Node[] | null => {
        const message = compiled(catalogLocale, key);
        if (!message) {
            return null;
        }
        try {
            const result = message.format(all as any);
            const parts = Array.isArray(result) ? result : [result];
            return parts.map(part => {
                if (typeof part === 'string' || typeof part === 'number') {
                    const text = String(part);
                    return document.createTextNode(currentLocale === PSEUDO_LOCALE ? pseudo(text) : text);
                }
                return part as unknown as Node;
            });
        } catch (e) {
            return null;
        }
    };
    return attempt(catalogFor(currentLocale))
        || attempt(SOURCE_LOCALE)
        || [document.createTextNode(readableFallback(key, params))];
}

/** A number, formatted for the locale (de "1.500", "12,5"; D16). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(formatLocale(), options).format(value);
}

/** A list joined for the locale (de "A, B und C"; D16). */
export function formatList(items: string[], type: 'conjunction' | 'disjunction' = 'conjunction'): string {
    const ListFormat = (Intl as any).ListFormat;
    if (ListFormat) {
        return new ListFormat(formatLocale(), {style: 'long', type}).format(items);
    }
    return items.join(', ');
}

// ---------------------------------------------------------------- the page

/**
 * The page declares its language (WCAG 3.1.1), and opts out of browser
 * auto-translation: the translator rewrites DOM text the game also writes.
 */
export function declarePageLanguage(doc: Document = document) {
    doc.documentElement.lang = currentLocale;
    doc.documentElement.setAttribute('translate', 'no');
}

/** Every catalog's keys, for the pins. */
export function catalogKeys(localeTag: string): string[] {
    return Object.keys(catalogs[localeTag] || {});
}

if (typeof document !== 'undefined') {
    declarePageLanguage();
}
