/**
 * The medallion's ring (plan-appearance.md C1, plan-entity-medallions.md §3
 * layer 4 `Token_BorderStyle`): every combat target and NPC is drawn as its
 * portrait inside a ring, and the ring's art FAMILY is keyed on the species'
 * faction (M-D9, M-D10), which the /mobs catalog ships.
 *
 * The faction -> family map is art direction, not game data, so it lives here
 * and not in api/. Membership and count are the art budget call at C0b
 * (M-§12.2); until then the families are the borders that already existed,
 * mapped so that nothing which wore one changes look [PLACEHOLDER].
 */

import {TierRank} from './Mobs';
// The enum file directly, not the AuraApi barrel (the Skills.ts precedent).
import {Stance} from '../../../api/schema/js/aura-api/stance';

// One ring per family, drawn over the portrait at the entity's size. All four
// share the 256 x 256 canvas the borders were drawn on. A ring is GREYSCALE
// art, because the tier recolours it with a tint (ringTint), and a tint only
// multiplies: brown art tinted gold reads as mud. The three coloured borders
// are wrapped in a desaturating SVG until greyscale art lands at C0b
// [PLACEHOLDER].
export const RING_FAMILY_FILES = {
    // The plain ring, and the fallback for everything without a family
    // (PO 2026-10-17: "a default greyish boring fallback for everything").
    // Already grey, so it needs no wrapper.
    grey: require('../features/game-objects/assets/border/npcBorder.png'),
    forest: require('../features/game-objects/assets/border/greyscale/forestBorder.svg'),
    leather: require('../features/game-objects/assets/border/greyscale/leatherBorder_01.svg'),
    leatherClaws: require('../features/game-objects/assets/border/greyscale/leatherBorder_02.svg'),
};

export type RingFamily = keyof typeof RING_FAMILY_FILES;

export const FALLBACK_FAMILY: RingFamily = 'grey';

// Faction name (api/factions) -> ring family. A faction left out draws the
// grey fallback, which is why cult, dragonkin, fey, mercenary, undead and
// townsfolk are absent. A key that names no faction is a typo: the pin in
// Medallions.test.ts fails it.
export const FACTION_FAMILIES: { readonly [faction: string]: RingFamily } = {
    wildlife_predator: 'forest',
    wildlife_prey: 'forest',
    spider: 'forest',
    elemental: 'forest',
    troll: 'forest',
    bandit: 'leather',
    kobold: 'leather',
    orc: 'leatherClaws',
};

// The tier recolours the ring (PO 2026-10-17, replacing the separate tier rim
// of M-D12/M-D16): a hand-drawn ring has no room for an extra line, so its
// colour carries the tier. Normal a dark grey, elite silver, boss gold
// [PLACEHOLDER shades]. A tint only multiplies, so silver at white is as
// bright as the art itself is: lighter ring art is the only way past it.
const RING_TINTS: { readonly [rank: number]: number } = {
    [TierRank.Normal]: 0x707070,
    [TierRank.Elite]: 0xffffff,
    [TierRank.Boss]: 0xffd040,
};

// The disc behind every medallion portrait (plan-appearance.md C1b) shows the
// mob's stance toward the player side (C2, D29): hostile red, neutral yellow,
// friendly blue [PLACEHOLDER shades]. The pack busts are transparent (D31), so
// the disc is what fills the ring's window around them.
const STANCE_TINTS: { readonly [stance: number]: number } = {
    [Stance.Hostile]: 0xc0392b,
    [Stance.Neutral]: 0xd4a017,
    [Stance.Friendly]: 0x2e6fd8,
};

/** The ring's tint for a wire tier rank; an unknown rank reads as normal. */
export function ringTint(rank: number): number {
    return RING_TINTS[rank] ?? RING_TINTS[TierRank.Normal];
}

/** The disc's tint for a wire stance; an unknown stance reads as neutral. */
export function stanceTint(stance: number): number {
    return STANCE_TINTS[stance] ?? STANCE_TINTS[Stance.Neutral];
}

/**
 * A species' medallion spec, the `medallion` key beside `file` in
 * Graphics.ts. Its PRESENCE is what makes a species wear a medallion
 * (M-D14 as ruled for C1); the pin in Medallions.test.ts holds every combat
 * target and conversant to it, objects excepted.
 */
export interface MedallionSpec {
    // A ring family of this species' own, replacing its faction's (D23): a
    // named NPC's unique ring is a family of one in RING_FAMILY_FILES.
    ring?: RingFamily;
}

/**
 * The ring a species wears: its own (D23), else its faction's, else grey.
 * C3 gives the player a ring through the same `ring` key (D20).
 */
export function ringFamily(spec: MedallionSpec, faction: string | undefined): RingFamily {
    return spec.ring ?? FACTION_FAMILIES[faction ?? ''] ?? FALLBACK_FAMILY;
}

/**
 * Resolves a mob's ring once per species id, and keeps trying while the /mobs
 * catalog does not know the species yet (M-§5.5): the wire re-sends the id
 * every tick, so a lookup that missed is simply made again on the next one.
 */
export class RingResolver {
    private resolvedFor = 0;

    constructor(private readonly spec: MedallionSpec) {
    }

    /**
     * The family to draw for `mobId`, or undefined when there is nothing new
     * to draw: the species is unknown so far, or its ring is already drawn.
     */
    resolve(mobId: number, definition: { faction: string } | undefined): RingFamily | undefined {
        if (mobId === this.resolvedFor || definition === undefined) {
            return undefined;
        }
        this.resolvedFor = mobId;
        return ringFamily(this.spec, definition.faction);
    }

    /** Undo the last resolve, so the next tick tries again (a texture not loaded yet). */
    forget() {
        this.resolvedFor = 0;
    }
}
