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
 * Difficulty bands by level difference (mob cL − player level), WoW-Classic
 * shaped: the ≈+5 band width matches the one the level curve already locks in
 * (growth 1.12, band ≈ +5), so "red" and "a band above you" mean the same thing.
 *
 * Ordered high → low; the first band whose `from` the difference reaches wins.
 * All values [PLACEHOLDER].
 */
const DIFFICULTY_BANDS: readonly { from: number, color: number }[] = [
    {from: 5, color: 0xff5555},   // deadly  — red
    {from: 3, color: 0xff9a3c},   // hard    — orange
    {from: -2, color: 0xf5d442},  // even    — yellow
    {from: -5, color: 0x5fd35f},  // easy    — green
    {from: -Infinity, color: 0x9d9d9d}, // trivial — gray
];

export function difficultyColor(mobCombatLevel: number): number {
    const difference = mobCombatLevel - localPlayerLevel;
    for (const band of DIFFICULTY_BANDS) {
        if (difference >= band.from) {
            return band.color;
        }
    }
    return DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1].color;
}
