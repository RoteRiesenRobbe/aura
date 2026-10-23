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
import {mobName} from '../../../client-data/Mobs';
import {skillDisplayName} from '../../../client-data/Skills';
import {questDefinition} from '../../../client-data/Quests';
import {PLACES} from '../../regions/logic/RegionNames';
import {contentText} from '../../../client-data/LangBundle';

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

export {mobName};

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
                    items.push(t('list.more-others', {n: count.number - items.length}));
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
    const args = decodeArgs(message);
    if (key === 'content.lines') {
        // C3: authored lines by their stable ids (each its full key, D27), from
        // the /lang bundle.
        const english = fallback.split('\n');
        const ids = args.find(a => a.name === 'ids')?.items ?? [];
        return ids.map((id, i) => contentText(id, english[i] ?? '')).join('\n');
    }
    return tKey(key, resolveArgs(args), fallback);
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
    let template: string | undefined;
    if (o.trackerKey) {
        template = questDefinition(questId)?.trackers?.[o.trackerKey];
        line = template ? formatTracker(template, o) : null;
    }
    if (line === null) {
        switch (o.kind) {
            case AuraApi.QuestObjectiveKind.TalkTo:
                line = t('journal.objective.talk-to', {name: mobName(o.target)});
                break;
            case AuraApi.QuestObjectiveKind.Reach:
                line = t('journal.objective.reach', {place: PLACES.get(o.region)?.title ?? o.region});
                break;
            case AuraApi.QuestObjectiveKind.Harvest:
                line = t('journal.objective.harvest', {n: o.n, m: o.m, mob: mobName(o.target, o.m)});
                break;
            case AuraApi.QuestObjectiveKind.Herd:
                line = t('journal.objective.herd', {n: o.n, m: o.m, mob: mobName(o.target, o.m)});
                break;
            default:
                line = t('journal.objective.kill', {n: o.n, m: o.m, mob: mobName(o.target, o.m)});
        }
    }
    // A talk_to line has no count to fill, and neither has a herd line that
    // names one animal by its own tracker ("Bring Baabara home", plan-herding.md
    // R15): both tick when done.
    const countless = o.kind === AuraApi.QuestObjectiveKind.TalkTo
        || (o.kind === AuraApi.QuestObjectiveKind.Herd && !!template && !template.includes('{n'));
    if (!o.stage && countless && o.done) {
        line = t('journal.objective.done', {line});
    }
    return line;
}

/**
 * One lock reason as plain data: a ConversationLock off the wire (a locked
 * conversation row, or a locked appearance item's progress on the owner
 * block, plan-appearance.md C5c). `have` is the player's own count.
 */
export interface LockData {
    kind: number;
    value?: number;
    have?: number;
    quest?: string;
    stage?: string;
    species?: number;
    skill?: number;
}

export function decodeLock(l: AuraApi.ConversationLock): LockData {
    return {
        kind: l.kind(),
        value: l.value(),
        have: l.have(),
        quest: l.quest() ?? '',
        stage: l.stage() ?? '',
        species: Number(l.species()),
        skill: l.skill(),
    };
}

/** One reason worded, with the player's progress on the numeric kinds. */
export function lockReasonText(l: LockData): string {
    const quest = questDefinition(l.quest ?? '')?.title ?? (l.quest ?? '');
    const value = l.value ?? 0;
    const have = l.have ?? 0;
    switch (l.kind) {
        case AuraApi.ConversationLockKind.MinLevel:
            return t('lock.min-level', {value, have});
        case AuraApi.ConversationLockKind.Ascensions:
            return t('lock.ascensions', {value, have});
        case AuraApi.ConversationLockKind.QuestComplete:
            return t('lock.quest-complete', {quest});
        case AuraApi.ConversationLockKind.QuestAtStage:
            return t('lock.quest-at-stage', {quest, stage: l.stage ?? ''});
        case AuraApi.ConversationLockKind.Kills:
            return t('lock.kills', {value, have, mob: mobName(l.species ?? 0)});
        case AuraApi.ConversationLockKind.SkillLevel:
            return t('lock.skill-level', {value, have, skill: skillDisplayName(l.skill ?? 0)});
        case AuraApi.ConversationLockKind.TravelClosed:
            return t('lock.travel-closed');
        case AuraApi.ConversationLockKind.StoneGift:
            return t('lock.stone-gift');
        default:
            return t('lock.unknown');
    }
}

function reasonsList(locks: LockData[], any: boolean): string {
    return formatList(locks.map(lockReasonText), any ? 'disjunction' : 'conjunction');
}

/** "Locked: reasons", a locked appearance item's tooltip line (C5c). */
export function lockedReasonsLine(locks: LockData[], any: boolean): string {
    return t('appearance.locked', {reasons: reasonsList(locks, any)});
}

/** "label - locked: reasons", the reasons joined by the gate's mode. */
export function lockedText(label: string, locks: LockData[], any: boolean): string {
    return t('conversation.locked-row', {
        label,
        reasons: reasonsList(locks, any),
    });
}
