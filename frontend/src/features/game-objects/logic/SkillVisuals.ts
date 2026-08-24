import {Container, Graphics, Ticker} from 'pixi.js';
import {GameObject} from './_GameObject';
import {Character} from './Character';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {
    flakeCount,
    flightMs,
    projectilePoint,
    snowflake,
    strikePhase,
    visualStyleFor,
    withinReach,
} from './SkillVisualsMath';

/**
 * Per-skill hit/field visuals - PROTOTYPE (branch prototype/skill-visuals).
 * The own player's active aura gets a dressing beyond the ring: an ambient
 * ice field, a sword thrust at the victim of a hit tick, or a fireball/frost
 * bolt that flies to the victim with the damage number deferred to impact.
 *
 * ⚑ OWN PLAYER ONLY, and client-only. Attribution is the §57 inference
 * mirrored outbound: the own beat landed this snapshot (Player.ts runs before
 * the entity loop in Backend.receiveSnapshot, so the flag is set in the same
 * synchronous pass) + the victim is inside own reach + damage landed on it.
 * Known blind spot, shared with the attack-lines prototype: a second damage
 * source hitting the same victim in the same tick draws a strike for damage
 * that was not ours - exactly the case §39's per-hit source field exists for.
 *
 * ⚑ PLACEHOLDER ART. Graphics primitives, no assets - the aura-hit slash/fire
 * standing. Deliberately cheap to delete: two files (+ math tests) and three
 * call sites (Game.ts layer, Player.ts note, EntityManager damage site).
 */

// World-space layer for strikes and projectiles, below layers.darkness (the
// §6.5 rule: dark areas stay dark - a fireball must not be the first thing
// to light a tunnel).
let layer: Container = null;

let ownChar: Character = null;
let ownSkillId = 0;
let ownRadiusPx = 0;
// Armed by the own beat, consumed by the entity loop of the SAME snapshot;
// the next Player note (next snapshot) rewrites it.
let beatArmed = false;

let field: IceFieldFx = null;

// Prototype diagnostics: why hits do or do not draw. Read by the
// skill-visuals-proto harness via window.__skillFxStats; costs nothing real.
const stats = {
    beats: 0, notes: 0, claims: 0,
    rejNoBeat: 0, rejCharacter: 0, rejStyle: 0, rejReach: 0,
    // Beat-stream diagnostics for the starved-leg mystery: snapshots with the
    // aura cadence on/off, and how often the (skill, radius) pair changed.
    auraOnSnaps: 0, auraOffSnaps: 0, streamChanges: 0,
};
let lastStream = '';
if (typeof window !== 'undefined') {
    (window as any).__skillFxStats = stats;
}

export function setup(fxLayer: Container) {
    layer = fxLayer;
}

/**
 * Death/leave teardown, called from Player.remove(). Without it the armed
 * beat outlives the player: noteOwnAura only runs while the game is PLAYING,
 * but the entity loop keeps processing damage - a death on a beat tick would
 * leave claims firing from the corpse position until respawn.
 */
export function reset() {
    beatArmed = false;
    ownChar = null;
    ownSkillId = 0;
    ownRadiusPx = 0;
    field?.stop();
    field = null;
}

/**
 * One call per snapshot from Player.updateFromBackend, AFTER the beat
 * detection. Also drives the ambient field: it exists while the active skill
 * maps to a field style and the aura projects a radius (0 = gated/off).
 */
export function noteOwnAura(
    character: Character, activeSkillId: number, auraRadiusPx: number, beatLanded: boolean,
) {
    ownChar = character;
    ownSkillId = activeSkillId;
    ownRadiusPx = auraRadiusPx;
    beatArmed = beatLanded;
    if (beatLanded) stats.beats++;
    if (auraRadiusPx > 0) stats.auraOnSnaps++; else stats.auraOffSnaps++;
    const stream = activeSkillId + ':' + (auraRadiusPx > 0 ? 'on' : 'off');
    if (stream !== lastStream) {
        stats.streamChanges++;
        lastStream = stream;
    }

    const wantField = visualStyleFor(activeSkillId) === 'field-ice' && auraRadiusPx > 0;
    if (wantField) {
        if (field === null || !field.isOn(character)) {
            field?.stop();
            field = new IceFieldFx(character);
        }
        field.setRadius(auraRadiusPx);
    } else if (field !== null) {
        field.stop();
        field = null;
    }
}

/**
 * Called from EntityManager at the damage-number site for every entity with
 * damage this tick. Returns whether this hit was claimed as the own player's
 * (the caller then suppresses the default victim slash) and how long to defer
 * the damage number (projectiles: until visual impact; the wire-driven HP bar
 * still drops at the tick - that desync is the experiment).
 */
