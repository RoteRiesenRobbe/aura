import {DIFFICULTY_GRAY, difficultyColor} from './Mobs';
import {cssHex} from './Theme';

/**
 * Quest-giver markers (plan-quest-giver-markers.md C3): what every conversant
 * species shows this player over its head and on the maps. The SERVER decides
 * them (GameState.quest_markers, the owner block); this module only holds the
 * latest list and says how one is drawn.
 *
 * ⚑ Keyed by mob_id, the catalog species key (D10): every entity and every
 * zone spawn of that species shows the same marker, so nothing here knows a
 * position.
 */

// The wire's QuestMarker.kind (api/schema/server.fbs).
export const QUEST_MARKER_OFFER = 1;      // `!`, a quest to take
export const QUEST_MARKER_TURN_IN = 2;    // yellow `?`, a step to take here now
export const QUEST_MARKER_IN_PROGRESS = 3; // grey `?`, finishes a running quest

export interface QuestMarkerData {
    mobId: number;
    kind: number;
    // The offer's target level (kind 1 only), which the `!` is tinted by.
    level: number;
    // Every quest the marker covers, whatever its kind (the world map's hover).
    quests: string[];
}

// The yellow `?`. [PLACEHOLDER] — deliberately the difficulty palette's own
// "even" yellow, so `?` and an at-level `!` read as one family.
export const QUEST_TURN_IN_COLOR = 0xf5d442;

let markers = new Map<number, QuestMarkerData>();
let revision = 0;

/** Replaces the whole set: an owner-block tick carries every marker or none. */
export function setQuestMarkers(list: readonly QuestMarkerData[]) {
    markers = new Map(list.map((m) => [m.mobId, m]));
    revision++;
}

export function questMarkerFor(mobId: number): QuestMarkerData | undefined {
    return markers.get(mobId);
}

export function allQuestMarkers(): QuestMarkerData[] {
    return [...markers.values()];
}

/** Moves whenever the set is replaced, so a drawer can skip unchanged frames. */
export function questMarkersRevision(): number {
    return revision;
}

export function questMarkerGlyph(kind: number): string {
    return kind === QUEST_MARKER_OFFER ? '!' : '?';
}

/**
 * The CSS colour a quest title is tinted by (plan-quest-giver-markers.md D4):
 * the journal, the tracker and a conversation offer row. '' for an unknown
 * level (0), which clears an inline colour so the stylesheet's own applies.
 */
export function questTitleColor(level: number): string {
    return level > 0 ? cssHex(difficultyColor(level)) : '';
}

/**
 * The marker's colour. The `!` takes the quest level's difficulty tint — the
 * mob nameplate's rule, read against the player's CURRENT level, so a level-up
 * recolours it without the server resending anything (D9).
 */
export function questMarkerColor(marker: QuestMarkerData): number {
    switch (marker.kind) {
        case QUEST_MARKER_OFFER:
            return difficultyColor(marker.level);
        case QUEST_MARKER_TURN_IN:
            return QUEST_TURN_IN_COLOR;
        default:
            return DIFFICULTY_GRAY;
    }
}

/** One line of the world map's quest hover: a title in its quest-level tint. */
export interface QuestHoverLine {
    title: string;
    color: string;
}

/**
 * The world map's hover over a giver's marker: one title per quest the marker
 * covers, tinted by the journal's rule (questTitleColor). A quest the catalog
 * does not know is left out, so an unloaded catalog shows no box at all.
 */
export function questHoverLines(
    marker: QuestMarkerData,
    definitionOf: (questId: string) => {title: string, level: number} | undefined,
): QuestHoverLine[] {
    const lines: QuestHoverLine[] = [];
    for (const id of marker.quests) {
        const def = definitionOf(id);
        if (def) {
            lines.push({title: def.title, color: questTitleColor(def.level)});
        }
    }
    return lines;
}
