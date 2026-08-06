// Mob catalog (feedback pass C item 2): per-species metadata — display name,
// combat level, tier — fetched once at startup from the aurad HTTP sidecar
// (GET /mobs), the same contract as the skill catalog. The data is per SPECIES
// and constant after boot, so it does not belong in the per-tick snapshot;
// the wire already carries `mob_id`, which is the key into this table.
//
// Until the fetch lands (or if it fails) the accessors report "unknown" and
// the nameplate simply does not render. The game never blocks on the catalog.

import {catalogUrl} from '../features/backend/logic/Urls';

// Wire `Mob.tier` rank ↔ meaning, mirroring the backend's mobs.TierRank —
// pinned on both sides by api/shared-constants.json (§35 C4c), so a renumber
// goes red instead of silently gilding the wrong mobs. A regular enum on
// purpose: the pin test enumerates its members, which a const enum forbids.
export enum TierRank {
    Normal = 0,
    Elite = 1,
    Boss = 2,
}

export interface MobDefinition {
    id: number;
    name: string;
    displayName: string;
    // Authored combat level (cL) — the nameplate tint reads its distance from
    // the local player's level.
    curveLevel: number;
    // TierRank (0 normal / 1 elite / 2 boss), same rank as the wire Mob.tier.
    tier: number;
    // Server-derived: is this species something the player fights? False for
    // fixtures (campfires, braziers), summons (companions, totems), obstacles
    // (brambles, rockfalls) and hazards — all of which are MobDefinitions but
    // must not carry a nameplate.
    combatTarget: boolean;
}

const catalog = new Map<number, MobDefinition>();

export function loadMobCatalog(): Promise<void> {
    return fetch(catalogUrl('mobs'))
        .then(response => {
            if (!response.ok) {
                throw new Error(`GET /mobs returned ${response.status}`);
            }
            return response.json();
        })
        .then((definitions: MobDefinition[]) => {
            catalog.clear();
            for (const def of definitions) {
                catalog.set(def.id, def);
            }
        })
        .catch(error => {
            console.warn('Mob catalog unavailable — mob nameplates disabled', error);
        });
}

// Fetched once at startup; the accessors below degrade gracefully until then.
loadMobCatalog();

export function mobDefinition(id: number): MobDefinition | undefined {
    return catalog.get(id);
}

// mobDisplayName resolves a species' authored name (how skill payloads
// reference mobs, e.g. spawn.mobName) to the catalog's served displayName —
// the server derives it once (skills.DeriveDisplayName) and the catalog is
// the source of truth, so the client never re-implements the naming rule
// (§35 C4a). Falls back to the raw name until the fetch lands or if it fails.
// Linear scan on purpose: called on tooltip render, over a ~64-entry catalog.
export function mobDisplayName(name: string): string {
    for (const def of catalog.values()) {
        if (def.name === name) {
            return def.displayName;
        }
    }
    return name;
}

// --- difficulty tint (decision 5: WoW-style nameplate colors) ---

// The local player's level, mirrored here by Player.updateFromBackend — the
// tint is a COMPARISON, so it needs both sides, and this module already owns
// the mob side. Defaults to 1 so a nameplate rendered before the first
// snapshot is merely wrong-by-one, never crashed.
let localPlayerLevel = 1;

export function setLocalPlayerLevel(level: number) {
    localPlayerLevel = level;
}

export function getLocalPlayerLevel(): number {
    return localPlayerLevel;
}

/**
 * The kill-XP gray knobs, shipped once per session in Welcome and installed by
 * Game.startRendering (plan-world-replacement.md C0 / plan-xp-formula.md D7).
 *
 * ⚑ NO FALLBACK PAIR ON PURPOSE. Hardcoding "5 and 6" here as a degrade path
 * would re-create the frozen second copy of the server's rule that this chunk
 * exists to delete — and the pre-Welcome window is structurally empty: the
 * Welcome handler calls startRendering before any mob plate can exist. The 0/0
 * initial value is only ever seen by a unit test, and it resolves through the
 * same guards the server uses.
 */
let grayBase = 0;
let grayStep = 0;

export function setGrayKnobs(base: number, step: number) {
    grayBase = base;
    grayStep = step;
}

/**
 * ZD(P) — how many levels below you a mob has to be before its kill pays
 * nothing. Mirrors backend curve.KillXP.GrayDistance, including its guard for
 * a non-positive step; it is deliberately the same three lines rather than an
 * approximation of them.
 */
export function grayDistance(playerLevel: number): number {
    const level = Math.max(1, playerLevel);
    if (grayStep < 1) {
        return grayBase;
    }
    return grayBase + Math.floor(level / grayStep);
}

/** The trivial tint, exported so the gray boundary can be asserted by colour. */
export const DIFFICULTY_GRAY = 0x9d9d9d;

/**
 * Difficulty bands by level difference (mob cL − player level), WoW-Classic
 * shaped: the ≈+5 band width matches the one the level curve already locks in
 * (growth 1.12, band ≈ +5), so "red" and "a band above you" mean the same thing.
 *
 * Ordered high → low; the first band whose `from` the difference reaches wins.
 * All values [PLACEHOLDER].
 *
 * ⚑ PRESENTATION ONLY — gray is NOT in this list. These four thresholds have no
 * server twin; the gray boundary does, and it is decided before them.
 */
const DIFFICULTY_BANDS: readonly { from: number, color: number }[] = [
    {from: 5, color: 0xff5555},   // deadly  — red
    {from: 3, color: 0xff9a3c},   // hard    — orange
    {from: -2, color: 0xf5d442},  // even    — yellow
    {from: -Infinity, color: 0x5fd35f}, // easy — green, down to the gray boundary
];

/**
 * The nameplate tint. Gray is DERIVED from the server's own gray distance, so
 * "gray" and "this kill pays nothing" are one rule rather than two copies of
 * one — the client used to carry a frozen −5 boundary and grayed mobs that
 * still paid, from player level 12 up.
 *
 * ⚑ Gray is decided FIRST, not folded into the band list as green's lower
 * edge. grayBase is a conf knob the PO can turn without a rebuild, and a narrow
 * band pushes the boundary up into what the list calls "even" — where a green
 * lower edge would let a yellow plate pay nothing.
 */
export function difficultyColor(mobCombatLevel: number): number {
    const difference = mobCombatLevel - localPlayerLevel;
    // `difference < 0` is not redundant: the server only ever consults the gray
    // distance on the below-you branch, so a degenerate ZD of 0 makes every mob
    // strictly below you gray — it must not also gray the at-level one.
    if (difference < 0 && difference <= -grayDistance(localPlayerLevel)) {
        return DIFFICULTY_GRAY;
    }
    for (const band of DIFFICULTY_BANDS) {
        if (difference >= band.from) {
            return band.color;
        }
    }
    return DIFFICULTY_GRAY;
}