export function noteEntityDamaged(
    victim: GameObject, damageTaken: number,
): { claimed: boolean, delayMs: number } {
    const none = {claimed: false, delayMs: 0};
    if (!(damageTaken > 0)) {
        return none;
    }
    stats.notes++;
    if (!beatArmed || layer === null || ownChar === null) {
        stats.rejNoBeat++;
        return none;
    }
    // No PvP: the own aura never damages another player, so a Character victim
    // is always someone else's damage (their mob fight) - never claim it.
    if (victim instanceof Character) {
        stats.rejCharacter++;
        return none;
    }
    const style = visualStyleFor(ownSkillId);
    if (style === null || style === 'field-ice') {
        // Field skills keep the default victim slash - the field is ambient.
        stats.rejStyle++;
        return none;
    }
    const from = ownChar.shape.position;
    const to = victim.shape.position;
    if (!withinReach(to.x - from.x, to.y - from.y, ownRadiusPx, victim.size)) {
        stats.rejReach++;
        return none;
    }
    stats.claims++;
    if (style === 'strike-sword') {
        spawnStrike(from.x, from.y, to.x, to.y, victim.size);
        return {claimed: true, delayMs: 0};
    }
    // projectile-fire | projectile-frost
    const delayMs = spawnProjectile(victim, style === 'projectile-frost');
    return {claimed: true, delayMs};
}

// --- Sword strike -----------------------------------------------------------

const BLADE_COLOR = 0xd8dde4;
const BLADE_EDGE = 0xffffff;
const HILT_COLOR = 0x8a5a2b;

function spawnStrike(fromX: number, fromY: number, toX: number, toY: number, victimRadiusPx: number) {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const bladeLen = Math.max(40, dist - victimRadiusPx * 0.3);

    const c = createNamedContainer('skillFxStrike');
    c.position.set(fromX, fromY);
    c.rotation = Math.atan2(toY - fromY, toX - fromX);

    // Blade along +x with a bright edge, crossguard + grip near the hand.
    const w = Math.max(4, bladeLen * 0.05);
    const g = new Graphics()
        .poly([12, -w, bladeLen - w * 2.2, -w * 0.8, bladeLen, 0, bladeLen - w * 2.2, w * 0.8, 12, w])
        .fill({color: BLADE_COLOR, alpha: 0.95})
        .moveTo(14, 0).lineTo(bladeLen - 2, 0)
        .stroke({color: BLADE_EDGE, width: Math.max(1.5, w * 0.35), alpha: 0.9})
        .rect(8, -w * 2.4, 5, w * 4.8)
        .fill({color: HILT_COLOR})
        .rect(-4, -w * 0.9, 12, w * 1.8)
        .fill({color: HILT_COLOR});
    c.addChild(g);
    layer.addChild(c);

    const start = performance.now();
    const animate = () => {
        if (c.destroyed) {
            Ticker.shared.remove(animate);
            return;
        }
        const phase = strikePhase(performance.now() - start);
        if (phase.done) {
            Ticker.shared.remove(animate);
            layer.removeChild(c);
            c.destroy({children: true});
            return;
        }
        c.scale.x = phase.extend;
        c.alpha = phase.alpha;
    };
    Ticker.shared.add(animate);
    animate();
}

// --- Projectiles ------------------------------------------------------------

const FIRE_CORE = 0xfff1a8;
const FIRE_MID = 0xff8c1a;
const FIRE_OUTER = 0xff3b1a;
const FROST_CORE = 0xf2fbff;
const FROST_MID = 0x9fd8ff;
const FROST_OUTER = 0xb08cff;

/** Spawns the bolt; returns its flight time (the damage-number deferral). */
function spawnProjectile(victim: GameObject, frost: boolean): number {
    const from = {x: ownChar.shape.position.x, y: ownChar.shape.position.y};
    let lastTarget = {x: victim.shape.position.x, y: victim.shape.position.y};
    const ms = flightMs(Math.hypot(lastTarget.x - from.x, lastTarget.y - from.y));

    const c = createNamedContainer('skillFxProjectile');
    const r = 13;
    const g = new Graphics()
        .circle(0, 0, r)
        .fill({color: frost ? FROST_OUTER : FIRE_OUTER, alpha: 0.45})
        .circle(0, 0, r * 0.7)
        .fill({color: frost ? FROST_MID : FIRE_MID, alpha: 0.85})
        .circle(0, 0, r * 0.38)
        .fill({color: frost ? FROST_CORE : FIRE_CORE, alpha: 0.95});
    c.addChild(g);
    c.position.set(from.x, from.y);
    layer.addChild(c);

    const start = performance.now();
    const animate = () => {
        if (c.destroyed) {
            Ticker.shared.remove(animate);
            return;
        }
        // Track the victim while it still exists (its shape outlives removal
        // through the corpse fade); freeze on the last known point otherwise.
        const shape = victim.shape;
        if (shape && !shape.destroyed) {
            lastTarget = {x: shape.position.x, y: shape.position.y};
        }
        const elapsed = performance.now() - start;
        const t = elapsed / ms;
        if (t >= 1) {
            Ticker.shared.remove(animate);
            layer.removeChild(c);
            c.destroy({children: true});
            spawnImpact(lastTarget.x, lastTarget.y, frost);
            return;
        }
        const p = projectilePoint(from.x, from.y, lastTarget.x, lastTarget.y, t);
        c.position.set(p.x, p.y);
        // Flicker: a cheap deterministic pulse, no per-frame redraw.
        c.scale.set(1 + 0.12 * Math.sin(elapsed / 28));
    };
    Ticker.shared.add(animate);
    animate();
    return ms;
}

