import {describe, expect, it} from 'vitest';
import {readSpawnValues, spawnControlValues, SpawnControlValues} from './SpawnControls';
import {MobCapabilities, ZoneSpawn} from './ZoneModel';

// The four capability corners of the roster (§4.5): a wolf moves and
// respawns, an ascension stone does neither, Wanderer is the talker that
// walks, Turnip the fixture that dies - the two counterexamples that make
// capability, not bucket, the gate (L4).
const WOLF: MobCapabilities = {moves: true, respawns: true};
const STONE: MobCapabilities = {moves: false, respawns: false};
const WANDERER: MobCapabilities = {moves: true, respawns: false};
const TURNIP: MobCapabilities = {moves: false, respawns: true};

function values(overrides: Partial<SpawnControlValues> = {}): SpawnControlValues {
    // The HTML defaults: respawn 900 / 0.2 pre-filled, the rest empty.
    return {
        level: '',
        respawnTicks: '900',
        respawnVariance: '0.2',
        angle: '0',
        wanderRadius: '',
        idleSpeed: '',
        patrolMode: 'pingpong',
        ...overrides,
    };
}

function fieldsOf(result: ReturnType<typeof readSpawnValues>) {
    if (result.ok === false) {
        throw new Error('expected ok, got error: ' + result.error);
    }
    return result.fields;
}

// Pins of the pre-C2 behavior the extraction must carry over unchanged -
// these rules are easy to accidentally "fix" while porting.
describe('readSpawnValues (ported validation)', () => {
    it('reads the defaults into a full combat field set', () => {
        let fields = fieldsOf(readSpawnValues(values(), WOLF));
        expect(fields).toEqual({
            angle: 0,
            respawnTicks: 900,
            respawnVariancePct: 0.2,
            wanderRadius: undefined,
            idleSpeedFactor: undefined,
            level: undefined,
        });
    });

    it('converts the angle from degrees to radians', () => {
        expect(fieldsOf(readSpawnValues(values({angle: '90'}), WOLF)).angle)
            .toBeCloseTo(Math.PI / 2);
    });

    it('rejects a fractional or sub-1 level, keeps empty as inherit', () => {
        expect(readSpawnValues(values({level: '2.5'}), WOLF))
            .toEqual({ok: false, error: 'Level must be a whole number >= 1'});
        expect(readSpawnValues(values({level: '0'}), WOLF).ok).toBe(false);
        expect(fieldsOf(readSpawnValues(values({level: '15'}), WOLF)).level).toBe(15);
        expect(fieldsOf(readSpawnValues(values(), WOLF)).level).toBeUndefined();
    });

    it('refuses empty or negative respawn ticks on a combat mob', () => {
        // The predicate for omitting respawn is the def, NEVER an empty input:
        // an absent key parses to 0 server-side and the mob would respawn
        // every tick (§4.6) - so combat keeps the hard validation.
        expect(readSpawnValues(values({respawnTicks: ''}), WOLF))
            .toEqual({ok: false, error: 'Invalid respawn ticks'});
        expect(readSpawnValues(values({respawnTicks: '-5'}), WOLF).ok).toBe(false);
    });

    it('coerces an invalid variance to 0 instead of erroring', () => {
        expect(fieldsOf(readSpawnValues(values({respawnVariance: ''}), WOLF)).respawnVariancePct).toBe(0);
        expect(fieldsOf(readSpawnValues(values({respawnVariance: '-1'}), WOLF)).respawnVariancePct).toBe(0);
    });

    it('keeps the wander tri-state and clamps a negative radius to 0', () => {
        expect(fieldsOf(readSpawnValues(values(), WOLF)).wanderRadius).toBeUndefined();
        expect(fieldsOf(readSpawnValues(values({wanderRadius: '0'}), WOLF)).wanderRadius).toBe(0);
        expect(fieldsOf(readSpawnValues(values({wanderRadius: '-3'}), WOLF)).wanderRadius).toBe(0);
        expect(fieldsOf(readSpawnValues(values({wanderRadius: '4.5'}), WOLF)).wanderRadius).toBe(4.5);
    });

    it('rejects an idle speed outside (0, 1], keeps empty as inherit', () => {
        expect(readSpawnValues(values({idleSpeed: '1.5'}), WOLF))
            .toEqual({ok: false, error: 'Idle speed factor must be in (0, 1]'});
        expect(readSpawnValues(values({idleSpeed: '0'}), WOLF).ok).toBe(false);
        expect(fieldsOf(readSpawnValues(values({idleSpeed: '0.5'}), WOLF)).idleSpeedFactor).toBe(0.5);
        expect(fieldsOf(readSpawnValues(values(), WOLF)).idleSpeedFactor).toBeUndefined();
    });
});

