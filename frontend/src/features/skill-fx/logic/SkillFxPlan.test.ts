import {describe, expect, it} from 'vitest';
import {AuraApi} from '../../backend/logic/AuraApi';
import {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {VisualLayer} from '../../../client-data/Skills';
import {
    CHAIN_HOP_STAGGER_MS,
    contactMs,
    flightMs,
    STRIKE_CURVE_MS,
} from './SkillFxMath';
import {
    planAmbient,
    PlanPoint,
    planSpawns,
    PointOf,
    SkillVisual,
    SpawnPlan,
    VisualOf,
} from './SkillFxPlan';

// The manager's decisions, without a renderer (the C2a ledger's open gap):
// which layers an event draws, what it draws them between, and when.

const CASTER = 1;
const OTHER_CASTER = 2;
const A = 10;
const B = 11;
const C = 12;
const UNKNOWN = 99;

const SKILL = 5;
const OTHER_SKILL = 6;
const COLOR = 0x112233;

/** A landed hit; every field overridable, so each test states only its point. */
function hit(overrides: Partial<SkillEventData> = {}): SkillEventData {
    return {
        source: CASTER,
        victim: A,
        skillId: SKILL,
        amount: 12,
        kind: AuraApi.HitKind.Damage,
        fired: false,
        ...overrides,
    };
}

/** A cast that went off: no victim on the wire. */
function fired(overrides: Partial<SkillEventData> = {}): SkillEventData {
    return hit({victim: 0, amount: 0, fired: true, ...overrides});
}

function visuals(bySkill: { [skillId: number]: VisualLayer[] }): VisualOf {
    return (skillId) => {
        const layers = bySkill[skillId];
        return layers === undefined ? undefined : {layers, baseColor: COLOR} as SkillVisual;
    };
}

function world(points: { [entityId: number]: PlanPoint }): PointOf {
    return (entityId) => points[entityId];
}

/** The line-up every chain case uses: nearest-neighbour order is A, B, C. */
const CHAIN_WORLD = world({
    [CASTER]: {x: 0, y: 0},
    [A]: {x: 350, y: 0},   // 350 from the caster
    [B]: {x: 840, y: 0},   // 490 from A
    [C]: {x: 1050, y: 0},  // 210 from B
});

const NEAR = world({
    [CASTER]: {x: 0, y: 0},
    [OTHER_CASTER]: {x: 0, y: 100},
    [A]: {x: 350, y: 0},
    [B]: {x: 840, y: 0},
});

const PROJECTILE_SPEED = 700;

function kinds(plan: readonly SpawnPlan[]): string[] {
    return plan.map(entry => entry.def.kind);
}

function delayOf(plan: readonly SpawnPlan[], kind: string): number {
    return plan.filter(entry => entry.def.kind === kind).map(entry => entry.delayMs)[0];
}

describe('planSpawns: which layers an event draws', () => {
    it('plans nothing for a skill with no visual', () => {
        expect(planSpawns([hit()], visuals({}), NEAR)).toEqual([]);
    });

    it('plans nothing for a visual with an empty layer list', () => {
        expect(planSpawns([hit()], visuals({[SKILL]: []}), NEAR)).toEqual([]);
    });

    it('picks only the on:hit layers for a HIT event', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'impact', on: 'hit'},
                {kind: 'cast-pose', on: 'fired'},
                {kind: 'orbit', on: 'ambient'},
            ],
        }), NEAR);
        expect(kinds(plan)).toEqual(['impact']);
    });

    it('picks only the on:fired layers for a FIRED event', () => {
        const plan = planSpawns([fired()], visuals({
            [SKILL]: [
                {kind: 'impact', on: 'hit'},
                {kind: 'cast-pose', on: 'fired'},
                {kind: 'orbit', on: 'ambient'},
            ],
        }), NEAR);
        expect(kinds(plan)).toEqual(['cast-pose']);
    });

    it('makes the caster both ends of a FIRED event', () => {
        const plan = planSpawns([fired()], visuals({
            [SKILL]: [{kind: 'cast-pose', on: 'fired'}],
        }), NEAR);
        expect(plan).toHaveLength(1);
        expect(plan[0].source).toBe(CASTER);
        expect(plan[0].from).toBe(CASTER);
        expect(plan[0].victim).toBe(CASTER);
    });

    it('plans nothing when no layer sits on the event\'s trigger', () => {
        expect(planSpawns([hit()], visuals({
            [SKILL]: [{kind: 'cast-pose', on: 'fired'}],
        }), NEAR)).toEqual([]);
    });

    it('keeps the authored layer order and carries the skill\'s colour', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
                {kind: 'impact', on: 'hit'},
            ],
        }), NEAR);
        expect(kinds(plan)).toEqual(['projectile', 'impact']);
        expect(plan.every(entry => entry.baseColor === COLOR)).toBe(true);
    });

    // An Immune or an Absorb landing still landed (§12b.3), so `on: hit` draws
    // whatever the HitKind says - the field is read by the numbers, not here.
    it('plans an Immune landing like any other hit', () => {
        const plan = planSpawns([hit({kind: AuraApi.HitKind.Immune, amount: 0})], visuals({
            [SKILL]: [{kind: 'impact', on: 'hit'}],
        }), NEAR);
        expect(kinds(plan)).toEqual(['impact']);
    });

    it('plans an Absorbed landing like any other hit', () => {
        const plan = planSpawns([hit({kind: AuraApi.HitKind.Absorb, amount: 0})], visuals({
            [SKILL]: [{kind: 'impact', on: 'hit'}],
        }), NEAR);
        expect(kinds(plan)).toEqual(['impact']);
    });
});