const IMPACT_MS = 220;

function spawnImpact(x: number, y: number, frost: boolean) {
    const c = createNamedContainer('skillFxImpact');
    const g = new Graphics()
        .circle(0, 0, 16)
        .fill({color: frost ? FROST_MID : FIRE_MID, alpha: 0.5})
        .circle(0, 0, 20)
        .stroke({color: frost ? FROST_CORE : FIRE_CORE, width: 3, alpha: 0.9});
    c.addChild(g);
    c.position.set(x, y);
    layer.addChild(c);

    const start = performance.now();
    const animate = () => {
        if (c.destroyed) {
            Ticker.shared.remove(animate);
            return;
        }
        const t = (performance.now() - start) / IMPACT_MS;
        if (t >= 1) {
            Ticker.shared.remove(animate);
            layer.removeChild(c);
            c.destroy({children: true});
            return;
        }
        c.scale.set(1 + t * 1.4);
        c.alpha = 1 - t;
    };
    Ticker.shared.add(animate);
}

// --- Ice field --------------------------------------------------------------

const FLAKE_COLOR = 0xcfe8ff;
const FLAKE_CORE = 0xffffff;

/**
 * Snowflakes drifting inside the own aura ring, parented to the character's
 * shape so it follows for free (and stays under layers.darkness with it).
 * The AscensionChannelFx idiom: ticker-driven, torn down by stop() or by the
 * character being destroyed/hidden underneath it.
 */
class IceFieldFx {
    private root: Container = null;
    private flakes: Graphics[] = [];
    private radiusPx = 0;
    private readonly startedAtMs = performance.now();

    constructor(private readonly character: Character) {
        this.root = createNamedContainer('skillFxIceField');
        character.shape.addChild(this.root);
        Ticker.shared.add(this.animate, this);
    }

    isOn(character: Character): boolean {
        return this.character === character;
    }

    setRadius(radiusPx: number) {
        if (Math.abs(radiusPx - this.radiusPx) < 2) {
            return;
        }
        this.radiusPx = radiusPx;
        this.rebuildFlakes();
    }

    stop() {
        Ticker.shared.remove(this.animate, this);
        if (this.root !== null && !this.root.destroyed) {
            this.root.parent?.removeChild(this.root);
            this.root.destroy({children: true});
        }
        this.root = null;
        this.flakes = [];
    }

    private rebuildFlakes() {
        if (this.root === null || this.root.destroyed) {
            return;
        }
        this.root.removeChildren().forEach(ch => ch.destroy());
        this.flakes = [];
        const count = flakeCount(this.radiusPx);
        for (let i = 0; i < count; i++) {
            // A six-armed asterisk with a bright core - cheap, reads as snow.
            const g = new Graphics();
            for (let arm = 0; arm < 3; arm++) {
                const a = (arm / 3) * Math.PI;
                g.moveTo(Math.cos(a) * -4, Math.sin(a) * -4)
                    .lineTo(Math.cos(a) * 4, Math.sin(a) * 4);
            }
            g.stroke({color: FLAKE_COLOR, width: 1.5, alpha: 0.9});
            g.circle(0, 0, 1.2).fill({color: FLAKE_CORE, alpha: 0.95});
            this.flakes.push(g);
            this.root.addChild(g);
        }
    }

    // The teardown-under-us check is the AscensionChannelFx idiom: the own
    // character is rebuilt on death/respawn, and the stale field must not
    // outlive its parent or leak its ticker callback.
    private animate = () => {
        if (this.root === null || this.root.destroyed || this.character.shape.destroyed) {
            this.stop();
            return;
        }
        const elapsed = performance.now() - this.startedAtMs;
        for (let i = 0; i < this.flakes.length; i++) {
            const f = snowflake(i, elapsed, this.radiusPx);
            const flake = this.flakes[i];
            flake.position.set(f.x, f.y);
            flake.alpha = f.alpha;
            flake.scale.set(f.scale);
        }
    };
}