// The C2 fix: hidden controls are never read. The respawn predicate is the
// def's interaction, the movement predicate its speed - whatever stale text
// the hidden inputs still hold from the previous selection.
describe('readSpawnValues (capability gating)', () => {
    it('emits no respawn keys for a talker even with the 900/0.2 defaults in the inputs', () => {
        let fields = fieldsOf(readSpawnValues(values(), STONE));
        expect(fields.respawnTicks).toBeUndefined();
        expect(fields.respawnVariancePct).toBeUndefined();
    });

    it('accepts a talker with blank respawn inputs (the live stone refusal)', () => {
        // Selecting the village stone blanks the inputs (populate of an
        // absent value) and Update used to refuse with "Invalid respawn
        // ticks" - the bug this chunk exists to fix.
        let result = readSpawnValues(values({respawnTicks: '', respawnVariance: ''}), STONE);
        expect(result.ok).toBe(true);
    });

    it('drops stale movement overrides for a species that cannot move', () => {
        let fields = fieldsOf(readSpawnValues(values({wanderRadius: '5', idleSpeed: '0.5'}), TURNIP));
        expect(fields.wanderRadius).toBeUndefined();
        expect(fields.idleSpeedFactor).toBeUndefined();
    });

    it('keeps movement overrides for the talker that walks (Wanderer)', () => {
        let fields = fieldsOf(readSpawnValues(values({wanderRadius: '5', idleSpeed: '0.5'}), WANDERER));
        expect(fields.wanderRadius).toBe(5);
        expect(fields.idleSpeedFactor).toBe(0.5);
        expect(fields.respawnTicks).toBeUndefined();
    });

    it('keeps respawn keys for the fixture that dies (Turnip)', () => {
        let fields = fieldsOf(readSpawnValues(values(), TURNIP));
        expect(fields.respawnTicks).toBe(900);
        expect(fields.respawnVariancePct).toBe(0.2);
    });
});

function talkerSpawn(): ZoneSpawn {
    // Exactly what world.json's 17 talker spawns look like after fromJSON:
    // no respawn keys at all.
    return {mob: 'AscensionStone', x: 10, y: 20, angle: 0, waypoints: []};
}

describe('spawnControlValues (populate)', () => {
    it('renders absent respawn keys as empty strings, never "undefined"', () => {
        // String(undefined) into a number input is L2: the browser blanks it
        // silently and Update then refuses - the visible half of the bug.
        let v = spawnControlValues(talkerSpawn());
        expect(v.respawnTicks).toBe('');
        expect(v.respawnVariance).toBe('');
    });

    it('renders present values as before', () => {
        let v = spawnControlValues({
            mob: 'Wolf', x: 0, y: 0, angle: Math.PI / 2,
            respawnTicks: 900, respawnVariancePct: 0.2,
            wanderRadius: 4, idleSpeedFactor: 0.3, level: 7,
            patrolMode: 'loop', waypoints: [],
        });
        expect(v).toEqual({
            level: '7',
            respawnTicks: '900',
            respawnVariance: '0.2',
            angle: '90',
            wanderRadius: '4',
            idleSpeed: '0.3',
            patrolMode: 'loop',
        });
    });

    it('round-trips a talker through populate and read without growing respawn keys', () => {
        // The full panel seam: select the stone, press Update. The pair must
        // hand back a spawn with the keys still absent (§4.6 / P6).
        let result = readSpawnValues(spawnControlValues(talkerSpawn()), STONE);
        expect(result.ok).toBe(true);
        let fields = fieldsOf(result);
        expect(fields.respawnTicks).toBeUndefined();
        expect(fields.respawnVariancePct).toBeUndefined();
    });
});