describe('planSpawns: an entity the client does not hold', () => {
    const oneImpact = visuals({[SKILL]: [{kind: 'impact', on: 'hit'}]});

    it('skips an event whose source is unknown, without throwing', () => {
        expect(planSpawns([hit({source: UNKNOWN})], oneImpact, NEAR)).toEqual([]);
    });

    it('skips an event whose victim is unknown, without throwing', () => {
        expect(planSpawns([hit({victim: UNKNOWN})], oneImpact, NEAR)).toEqual([]);
    });

    it('skips a FIRED event whose caster is unknown', () => {
        expect(planSpawns([fired({source: UNKNOWN})], visuals({
            [SKILL]: [{kind: 'cast-pose', on: 'fired'}],
        }), NEAR)).toEqual([]);
    });

    it('still plans the other events of the same snapshot', () => {
        const plan = planSpawns([
            hit({victim: UNKNOWN}),
            hit({victim: A}),
            hit({source: UNKNOWN, victim: B}),
            hit({victim: B}),
        ], oneImpact, NEAR);
        expect(plan.map(entry => entry.victim)).toEqual([A, B]);
    });
});

describe('planSpawns: implicit sequencing', () => {
    it('starts an impact when the projectile arrives, and the bolt at once', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
                {kind: 'impact', on: 'hit'},
            ],
        }), NEAR);
        // The caster is 350 px from A: half a second at 700 px/s.
        expect(delayOf(plan, 'projectile')).toBe(0);
        expect(delayOf(plan, 'impact')).toBe(flightMs(350, PROJECTILE_SPEED));
        expect(delayOf(plan, 'impact')).toBe(500);
    });

    it('starts an impact at the strike\'s contact moment', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'strike', on: 'hit', curve: 'swing', ms: 280},
                {kind: 'impact', on: 'hit'},
            ],
        }), NEAR);
        expect(delayOf(plan, 'strike')).toBe(0);
        expect(delayOf(plan, 'impact')).toBe(contactMs('swing', 280));
    });

    it('takes the curve\'s default ms when the strike authors none', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'strike', on: 'hit', curve: 'overhead'},
                {kind: 'impact', on: 'hit'},
            ],
        }), NEAR);
        expect(delayOf(plan, 'impact')).toBe(contactMs('overhead', STRIKE_CURVE_MS.overhead));
    });

    it('waits for the LATER of a projectile and a strike', () => {
        // The bolt lands at 500 ms; the thrust touches at 0.45 x 200 = 90.
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
                {kind: 'strike', on: 'hit'},
                {kind: 'impact', on: 'hit'},
            ],
        }), NEAR);
        expect(delayOf(plan, 'impact')).toBe(flightMs(350, PROJECTILE_SPEED));

        // Now the other way round: a slow overhead outlasts a point-blank bolt.
        const slow = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: 100_000},
                {kind: 'strike', on: 'hit', curve: 'overhead', ms: 2_000},
                {kind: 'impact', on: 'hit'},
            ],
        }), NEAR);
        expect(delayOf(slow, 'impact')).toBe(contactMs('overhead', 2_000));
    });

    it('leaves every other kind at no delay', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
                {kind: 'beam', on: 'hit'},
                {kind: 'strike', on: 'hit'},
            ],
        }), NEAR);
        expect(plan.map(entry => entry.delayMs)).toEqual([0, 0, 0]);
    });
});

