import {describe, expect, it} from 'vitest';
import {AuraApi} from '../../backend/logic/AuraApi';
import {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {VisualLayer} from '../../../client-data/Skills';
import {
    CHAIN_HOP_STAGGER_MS,
    contactMs,
    flightMs,
    HIT_MARK_KIND,
    STRIKE_CURVE_MS,
} from './SkillFxMath';
import {NEUTRAL_COLOR} from './SkillFxPalette';
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
//
// ⭐ Since the C3a amendment (§12g) the round mark on the victim is the
// ENGINE'S: every landed Damage or Crit hit plans one, LAST, whatever the skill
// authors, and no file may author it. The cases below that used to author an
// `impact` layer now get it from the planner, which is the whole point.

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
        phase: AuraApi.HitPhase.Direct,
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

/** A skill the catalog holds that authors no `visual` at all. */
const BARE = visuals({[SKILL]: []});

function kinds(plan: readonly SpawnPlan[]): string[] {
    return plan.map(entry => entry.def.kind);
}

function delayOf(plan: readonly SpawnPlan[], kind: string): number {
    return plan.filter(entry => entry.def.kind === kind).map(entry => entry.delayMs)[0];
}

describe('planSpawns: the automatic hit mark (§12g.1 call 2)', () => {
    it('is the name every counter reads', () => {
        expect(HIT_MARK_KIND).toBe('impact');
    });

    it('marks a Damage hit on a skill that authors no visual at all', () => {
        const plan = planSpawns([hit()], BARE, NEAR);
        expect(kinds(plan)).toEqual([HIT_MARK_KIND]);
        expect(plan[0].source).toBe(CASTER);
        expect(plan[0].from).toBe(CASTER);
        expect(plan[0].victim).toBe(A);
        expect(plan[0].delayMs).toBe(0);
        expect(plan[0].baseColor).toBe(COLOR);
    });

    it('marks a Crit exactly like a Damage hit', () => {
        expect(kinds(planSpawns([hit({kind: AuraApi.HitKind.Crit})], BARE, NEAR)))
            .toEqual([HIT_MARK_KIND]);
    });

    it('draws no mark for a Heal, an Absorb or an Immune landing', () => {
        for (const kind of [AuraApi.HitKind.Heal, AuraApi.HitKind.Absorb, AuraApi.HitKind.Immune]) {
            expect(planSpawns([hit({kind, amount: 0})], BARE, NEAR)).toEqual([]);
        }
    });

    it('draws no mark on a FIRED event: nothing was hit', () => {
        expect(planSpawns([fired()], BARE, NEAR)).toEqual([]);
    });

    it('marks a hit by a skill the catalog does not hold, in the neutral colour', () => {
        const plan = planSpawns([hit()], visuals({}), NEAR);
        expect(kinds(plan)).toEqual([HIT_MARK_KIND]);
        expect(plan[0].baseColor).toBe(NEUTRAL_COLOR);
        expect(plan[0].reachPx).toBe(0);
    });

    it('puts the mark LAST, after every authored layer', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
                {kind: 'beam', on: 'hit'},
            ],
        }), NEAR);
        expect(kinds(plan)).toEqual(['projectile', 'beam', HIT_MARK_KIND]);
    });

    it('marks each victim of a multi-target beat once', () => {
        const plan = planSpawns([hit({victim: A}), hit({victim: B})], BARE, NEAR);
        expect(plan.map(entry => entry.victim)).toEqual([A, B]);
    });

    it('is hidden at off, like every dressing (glow and numbers stay elsewhere)', () => {
        expect(planSpawns([hit()], BARE, NEAR, 'off')).toEqual([]);
    });

    it('is kept at low', () => {
        expect(kinds(planSpawns([hit()], BARE, NEAR, 'low'))).toEqual([HIT_MARK_KIND]);
    });
});

