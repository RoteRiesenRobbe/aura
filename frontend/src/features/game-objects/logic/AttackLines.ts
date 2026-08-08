import {Container, Graphics} from 'pixi.js';
import {GameObject} from './_GameObject';
import {AuraCategoryBit, AURA_CATEGORY_COLORS} from './AuraRings';
import {GameSetupEvent, PrerenderEvent} from '../../core/logic/Events';
import {IGame} from '../../core/logic/IGame';

/**
 * PROTOTYPE — attack attribution (backlog §57), client-only, ZERO WIRE.
 *
 * Draws a short-lived line from every mob that is plausibly hitting a character
 * to that character, so the source of incoming damage is readable in a
 * multi-mob fight.
 *
 * ⚑ THIS IS NOT SHIPPABLE, BY CONSTRUCTION. The wire carries no per-hit source
 * (`Character.damage_taken` is a per-tick AGGREGATE), so attribution here is
 * INFERRED: on a damage tick we draw a line from every mob whose damage/dot
 * aura currently reaches the victim. With two mobs on you, both get a line
 * whether or not both hit — which is precisely the case attribution exists for.
 * Good enough to feel out the visual; disqualifying for shipping. The real
 * version is a §39 consumer with a per-hit source id on the wire.
 *
 * Deliberately self-contained so it reverts cleanly: one file, plus one
 * addChild in Game.ts, two cached fields on Mob, and one noteHit call at each
 * of the two existing damage-number sites (EntityManager + Player).
 */

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

/** How long one hit line lingers, in ms. [PLACEHOLDER] */
const LINE_LIFETIME_MS = 450;
/** Line thickness in px. [PLACEHOLDER] */
const LINE_WIDTH_PX = 3;
/** Peak opacity, at the moment of the hit. [PLACEHOLDER] */
const LINE_ALPHA = 0.85;
/**
 * Containment grace on the attacker's aura reach. Client positions are
 * interpolated ~66 ms behind the server (the buffered-interp tradeoff), and a
 * mob that just landed a hit may already have drifted a hair out of range on
 * screen. [PLACEHOLDER]
 */
const REACH_GRACE = 1.15;
/** The categories that count as "attacking" — direct damage and dots. */
const ATTACK_CATEGORIES = AuraCategoryBit.Damage | AuraCategoryBit.Dot;

interface HitLine {
    victim: GameObject;
    attacker: GameObject;
    /** Elapsed lifetime in ms. */
    age: number;
}

const lines: HitLine[] = [];

export const container: Container = new Container();
container.label = 'attackLines';

const graphics = new Graphics();
container.addChild(graphics);

/**
 * Record a damage tick on `victim` and open a line from every mob currently
 * reaching it. Called from the two places that already detect a damage tick.
 */
export function noteHit(victim: GameObject) {
    if (Game === null || Game.map === null) {
        return;
    }
    Game.map.getObjectsInView().forEach((candidate: GameObject) => {
        if (candidate === victim || !isAttacking(candidate, victim)) {
            return;
        }
        // Refresh an existing line rather than stacking a second one: contact
        // damage arrives every tick while a mob stays in range.
        const existing = lines.find((line) => line.victim === victim && line.attacker === candidate);
        if (existing) {
            existing.age = 0;
            return;
        }
        lines.push({victim, attacker: candidate, age: 0});
    });
}

/**
 * Is this candidate a mob whose damaging aura reaches the victim right now?
 *
 * Both conditions matter: the wire sends radius 0 while a mob's aura is gated
 * (un-aggroed), which is exactly "not attacking", and the category mask is what
 * keeps a healer's or a slower's aura from drawing an attack line.
 */
function isAttacking(candidate: GameObject, victim: GameObject): boolean {
    const reach = candidate['attackReachPx'];
    const categories = candidate['attackCategoryMask'];
    if (!reach || reach <= 0 || !categories || (categories & ATTACK_CATEGORIES) === 0) {
        return false;
    }
    const dx = victim.shape.position.x - candidate.shape.position.x;
    const dy = victim.shape.position.y - candidate.shape.position.y;
    const limit = reach * REACH_GRACE;
    return dx * dx + dy * dy <= limit * limit;
}

// Driven off the existing per-frame event rather than a second Ticker hook, so
// the whole overlay is one file plus one addChild.
PrerenderEvent.subscribe((deltaMS: number) => update(deltaMS));

/** Per-frame redraw: age every line out, draw the survivors at LIVE positions. */
function update(deltaMS: number) {
    if (lines.length === 0) {
        if (graphics.visible) {
            graphics.clear();
            graphics.visible = false;
        }
        return;
    }
    graphics.visible = true;
    graphics.clear();
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        line.age += deltaMS;
        if (line.age >= LINE_LIFETIME_MS) {
            lines.splice(i, 1);
            continue;
        }
        // An entity that left the viewport is removed from its layer (its
        // shape survives, so reading the position is safe) — drop the line
        // rather than draw one to a sprite nobody can see.
        if (line.attacker.shape.parent === null || line.victim.shape.parent === null) {
            lines.splice(i, 1);
            continue;
        }
        // Live positions, not a snapshot: over 450 ms both ends move, and a
        // line anchored to stale points visibly detaches from its mob.
        const fade = 1 - line.age / LINE_LIFETIME_MS;
        graphics
            .moveTo(line.attacker.shape.position.x, line.attacker.shape.position.y)
            .lineTo(line.victim.shape.position.x, line.victim.shape.position.y)
            .stroke({
                width: LINE_WIDTH_PX,
                color: AURA_CATEGORY_COLORS.damage,
                alpha: LINE_ALPHA * fade,
            });
    }
}
