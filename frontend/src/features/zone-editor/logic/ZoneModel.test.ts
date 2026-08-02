import {describe, expect, it} from 'vitest';
import {ZoneData, ZoneModel} from './ZoneModel';

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
