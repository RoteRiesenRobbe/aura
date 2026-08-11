import {Container, Graphics, Ticker} from 'pixi.js';
import {
    flashStrength,
    haloAlpha,
    MOTE_COUNT,
    moteAlpha,
    motePosition,
} from './AscensionChannelMath';

/**
 * The ascension ceremony's channel effect (plan-ascension.md follow-up ②):
 * motes spiral inward and accelerate as the ten-second channel completes, then
 * a flash as it lands. The panel that started the ceremony is already gone —
 * the server closes it the tick the channel begins — so this is the only thing
 * on screen besides the cast bar.
 *
 * ⚑ OWN PLAYER ONLY, and not by choice of this file: the wire's cast fields are
 * own-player-only by documented design (server.fbs "other clients do NOT see
 * casts"), so nobody else sees the ceremony. Making it a shared moment is a
 * broadcast field and a backlog §39 conversation, not a change here.
 *
 * ⚑ PLACEHOLDER ART. Graphics primitives, no assets, no atlas — the same
 * standing of the aura-hit slash/fire it borrows its ticker idiom from. It is
 * deliberately cheap to delete: this file, AscensionChannelMath, one method on
 * Character and one line in Backend, with nothing else referring to it. That is
 * the right trade until §39's entity-presentation rework says what a durable
 * per-effect overlay looks like.
 */

// Warm and pale rather than the aura palette's reds: ascension is a positive
// framing (D4), and nothing else on a character glows this colour.
const MOTE_HALO = 0xffd98a;
const MOTE_CORE = 0xfff6d8;
const FLASH_COLOR = 0xfff4e0;

export class AscensionChannelFx {
    private root: Container = null;
    private motes: Graphics[] = [];
    private halo: Graphics = null;
    private flash: Graphics = null;

    private progress = 0;
    private sizePx = 0;
    private startedAtMs = 0;
    private running = false;

    constructor(private readonly parent: Container) {
    }

    /**
     * One call per snapshot. `active` false tears the effect down, which is
     * both endings: the ceremony completing and the player walking away from
     * it. Nothing here can tell those apart, and nothing needs to — the flash
     * belongs to the last stretch of PROGRESS, not to the teardown.
     */
    update(active: boolean, progress: number, sizePx: number) {
        this.progress = progress;
        this.sizePx = sizePx;
        if (!active) {
            this.stop();
            return;
        }
        if (!this.running) {
            this.start();
        }
    }

    /** Drop everything. Safe to call when nothing is running. */
    stop() {
        if (!this.running) {
            return;
        }
        this.running = false;
        Ticker.shared.remove(this.animate, this);
        if (this.root !== null && !this.root.destroyed) {
            this.parent.removeChild(this.root);
            this.root.destroy({children: true});
        }
        this.root = null;
        this.motes = [];
        this.halo = null;
        this.flash = null;
    }

    private start() {
        this.running = true;
        this.startedAtMs = performance.now();

        const root = new Container();
        const s = this.sizePx;

        // Under everything: the character's own glow, so the ceremony reads in
        // its first seconds too, while the swarm is still three widths out.
        this.halo = new Graphics()
            .circle(0, 0, s * 1.5)
            .fill({color: MOTE_HALO, alpha: 0.5})
            .circle(0, 0, s * 0.95)
            .fill({color: FLASH_COLOR, alpha: 0.5});
        this.halo.alpha = 0;
        root.addChild(this.halo);

        this.flash = new Graphics()
            .circle(0, 0, s)
            .fill({color: FLASH_COLOR, alpha: 0.55});
        this.flash.alpha = 0;
        root.addChild(this.flash);

        // ⚑ Sized generously on purpose. The first pass drew a 2 px core on a
        // ~17 px character and the harness screenshot showed a ceremony that
        // looked like dust on the lens.
        this.motes = [];
        for (let i = 0; i < MOTE_COUNT; i++) {
            const g = new Graphics()
                .circle(0, 0, s * 0.5)
                .fill({color: MOTE_HALO, alpha: 0.3})
                .circle(0, 0, s * 0.22)
                .fill({color: MOTE_CORE, alpha: 0.95});
            this.motes.push(g);
            root.addChild(g);
        }

        this.root = root;
        this.parent.addChild(root);
        Ticker.shared.add(this.animate, this);
        this.animate();
    }

    // Per frame, because the swarm's spin is time-driven and a snapshot-driven
    // effect would step at the server's rate. ⚑ The destroyed check is the
    // teardown path when the character goes away underneath us (the character
    // IS removed at the end of a completed ceremony) — the aura-hit VFX idiom
    // in _GameObject, and the reason this never leaks a ticker callback.
    private animate = () => {
        if (this.root === null || this.root.destroyed) {
            this.stop();
            return;
        }
        const elapsedMs = performance.now() - this.startedAtMs;
        const alpha = moteAlpha(this.progress);
        for (let i = 0; i < this.motes.length; i++) {
            const {x, y} = motePosition(i, this.motes.length, this.progress, elapsedMs, this.sizePx);
            const mote = this.motes[i];
            mote.position.set(x, y);
            mote.alpha = alpha;
        }
        this.halo.alpha = haloAlpha(this.progress, elapsedMs);
        const f = flashStrength(this.progress);
        this.flash.alpha = f;
        this.flash.scale.set(0.3 + f * 2.2);
    };
}
