/**
 * Wire keys + typed args → localized text (plan-localization.md C2, D1/D8).
 *
 * The server sends a message KEY and TYPED arguments; a reference argument
 * (mob, skill, quest, region) is an id this module resolves from the localized
 * catalogs, never a display name parsed out of a string. Quest objectives
 * arrive the same way, as data, and are worded here.
 */
import IntlMessageFormat from 'intl-messageformat';
import {AuraApi} from '../../backend/logic/AuraApi';
import {formatList, formatLocale, t, tKey} from './Locale';
import {mobDefinition} from '../../../client-data/Mobs';
import {skillDisplayName} from '../../../client-data/Skills';
import {questDefinition} from '../../../client-data/Quests';
import {PLACES} from '../../regions/logic/RegionNames';

/** One decoded MessageArg, plain data (the unit-testable shape). */
export interface WireArg {
    name: string;
    kind: number;
    text: string;
    number: number;
    id: number;
    items: string[];
}

export function decodeArgs(message: AuraApi.EntityMessage): WireArg[] {
    const out: WireArg[] = [];
    for (let i = 0; i < message.argsLength(); i++) {
        const a = message.args(i);
        const items: string[] = [];
        for (let j = 0; j < a.itemsLength(); j++) {
            items.push(a.items(j));
        }
        out.push({
            name: a.name() ?? '',
            kind: a.kind(),
            text: a.text() ?? '',
            number: a.number(),
            id: Number(a.id()),
            items,
        });
    }
    return out;
}

export function mobName(id: number): string {
    return mobDefinition(id)?.displayName ?? String(id);
}

/** The plural where content authors one (Q2), else the singular. */
export function mobPlural(id: number): string {
    const def = mobDefinition(id);
    return def?.displayNamePlural || def?.displayName || String(id);
}

/**
 * The args as ICU values. A List arg next to a Number arg named `count` that
 * exceeds it gets "N others" appended (the warlord's kill credit: up to three
 * names, then the rest folded), joined with Intl.ListFormat.
 */
export function resolveArgs(args: WireArg[]): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const count = args.find(a => a.name === 'count' && a.kind === AuraApi.MessageArgKind.Number);
    for (const a of args) {
        switch (a.kind) {
            case AuraApi.MessageArgKind.Number:
                values[a.name] = a.number;
                break;
            case AuraApi.MessageArgKind.Mob:
                values[a.name] = mobName(a.id);
                break;
            case AuraApi.MessageArgKind.Skill:
                values[a.name] = skillDisplayName(a.id);
                break;
            case AuraApi.MessageArgKind.Quest:
                values[a.name] = questDefinition(a.text)?.title ?? a.text;
                break;
            case AuraApi.MessageArgKind.Region:
                values[a.name] = PLACES.get(a.text)?.title ?? a.text;
                break;
            case AuraApi.MessageArgKind.List: {
                const items = a.items.slice();
                if (count && count.number > items.length) {
                    items.push(t('listMoreOthers', {n: count.number - items.length}));
                }
                values[a.name] = formatList(items);
                break;
            }
            default:
                values[a.name] = a.text;
        }
    }
    return values;
}

/** A keyed EntityMessage's text; unkeyed → the message verbatim (D10). */
export function wireMessageText(message: AuraApi.EntityMessage): string {
    const key = message.key();
    const fallback = message.message() ?? '';
    if (!key) {
        return fallback;
    }
    return tKey(key, resolveArgs(decodeArgs(message)), fallback);
}

// ------------------------------------------------------------- objectives

export interface ObjectiveData {
    kind: number;
    stage: boolean;
    target: number;
    region: string;
    n: number;
    m: number;
    done: boolean;
    trackerKey: string;
}

export function decodeObjectives(progress: AuraApi.QuestProgress): ObjectiveData[] {
    const out: ObjectiveData[] = [];
    for (let i = 0; i < progress.objectiveListLength(); i++) {
        const o = progress.objectiveList(i);
        out.push({
            kind: o.kind(),
            stage: o.stage(),
            target: Number(o.target()),
            region: o.region() ?? '',
            n: o.n(),
            m: o.m(),
            done: o.done(),
            trackerKey: o.trackerKey() ?? '',
        });
    }
    return out;
}

const trackerCache = new Map<string, IntlMessageFormat | null>();

function formatTracker(template: string, o: ObjectiveData): string | null {
    const cacheKey = formatLocale() + '\u0000' + template;
    let message = trackerCache.get(cacheKey);
    if (message === undefined) {
        try {
            message = new IntlMessageFormat(template, formatLocale());
        } catch (e) {
            message = null;
        }
        trackerCache.set(cacheKey, message);
    }
    if (!message) {
        return null;
    }
    try {
        return String(message.format({n: o.n, m: o.m}));
    } catch (e) {
        return null;
    }
}

/**
 * One objective line in the chosen language: the authored tracker template
 * from the localized /quests catalog when the objective names one, else the
 * UI template for its kind (Q2: kill/harvest over the mob's name + plural).
 */
export function objectiveLine(questId: string, o: ObjectiveData): string {
    let line: string | null = null;
    if (o.trackerKey) {
        const template = questDefinition(questId)?.trackers?.[o.trackerKey];
        line = template ? formatTracker(template, o) : null;
    }
    if (line === null) {
        switch (o.kind) {
            case AuraApi.QuestObjectiveKind.TalkTo:
                line = t('questObjectiveTalkTo', {name: mobName(o.target)});
                break;
            case AuraApi.QuestObjectiveKind.Reach:
                line = t('questObjectiveReach', {place: PLACES.get(o.region)?.title ?? o.region});
                break;
            case AuraApi.QuestObjectiveKind.Harvest:
                line = t('questObjectiveHarvest', {n: o.n, m: o.m, mob: mobName(o.target), mobPlural: mobPlural(o.target)});
                break;
            default:
                line = t('questObjectiveKill', {n: o.n, m: o.m, mob: mobName(o.target), mobPlural: mobPlural(o.target)});
        }
    }
    if (!o.stage && o.kind === AuraApi.QuestObjectiveKind.TalkTo && o.done) {
        line = t('questObjectiveDone', {line});
    }
    return line;
}
