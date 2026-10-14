// The /lang bundle (plan-localization.md D6 item 2): the content text no
// catalog carries, as one flat key → text map in the chosen locale. C1 serves
// region and zone names; C3 adds the dialogue.
//
// The client keeps importing regions.json and the zone JSON for their geometry
// and ids; only the displayed text comes from here. Until the fetch lands, or
// when it fails, every lookup answers its English fallback (D13: silent): for
// a region or zone name the bundled English ARB (C5a, D27: the JSON carries no
// text any more), for a dialogue line the server's English on the wire.

import {contentCatalogUrl} from '../features/backend/logic/Urls';
import {registerPreload} from '../features/core/logic/Preloading';
import {parseArb} from '../features/localization/logic/Locale';
import regionsEnglishArb from '../../../api/lang/en/regions.arb?raw';

const bundle = new Map<string, string>();
const listeners: Array<() => void> = [];

export function loadLangBundle(): Promise<void> {
    return fetch(contentCatalogUrl('lang'))
        .then(response => {
            if (!response.ok) {
                throw new Error(`GET /lang returned ${response.status}`);
            }
            return response.json();
        })
        .then((entries: Record<string, string>) => {
            bundle.clear();
            Object.keys(entries).forEach(key => bundle.set(key, entries[key]));
            listeners.forEach(listener => listener());
        })
        .catch(error => {
            console.warn('Lang bundle unavailable — content text stays English', error);
        });
}

/** The localized content text for key, or the English fallback. */
export function contentText(key: string, fallback: string): string {
    const text = bundle.get(key);
    return text === undefined || text === '' ? fallback : text;
}

/** Runs now if the bundle is loaded, and again whenever it (re)loads. */
export function onLangBundle(listener: () => void) {
    listeners.push(listener);
    if (bundle.size > 0) {
        listener();
    }
}

/** The bundled English of the region and zone names (api/lang/en/regions.arb). */
export const REGIONS_ENGLISH: Readonly<Record<string, string>> = parseArb(regionsEnglishArb);

// The keys, spelled exactly as lang.go's builders spell them (D20, D29: dotted
// parts, the id as authored). A dialogue line needs no builder: the wire
// carries its full key (D27).
export const regionTitleKey = (id: string) => `region.${id}.title`;
export const regionSubtitleKey = (id: string) => `region.${id}.subtitle`;
export const zoneNameKey = (stem: string) => `zone.${stem}.name`;

// Loaded with the catalogs, before the game starts: the first region banner
// must already speak the chosen language.
registerPreload(loadLangBundle());
