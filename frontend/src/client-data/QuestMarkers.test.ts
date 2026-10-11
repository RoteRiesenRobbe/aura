import {afterEach, describe, expect, it} from 'vitest';

import {DIFFICULTY_GRAY, difficultyColor, setGrayKnobs, setLocalPlayerLevel} from './Mobs';
import {
    QUEST_MARKER_IN_PROGRESS,
    QUEST_MARKER_OFFER,
    QUEST_MARKER_TURN_IN,
    QUEST_TURN_IN_COLOR,
    allQuestMarkers,
    questHoverLines,
    questMarkerColor,
    questMarkerFor,
    questMarkerGlyph,
    questMarkersRevision,
    questTitleColor,
    setQuestMarkers,
} from './QuestMarkers';

// The full-screen map's hover over a giver: every quest the marker covers, each
// in the journal's level tint; a quest the catalog does not know is left out.
describe('questHoverLines', () => {
    afterEach(() => setLocalPlayerLevel(1));

    it('lists every covered quest in order, tinted by its level', () => {
        setLocalPlayerLevel(5);
        const catalog: Record<string, {title: string, level: number}> = {
            rats: {title: 'Giant Rats in the Barn', level: 5},
            ring: {title: "The Miller's Ring", level: 9},
        };
        const lines = questHoverLines(
            {mobId: 40, kind: QUEST_MARKER_TURN_IN, level: 0, quests: ['ring', 'unknown', 'rats']},
            (id) => catalog[id],
        );
        expect(lines).toEqual([
            {title: "The Miller's Ring", color: questTitleColor(9)},
            {title: 'Giant Rats in the Barn', color: questTitleColor(5)},
        ]);
        expect(lines[0].color).not.toBe(lines[1].color);
    });

    it('is empty when the catalog knows none of them', () => {
        expect(questHoverLines({mobId: 40, kind: QUEST_MARKER_OFFER, level: 1, quests: ['x']}, () => undefined)).toEqual([]);
    });
});

// plan-quest-giver-markers.md C3: the client half of the markers.
describe('quest markers', () => {
    afterEach(() => {
        setQuestMarkers([]);
        setLocalPlayerLevel(1);
    });

    it('replaces the whole set on every owner-block publication', () => {
        const before = questMarkersRevision();
        setQuestMarkers([{mobId: 40, kind: QUEST_MARKER_OFFER, level: 2, quests: []}, {mobId: 41, kind: QUEST_MARKER_TURN_IN, level: 0, quests: []}]);
        expect(questMarkerFor(40)?.level).toBe(2);
        expect(allQuestMarkers()).toHaveLength(2);

        setQuestMarkers([]);
        expect(questMarkerFor(40)).toBeUndefined();
        expect(allQuestMarkers()).toHaveLength(0);
        expect(questMarkersRevision()).toBe(before + 2);
    });

    it('draws `!` for an offer and `?` for both turn-in kinds', () => {
        expect(questMarkerGlyph(QUEST_MARKER_OFFER)).toBe('!');
        expect(questMarkerGlyph(QUEST_MARKER_TURN_IN)).toBe('?');
        expect(questMarkerGlyph(QUEST_MARKER_IN_PROGRESS)).toBe('?');
    });

    it('tints the `!` with the nameplate rule against the CURRENT player level', () => {
        setGrayKnobs(5, 10);
        const offer = {mobId: 40, kind: QUEST_MARKER_OFFER, level: 6, quests: []};

        setLocalPlayerLevel(1);
        expect(questMarkerColor(offer)).toBe(difficultyColor(6));
        expect(questMarkerColor(offer)).not.toBe(DIFFICULTY_GRAY);

        setLocalPlayerLevel(11); // 6 is now 5 below: the gray distance at 11 is 6, so green
        expect(questMarkerColor(offer)).toBe(difficultyColor(6));
        setLocalPlayerLevel(12); // 6 below at a gray distance of 6: trivial
        expect(questMarkerColor(offer)).toBe(DIFFICULTY_GRAY);
    });

    it('never tints a `?` by level', () => {
        expect(questMarkerColor({mobId: 1, kind: QUEST_MARKER_TURN_IN, level: 0, quests: []})).toBe(QUEST_TURN_IN_COLOR);
        expect(questMarkerColor({mobId: 1, kind: QUEST_MARKER_IN_PROGRESS, level: 0, quests: []})).toBe(DIFFICULTY_GRAY);
    });
});