describe('planSpawns: chained beams', () => {
    const chainedLayers: VisualLayer[] = [
        {kind: 'beam', on: 'hit', chain: true},
        {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
        {kind: 'impact', on: 'hit'},
    ];
    const chained = visuals({[SKILL]: chainedLayers});

    function beams(plan: readonly SpawnPlan[]): SpawnPlan[] {
        return plan.filter(entry => entry.def.kind === 'beam');
    }

    it('orders one source\'s hits nearest-neighbour from the caster', () => {
        // Fed out of order on purpose: the chain is decided by position.
        const plan = planSpawns(
            [hit({victim: C}), hit({victim: A}), hit({victim: B})], chained, CHAIN_WORLD);
        expect(beams(plan).map(entry => entry.victim)).toEqual([A, B, C]);
    });

    it('anchors hop N at the previous victim and hop 0 at the caster', () => {
        const plan = planSpawns(
            [hit({victim: C}), hit({victim: A}), hit({victim: B})], chained, CHAIN_WORLD);
        expect(beams(plan).map(entry => entry.from)).toEqual([CASTER, A, B]);
        // The source stays the caster on every hop - only the anchor moves.
        expect(beams(plan).every(entry => entry.source === CASTER)).toBe(true);
    });

    it('staggers hop N by N hops', () => {
        const plan = planSpawns(
            [hit({victim: C}), hit({victim: A}), hit({victim: B})], chained, CHAIN_WORLD);
        expect(beams(plan).map(entry => entry.delayMs))
            .toEqual([0, CHAIN_HOP_STAGGER_MS, 2 * CHAIN_HOP_STAGGER_MS]);
    });

    it('adds each hop\'s own arrival on top of its hop delay', () => {
        const plan = planSpawns(
            [hit({victim: C}), hit({victim: A}), hit({victim: B})], chained, CHAIN_WORLD);
        const impacts = plan.filter(entry => entry.def.kind === 'impact');
        expect(impacts.map(entry => entry.victim)).toEqual([A, B, C]);
        // Each flight is measured from the hop's OWN anchor: caster→A is 350,
        // A→B is 490, B→C is 210.
        expect(impacts.map(entry => entry.delayMs)).toEqual([
            flightMs(350, PROJECTILE_SPEED),
            CHAIN_HOP_STAGGER_MS + flightMs(490, PROJECTILE_SPEED),
            2 * CHAIN_HOP_STAGGER_MS + flightMs(210, PROJECTILE_SPEED),
        ]);
    });

    it('chains a single victim exactly like a plain landing', () => {
        const plan = planSpawns([hit({victim: A})], chained, CHAIN_WORLD);
        expect(beams(plan).map(entry => entry.from)).toEqual([CASTER]);
        expect(beams(plan)[0].delayMs).toBe(0);
    });

    it('gives two sources of the same skill a chain each', () => {
        const plan = planSpawns([
            hit({source: CASTER, victim: A}),
            hit({source: OTHER_CASTER, victim: B}),
            hit({source: CASTER, victim: B}),
            hit({source: OTHER_CASTER, victim: A}),
        ], chained, NEAR);
        const hops = beams(plan).map(entry => [entry.source, entry.from, entry.delayMs]);
        expect(hops).toEqual([
            [CASTER, CASTER, 0],
            [CASTER, A, CHAIN_HOP_STAGGER_MS],
            [OTHER_CASTER, OTHER_CASTER, 0],
            [OTHER_CASTER, A, CHAIN_HOP_STAGGER_MS],
        ]);
    });

    it('does not chain a FIRED event', () => {
        const plan = planSpawns([fired()], visuals({
            [SKILL]: [{kind: 'beam', on: 'fired', chain: true}],
        }), NEAR);
        expect(plan).toHaveLength(1);
        expect(plan[0].from).toBe(CASTER);
        expect(plan[0].victim).toBe(CASTER);
        expect(plan[0].delayMs).toBe(0);
    });

    it('does not chain a beam that authors chain: false', () => {
        const plan = planSpawns([hit({victim: A}), hit({victim: B})], visuals({
            [SKILL]: [{kind: 'beam', on: 'hit'}],
        }), NEAR);
        expect(plan.map(entry => entry.from)).toEqual([CASTER, CASTER]);
        expect(plan.map(entry => entry.delayMs)).toEqual([0, 0]);
    });

    it('plans the plain landings before the chained ones', () => {
        const plan = planSpawns([
            hit({victim: A}),                      // chained, fed first
            hit({skillId: OTHER_SKILL, victim: B}), // plain, fed second
        ], visuals({
            [SKILL]: chainedLayers,
            [OTHER_SKILL]: [{kind: 'impact', on: 'hit'}],
        }), NEAR);
        expect(plan[0].victim).toBe(B);
        expect(kinds(plan)).toEqual(['impact', 'beam', 'projectile', 'impact']);
    });
});

describe('planSpawns: the cast-pose on a hit (PO 2026-09-20)', () => {
    const BOW: { [skillId: number]: VisualLayer[] } = {
        [SKILL]: [
            {kind: 'cast-pose', on: 'hit', ms: 250},
            {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
        ],
    };

    it('aims the pose at the victim: from the caster, to the one it hit', () => {
        const pose = planSpawns([hit()], visuals(BOW), NEAR)
            .filter(entry => entry.def.kind === 'cast-pose');
        expect(pose).toHaveLength(1);
        expect(pose[0].from).toBe(CASTER);
        expect(pose[0].victim).toBe(A);
    });

    it('draws ONE bow for a multi-target beat, and an arrow per victim', () => {
        const plan = planSpawns([hit({victim: A}), hit({victim: B})], visuals(BOW), NEAR);
        expect(kinds(plan).filter(k => k === 'cast-pose')).toHaveLength(1);
        expect(kinds(plan).filter(k => k === 'projectile')).toHaveLength(2);
        expect(plan.find(entry => entry.def.kind === 'cast-pose').victim).toBe(A);
    });

    it('gives two archers a bow each', () => {
        const plan = planSpawns(
            [hit({victim: A}), hit({source: OTHER_CASTER, victim: B})], visuals(BOW), NEAR);
        expect(kinds(plan).filter(k => k === 'cast-pose')).toHaveLength(2);
    });

    it('draws no pose on a beat that hit nobody', () => {
        expect(planSpawns([fired()], visuals(BOW), NEAR)).toEqual([]);
    });
});

describe('planSpawns: the skill\'s reach (PO 2026-09-20)', () => {
    it('carries the reach to every layer, and 0 for a skill that has none', () => {
        const ORBIT: VisualLayer[] = [{kind: 'orbit', on: 'fired', count: 2}];
        const withReach: VisualOf = () => ({layers: ORBIT, baseColor: COLOR, reachPx: 240});
        expect(planSpawns([fired()], withReach, NEAR)[0].reachPx).toBe(240);
        expect(planSpawns([fired()], visuals({[SKILL]: ORBIT}), NEAR)[0].reachPx).toBe(0);
    });
});

describe('planSpawns: seeds', () => {
    const twoLayers = visuals({
        [SKILL]: [{kind: 'impact', on: 'hit'}, {kind: 'beam', on: 'hit'}],
    });

    it('gives one landing\'s layers one seed, and the next landing the next', () => {
        const plan = planSpawns([hit({victim: A}), hit({victim: B})], twoLayers, NEAR);
        expect(plan[0].seed).toBe(plan[1].seed);
        expect(plan[2].seed).toBe(plan[0].seed + 1);
        expect(plan[3].seed).toBe(plan[2].seed);
    });

    // Across two calls on purpose: a seed spent BEFORE the first kept landing
    // is invisible to any assertion made inside one call.
    it('spends no seed on an event it skips', () => {
        const before = planSpawns([hit({victim: A})], twoLayers, NEAR);
        const after = planSpawns([hit({victim: UNKNOWN}), hit({victim: B})], twoLayers, NEAR);
        expect(after[0].seed).toBe(before[0].seed + 1);
    });

    it('keeps counting across snapshots, so repeated hits alternate', () => {
        const first = planSpawns([hit({victim: A})], twoLayers, NEAR);
        const second = planSpawns([hit({victim: A})], twoLayers, NEAR);
        expect(second[0].seed).toBe(first[0].seed + 1);
    });
});

// --- C2b: ambient state and the density slider ------------------------------

describe('planAmbient', () => {
    const LAYERS: VisualLayer[] = [
        {kind: 'emitter', on: 'ambient', motion: 'rise'},
        {kind: 'orbit', on: 'ambient', count: 3},
        {kind: 'impact', on: 'hit'},
        {kind: 'emitter', on: 'fired', motion: 'burst'},
    ];

    it('holds the ambient layers and nothing else', () => {
        expect(planAmbient(LAYERS, 'full', false).map(l => l.kind)).toEqual(['emitter', 'orbit']);
    });

    // PO 2026-09-20 (§12d.1): `low` drops ambient EMITTERS for other actors,
    // and only those - an orbit still draws on everyone.
    it('keeps another actor\'s ambient orbit but drops its emitter at low', () => {
        expect(planAmbient(LAYERS, 'low', false).map(l => l.kind)).toEqual(['orbit']);
    });

    it('keeps the OWN character\'s ambient emitter at low', () => {
        expect(planAmbient(LAYERS, 'low', true).map(l => l.kind)).toEqual(['emitter', 'orbit']);
    });

    // `off` is literal (§12d.1): no authored layer draws at all.
    it('holds nothing at off, own character included', () => {
        expect(planAmbient(LAYERS, 'off', true)).toEqual([]);
        expect(planAmbient(LAYERS, 'off', false)).toEqual([]);
    });

    it('returns nothing for a skill that authors no ambient layer', () => {
        expect(planAmbient([{kind: 'impact', on: 'hit'}], 'full', true)).toEqual([]);
    });
});

describe('planSpawns: density', () => {
    const both = visuals({
        [SKILL]: [{kind: 'projectile', on: 'hit'}, {kind: 'impact', on: 'hit'}],
    });

    it('plans every layer at full and at low - only emitters thin, and by count', () => {
        expect(kinds(planSpawns([hit()], both, NEAR, 'full'))).toEqual(['projectile', 'impact']);
        expect(kinds(planSpawns([hit()], both, NEAR, 'low'))).toEqual(['projectile', 'impact']);
    });

    it('plans nothing at all at off', () => {
        expect(planSpawns([hit(), fired()], both, NEAR, 'off')).toEqual([]);
    });

    it('spends no seed on a snapshot it refused to plan', () => {
        const before = planSpawns([hit()], both, NEAR, 'full');
        planSpawns([hit(), hit({victim: B})], both, NEAR, 'off');
        const after = planSpawns([hit()], both, NEAR, 'full');
        expect(after[0].seed).toBe(before[0].seed + 1);
    });
});
