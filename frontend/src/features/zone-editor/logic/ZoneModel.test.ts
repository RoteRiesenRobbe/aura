import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {capabilitiesOf, kindOf, ZoneData, ZoneModel, ZoneProp, ZoneSpawn} from './ZoneModel';

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

function zoneWithProps(props: ZoneProp[]): ZoneModel {
    return ZoneModel.fromJSON({
        name: 'X',
        bounds: {width: 60, height: 40},
        terrain: [],
        props,
        spawns: [],
    });
}

function prop(overrides: Partial<ZoneProp> = {}): ZoneProp {
    return {type: 'Tree', x: 1, y: 2, rotation: 0.5, blocksMovement: true, ...overrides};
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
// authors a role), AscensionStone (structure + interaction: talker wins).
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

});

// The control-gating capability (plan-zone-editor-structure.md §4.5) -
// capability, never the kindOf bucket: Wanderer is a talker that walks,
// Turnip a fixture that dies (L4). All 58 defs author factors.speed
// explicitly (movers > 0, everything stationary 0); absence mirrors the Go
// zero value, 0, and must classify as not-moving, never throw.
describe('capabilitiesOf', () => {
    it('gives a plain combat def both capabilities (Wolf)', () => {
        expect(capabilitiesOf({factors: {speed: 0.7}}))
            .toEqual({moves: true, respawns: true});
    });

    it('gives a stationary talker neither (AscensionStone)', () => {
        expect(capabilitiesOf({interaction: {range: 2}, factors: {speed: 0}}))
            .toEqual({moves: false, respawns: false});
    });

    it('lets the talker that walks keep its movement controls (Wanderer)', () => {
        expect(capabilitiesOf({interaction: {range: 2}, factors: {speed: 0.5}}))
            .toEqual({moves: true, respawns: false});
    });

    it('lets the fixture that dies keep its respawn controls (Turnip)', () => {
        expect(capabilitiesOf({factors: {speed: 0}}))
            .toEqual({moves: false, respawns: true});
    });

    it('treats absent factors or absent speed as not moving, without throwing', () => {
        expect(capabilitiesOf({})).toEqual({moves: false, respawns: true});
        expect(capabilitiesOf({factors: {}})).toEqual({moves: false, respawns: true});
    });
});

// The L7 whitelist guard (plan-zone-editor-structure.md §7): the serializer is
// a field whitelist that has silently eaten a field twice (spawn.level, the
// campfire id class), and C2 edits it - so the REAL zone must round-trip
// unchanged, and the 17 respawn-free spawns (exactly the talkers; the authored
// convention "a talker authors no respawn") must stay respawn-free.
// ⚑ Read from disk with an absolute path: jsdom rewrites import.meta.url to a
// non-file scheme, so a new URL(relative, import.meta.url) does not work here.
// process.cwd() is frontend/ under vitest.
describe('world.json round-trip', () => {
    const worldPath = resolve(process.cwd(), '../api/zones/world.json');
    const worldRaw = JSON.parse(readFileSync(worldPath, 'utf-8')) as ZoneData;

    it('round-trips the real world zone without changing a field', () => {
        let model = ZoneModel.fromJSON(worldRaw);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        expect(exported).toEqual(worldRaw);
    });

    it('keeps the 17 talker spawns respawn-free', () => {
        let model = ZoneModel.fromJSON(worldRaw);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        let respawnFree = exported.spawns.filter(s => !('respawnTicks' in s));
        expect(respawnFree.length).toBe(17);
        expect(respawnFree.every(s => !('respawnVariancePct' in s))).toBe(true);
    });
});

// ⚑ L1 — the per-placement prop scale (plan-prop-scale.md C1). THE SAME
// WHITELIST that ate spawn.level, and the same failure shape, with one twist
// that makes it likelier: this editor does not author scale at all, Tiled and
// the placement scripts do. So the loss would happen to somebody ELSE'S work —
// open the zone in the in-game editor to nudge one campfire, save, and every
// scaled prop in the world quietly returns to its type's size.
describe('ZoneModel prop scale', () => {
    it('keeps a per-placement scale through an export round-trip', () => {
        let model = zoneWithProps([prop({scale: 2.5})]);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        expect(exported.props[0].scale).toBe(2.5);
    });

    it('emits no scale key for a prop that inherits its type body', () => {
        // Absent must stay absent, or a one-prop edit turns world.json's 807
        // props into an 807-line diff.
        let model = zoneWithProps([prop()]);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        expect(exported.props[0]).not.toHaveProperty('scale');
    });

    it('rounds scale to 3 decimals, like rotation', () => {
        let model = zoneWithProps([prop({scale: 1.23456789})]);

        let exported = JSON.parse(model.getZoneAsJSON()) as ZoneData;

        expect(exported.props[0].scale).toBe(1.235);
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
