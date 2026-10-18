import {Container} from 'pixi.js';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';

/**
 * The label of the TOKEN container (plan-natural-weapons.md §3.2, PO ruling
 * D9): the portrait and its frames, as one node under `shape`, so a lunge
 * moves the whole medallion and nothing hung beside it.
 */
export const TOKEN_LABEL = 'token';

/** The label of the token's frame slot, which `Mobs.ts`'s `withBorder` finds. */
export const FRAME_LABEL = 'frame';

/**
 * The named slots of a token entity's `shape` (Mob and Character), so every
 * overlay goes into a slot by name rather than at a child index
 * (plan-appearance.md C0a, plan-entity-medallions.md §5.2). Draw order, bottom
 * to top:
 *
 *   belowArt   aura ring stack, then the campfire's dwell ring
 *   token      the slot the medallion plan calls `art`; the only node a lunge
 *              moves. Inside it: `disc` (the plain disc behind a medallion
 *              portrait, plan-appearance.md C1b; C2 tints it by stance), then
 *              actualShape (the portrait; the damage flash scales and floods
 *              this alone, M-§5.1), then `frame` (the medallion ring, tinted
 *              by tier, or a fixture's or summon's border).
 *   aboveArt   overhead health bar and interact badge (Mob; a Character's bar
 *              rides its plate), ascension channel effect (Character)
 *
 * The burst ring (`showBurstRing`) still appends to `shape` itself, above all
 * three: it is the base class's and spans every entity kind.
 */
export interface TokenSlots {
    belowArt: Container;
    token: Container;
    disc: Container;
    actualShape: Container;
    frame: Container;
    aboveArt: Container;
}

export function createTokenSlots(group: Container, portrait: Container): TokenSlots {
    const belowArt = createNamedContainer('belowArt');
    const token = createNamedContainer(TOKEN_LABEL);
    const disc = createNamedContainer('disc');
    const actualShape = createNamedContainer('actualShape');
    const frame = createNamedContainer(FRAME_LABEL);
    const aboveArt = createNamedContainer('aboveArt');
    actualShape.addChild(portrait);
    token.addChild(disc, actualShape, frame);
    group.addChild(belowArt, token, aboveArt);
    return {belowArt, token, disc, actualShape, frame, aboveArt};
}