describe('planSpawns: which layers an event draws', () => {
    it('picks only the on:hit layers for a HIT event', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'beam', on: 'hit'},
                {kind: 'cast-pose', on: 'fired'},
                {kind: 'orbit', on: 'ambient'},
            ],
        }), NEAR);
        expect(kinds(plan)).toEqual(['beam', HIT_MARK_KIND]);
    });

    it('picks only the on:fired layers for a FIRED event', () => {
        const plan = planSpawns([fired()], visuals({
            [SKILL]: [
                {kind: 'beam', on: 'hit'},
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

    it('plans nothing for a FIRED event when no layer sits on that trigger', () => {
        expect(planSpawns([fired()], visuals({
            [SKILL]: [{kind: 'beam', on: 'hit'}],
        }), NEAR)).toEqual([]);
    });

    it('plans only the mark for a HIT when the skill authors fired layers alone', () => {
        expect(kinds(planSpawns([hit()], visuals({
            [SKILL]: [{kind: 'cast-pose', on: 'fired'}],
        }), NEAR))).toEqual([HIT_MARK_KIND]);
    });

    it('keeps the authored layer order and carries the skill\'s colour', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'strike', on: 'hit'},
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
            ],
        }), NEAR);
        expect(kinds(plan)).toEqual(['strike', 'projectile', HIT_MARK_KIND]);
        expect(plan.every(entry => entry.baseColor === COLOR)).toBe(true);
    });

    // An Immune or an Absorb landing still landed (§12b.3), so an authored
    // `on: hit` layer draws whatever the HitKind says; only the MARK reads it.
    it('plans an Immune landing\'s authored layers, without the mark', () => {
        const plan = planSpawns([hit({kind: AuraApi.HitKind.Immune, amount: 0})], visuals({
            [SKILL]: [{kind: 'beam', on: 'hit'}],
        }), NEAR);
        expect(kinds(plan)).toEqual(['beam']);
    });

    it('plans an Absorbed landing\'s authored layers, without the mark', () => {
        const plan = planSpawns([hit({kind: AuraApi.HitKind.Absorb, amount: 0})], visuals({
            [SKILL]: [{kind: 'beam', on: 'hit'}],
        }), NEAR);
        expect(kinds(plan)).toEqual(['beam']);
    });
});

describe('planSpawns: an entity the client does not hold', () => {
    it('skips an event whose source is unknown, without throwing', () => {
        expect(planSpawns([hit({source: UNKNOWN})], BARE, NEAR)).toEqual([]);
    });

    it('skips an event whose victim is unknown, without throwing', () => {
        expect(planSpawns([hit({victim: UNKNOWN})], BARE, NEAR)).toEqual([]);
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
        ], BARE, NEAR);
        expect(plan.map(entry => entry.victim)).toEqual([A, B]);
    });
});

describe('planSpawns: implicit sequencing', () => {
    it('starts the mark when the projectile arrives, and the bolt at once', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [{kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED}],
        }), NEAR);
        // The caster is 350 px from A: half a second at 700 px/s.
        expect(delayOf(plan, 'projectile')).toBe(0);
        expect(delayOf(plan, HIT_MARK_KIND)).toBe(flightMs(350, PROJECTILE_SPEED));
        expect(delayOf(plan, HIT_MARK_KIND)).toBe(500);
    });

    it('starts the mark at the strike\'s contact moment', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [{kind: 'strike', on: 'hit', curve: 'swing', ms: 280}],
        }), NEAR);
        expect(delayOf(plan, 'strike')).toBe(0);
        expect(delayOf(plan, HIT_MARK_KIND)).toBe(contactMs('swing', 280));
    });

    it('takes the curve\'s default ms when the strike authors none', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [{kind: 'strike', on: 'hit', curve: 'overhead'}],
        }), NEAR);
        expect(delayOf(plan, HIT_MARK_KIND)).toBe(contactMs('overhead', STRIKE_CURVE_MS.overhead));
    });

    it('waits for the LATER of a projectile and a strike', () => {
        // The bolt lands at 500 ms; the thrust touches at 0.45 x 200 = 90.
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
                {kind: 'strike', on: 'hit'},
            ],
        }), NEAR);
        expect(delayOf(plan, HIT_MARK_KIND)).toBe(flightMs(350, PROJECTILE_SPEED));

        // Now the other way round: a slow overhead outlasts a point-blank bolt.
        const slow = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: 100_000},
                {kind: 'strike', on: 'hit', curve: 'overhead', ms: 2_000},
            ],
        }), NEAR);
        expect(delayOf(slow, HIT_MARK_KIND)).toBe(contactMs('overhead', 2_000));
    });

    it('leaves every authored kind at no delay', () => {
        const plan = planSpawns([hit()], visuals({
            [SKILL]: [
                {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
                {kind: 'beam', on: 'hit'},
                {kind: 'strike', on: 'hit'},
            ],
        }), NEAR);
        expect(plan.filter(entry => entry.def.kind !== HIT_MARK_KIND).map(entry => entry.delayMs))
            .toEqual([0, 0, 0]);
    });
});

