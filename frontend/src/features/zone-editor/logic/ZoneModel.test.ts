import {describe, expect, it} from 'vitest';
import {kindOf, ZoneData, ZoneModel, ZoneSpawn} from './ZoneModel';

// A character's campfire bind is persisted as the spawn-point id, so these are
// persistence tests wearing an editor's clothes: an id the editor drops or
// re-issues unbinds or misplaces real characters, and neither failure is
// visible in the editor itself.

function zone(campfires: ZoneData['campfires']): ZoneModel {
    return ZoneModel.fromJSON({
        name: 'X',
        bounds: {width: 60, height: 40},
        terrain: [],
        props: [],
        spawns: [],
        campfires,
    });
}

function zoneWithSpawns(spawns: ZoneSpawn[]): ZoneModel {
    return ZoneModel.fromJSON({
        name: 'X',
        bounds: {width: 60, height: 40},
        terrain: [],
        props: [],
        spawns,
    });
}

function spawn(overrides: Partial<ZoneSpawn> = {}): ZoneSpawn {
    return {
        mob: 'Wolf',
        x: 1,
        y: 2,
        angle: 0,
        respawnTicks: 900,
        respawnVariancePct: 0.2,
        ...overrides,
    };
}

describe('ZoneModel spawn points', () => {
    it('keeps campfire ids through an export round-trip', () => {
        // ⚑ The serializer is a field WHITELIST, so a new field is dropped
        // unless it is named there — which is how a hand-authored id would
        // silently disappear on the PO's next save.
        let model = zone([
            {id: 'spawnpoint-1', x: 3, y: -4.5, startingSpawn: true},
            {id: 'spawnpoint-2', x: 0, y: 0},
        ]);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        expect(exported.campfires).toEqual([
            {id: 'spawnpoint-1', x: 3, y: -4.5, startingSpawn: true},
            {id: 'spawnpoint-2', x: 0, y: 0},
        ]);
    });

    it('mints an id for a fire placed without one', () => {
        let model = zone([{id: 'spawnpoint-1', x: 0, y: 0, startingSpawn: true}]);

        model.addCampfire({id: '', x: 5, y: 5});

        expect(model.campfires[1].id).toBe('spawnpoint-2');
    });

    it('mints above the highest existing number, not the array length', () => {
        // Placing after a deletion must not re-issue spawnpoint-2: a character
        // still bound to the deleted fire would be handed the new one.
        let model = zone([
            {id: 'spawnpoint-1', x: 0, y: 0, startingSpawn: true},
            {id: 'spawnpoint-7', x: 5, y: 5},
        ]);

        model.addCampfire({id: '', x: 1, y: 1});

        expect(model.campfires[2].id).toBe('spawnpoint-8');
    });

    it('does not reuse the number of a fire deleted in this session', () => {
        let model = zone([
            {id: 'spawnpoint-1', x: 0, y: 0, startingSpawn: true},
            {id: 'spawnpoint-2', x: 5, y: 5},
        ]);

        model.addCampfire({id: '', x: 1, y: 1}); // spawnpoint-3
        model.removeCampfire(2);
        model.addCampfire({id: '', x: 2, y: 2});

        expect(model.campfires[2].id).toBe('spawnpoint-4');
    });

    it('leaves a hand-authored id alone', () => {
        let model = zone([{id: 'village-fire', x: 0, y: 0, startingSpawn: true}]);

        model.addCampfire({id: 'crossroads-fire', x: 5, y: 5});

        expect(model.campfires.map(c => c.id)).toEqual(['village-fire', 'crossroads-fire']);
    });
});

// The derived spawn-editor category (plan-zone-editor-structure.md §4.1).
// Fixture shapes mirror real defs: Wolf (bare), Wanderer (a talker that also
// authors a role), AscensionStone (structure + interaction: talker wins),
// Brazier (BOTH legacy and structure: legacy wins, deliberately, until C3
// deletes the branch with the defs).
describe('kindOf', () => {
    it('classifies a def with neither role nor interaction as combat', () => {
        expect(kindOf({})).toBe('combat');
    });

    it('classifies a non-structure role without interaction as combat', () => {
        // role has values beyond structure/follower (Wanderer authors
        // "creature"); anything unrecognized must fall through, never throw.
        expect(kindOf({role: 'creature'})).toBe('combat');
    });

    it('classifies an interaction carrier as talker', () => {
        expect(kindOf({interaction: {range: 2}})).toBe('talker');
    });

    it('lets interaction beat role', () => {
        expect(kindOf({role: 'structure', interaction: {range: 2}})).toBe('talker');
    });

    it('classifies role structure as fixture', () => {
        expect(kindOf({role: 'structure'})).toBe('fixture');
    });

    it('classifies role follower as companion', () => {
        expect(kindOf({role: 'follower'})).toBe('companion');
    });

    it('lets legacy beat everything (the Brazier precedence)', () => {
        expect(kindOf({legacy: true, role: 'structure'})).toBe('legacy');
    });
});

// The per-spawn level override (plan-mob-levels.md C3, L7). Same whitelist,
// same failure shape as the campfire id above: the backend has accepted
// spawn.level since C1, but a field the serializer does not name survives a
// load and vanishes on the next save — so a hand-authored override is deleted
// by opening the zone for an unrelated edit, with nothing visible going wrong.
describe('ZoneModel spawn levels', () => {
    it('keeps a per-spawn level through an export round-trip', () => {
        let model = zoneWithSpawns([spawn({level: 15})]);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        expect(exported.spawns[0].level).toBe(15);
    });

    it('emits no level key for a spawn that inherits the species level', () => {
        // The diff-clean property every optional field in this serializer
        // maintains: absent must stay absent, or a one-spawn edit turns
        // world.json's 485 spawns into a 485-line diff.
        let model = zoneWithSpawns([spawn()]);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        expect(exported.spawns[0]).not.toHaveProperty('level');
    });
});