describe('planSpawns: chained beams', () => {
    const chainedLayers: VisualLayer[] = [
        {kind: 'beam', on: 'hit', chain: true},
        {kind: 'projectile', on: 'hit', speed: PROJECTILE_SPEED},
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

    it('adds each hop\'s own arrival to its mark, on top of the hop delay', () => {
        const plan = planSpawns(
            [hit({victim: C}), hit({victim: A}), hit({victim: B})], chained, CHAIN_WORLD);
        const marks = plan.filter(entry => entry.def.kind === HIT_MARK_KIND);
        expect(marks.map(entry => entry.victim)).toEqual([A, B, C]);
        // Each flight is measured from the hop's OWN anchor: caster→A is 350,
        // A→B is 490, B→C is 210.
        expect(marks.map(entry => entry.delayMs)).toEqual([
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
        expect(beams(plan).map(entry => entry.from)).toEqual([CASTER, CASTER]);
        expect(beams(plan).map(entry => entry.delayMs)).toEqual([0, 0]);
    });

    it('plans the plain landings before the chained ones', () => {
        const plan = planSpawns([
            hit({victim: A}),                      // chained, fed first
            hit({skillId: OTHER_SKILL, victim: B}), // plain, fed second
        ], visuals({
            [SKILL]: chainedLayers,
            [OTHER_SKILL]: [],
        }), NEAR);
        expect(plan[0].victim).toBe(B);
        expect(kinds(plan)).toEqual([HIT_MARK_KIND, 'beam', 'projectile', HIT_MARK_KIND]);
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
    // One authored beam plus the mark: two entries per landing.
    const twoLayers = visuals({[SKILL]: [{kind: 'beam', on: 'hit'}]});

    it('gives one landing\'s layers one seed, and the next landing the next', () => {
        const plan = planSpawns([hit({victim: A}), hit({victim: B})], twoLayers, NEAR);
        expect(plan).toHaveLength(4);
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
        {kind: 'strike', on: 'hit'},
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
        expect(planAmbient([{kind: 'strike', on: 'hit'}], 'full', true)).toEqual([]);
    });
});

describe('planSpawns: density', () => {
    const bolt = visuals({[SKILL]: [{kind: 'projectile', on: 'hit'}]});

    it('plans every layer at full and at low - only emitters thin, and by count', () => {
        expect(kinds(planSpawns([hit()], bolt, NEAR, 'full'))).toEqual(['projectile', HIT_MARK_KIND]);
        expect(kinds(planSpawns([hit()], bolt, NEAR, 'low'))).toEqual(['projectile', HIT_MARK_KIND]);
    });

    it('plans nothing at all at off', () => {
        expect(planSpawns([hit(), fired()], bolt, NEAR, 'off')).toEqual([]);
    });

    it('spends no seed on a snapshot it refused to plan', () => {
        const before = planSpawns([hit()], bolt, NEAR, 'full');
        planSpawns([hit(), hit({victim: B})], bolt, NEAR, 'off');
        const after = planSpawns([hit()], bolt, NEAR, 'full');
        expect(after[0].seed).toBe(before[0].seed + 1);
    });
});

// §12h call 1: an over-time effect draws its authored look on APPLICATION and
// on every refresh (the spit, the fireball), and its ticks "just tick there":
// the engine's mark alone. The phase is a second axis beside the HitKind.
describe('planSpawns: the over-time phase (§12h)', () => {
    /** A DoT/HoT applied or refreshed on the victim: nothing landed, amount 0. */
    function applied(overrides: Partial<SkillEventData> = {}): SkillEventData {
        return hit({phase: AuraApi.HitPhase.Applied, amount: 0, ...overrides});
    }

    /** One tick of an over-time effect landing. */
    function tick(overrides: Partial<SkillEventData> = {}): SkillEventData {
        return hit({phase: AuraApi.HitPhase.Tick, ...overrides});
    }

    /** The Giant Spider's shape: the spit on application, the fangs on the hit. */
    const SPIDER = visuals({
        [SKILL]: [
            {kind: 'projectile', on: 'applied', speed: PROJECTILE_SPEED},
            {kind: 'strike', on: 'hit', curve: 'bite'},
        ],
    });

    it('plans only the on:applied layers for an application, and no mark', () => {
        const plan = planSpawns([applied()], SPIDER, NEAR);
        expect(kinds(plan)).toEqual(['projectile']);
        expect(plan[0].from).toBe(CASTER);
        expect(plan[0].victim).toBe(A);
        expect(plan[0].delayMs).toBe(0);
    });

    it('draws no mark on an application whatever its kind', () => {
        for (const kind of [AuraApi.HitKind.Damage, AuraApi.HitKind.Crit, AuraApi.HitKind.Heal]) {
            expect(kinds(planSpawns([applied({kind})], SPIDER, NEAR))).toEqual(['projectile']);
        }
    });

    it('plans the mark ALONE for a Damage tick, never an on:hit layer', () => {
        const plan = planSpawns([tick()], SPIDER, NEAR);
        expect(kinds(plan)).toEqual([HIT_MARK_KIND]);
        expect(plan[0].victim).toBe(A);
        expect(plan[0].delayMs).toBe(0);
    });

    it('plans the mark alone for a Crit tick', () => {
        expect(kinds(planSpawns([tick({kind: AuraApi.HitKind.Crit})], SPIDER, NEAR)))
            .toEqual([HIT_MARK_KIND]);
    });

    it('plans nothing for a Heal, an Absorb or an Immune tick', () => {
        const hot = visuals({[SKILL]: [
            {kind: 'emitter', on: 'hit'},
            {kind: 'emitter', on: 'applied'},
        ]});
        for (const kind of [AuraApi.HitKind.Heal, AuraApi.HitKind.Absorb, AuraApi.HitKind.Immune]) {
            expect(planSpawns([tick({kind})], hot, NEAR)).toEqual([]);
        }
    });

    it('draws a direct hit and an application of one skill in one snapshot once each', () => {
        const plan = planSpawns([hit(), applied()], SPIDER, NEAR);
        expect(kinds(plan).sort()).toEqual([HIT_MARK_KIND, 'projectile', 'strike'].sort());
        // The mark belongs to the fangs, not to the spit that landed nothing.
        expect(delayOf(plan, HIT_MARK_KIND))
            .toBe(contactMs('bite', STRIKE_CURVE_MS.bite));
    });

    it('plans nothing for an application of a skill the catalog does not hold', () => {
        expect(planSpawns([applied()], visuals({}), NEAR)).toEqual([]);
    });

    it('plans nothing for an application when the skill authors no on:applied layer', () => {
        expect(planSpawns([applied()], visuals({[SKILL]: [{kind: 'beam', on: 'hit'}]}), NEAR))
            .toEqual([]);
    });

    it('draws ONE on:applied cast-pose per cast, like a hit', () => {
        const poses = visuals({[SKILL]: [
            {kind: 'cast-pose', on: 'applied'},
            {kind: 'projectile', on: 'applied', speed: PROJECTILE_SPEED},
        ]});
        const plan = planSpawns([applied({victim: A}), applied({victim: B})], poses, NEAR);
        expect(kinds(plan).filter(k => k === 'cast-pose')).toHaveLength(1);
        expect(kinds(plan).filter(k => k === 'projectile')).toHaveLength(2);
        expect(plan.find(entry => entry.def.kind === 'cast-pose').victim).toBe(A);
    });

    it('keeps an on:hit pose and an on:applied pose of one skill apart', () => {
        const poses = visuals({[SKILL]: [
            {kind: 'cast-pose', on: 'hit'},
            {kind: 'cast-pose', on: 'applied'},
        ]});
        const plan = planSpawns([hit(), applied()], poses, NEAR);
        expect(plan.filter(entry => entry.def.kind === 'cast-pose').map(entry => entry.def.on).sort())
            .toEqual(['applied', 'hit']);
    });

    it('chains on:applied beams among themselves, never with the direct hits', () => {
        const both = visuals({[SKILL]: [
            {kind: 'beam', on: 'hit', chain: true},
            {kind: 'beam', on: 'applied', chain: true},
        ]});
        const plan = planSpawns(
            [hit({victim: A}), hit({victim: B}), applied({victim: A}), applied({victim: B})],
            both, CHAIN_WORLD);
        for (const on of ['hit', 'applied']) {
            const beams = plan.filter(entry => entry.def.kind === 'beam' && entry.def.on === on);
            expect(beams.map(entry => [entry.from, entry.victim])).toEqual([[CASTER, A], [A, B]]);
            expect(beams.map(entry => entry.delayMs)).toEqual([0, CHAIN_HOP_STAGGER_MS]);
        }
    });
});
