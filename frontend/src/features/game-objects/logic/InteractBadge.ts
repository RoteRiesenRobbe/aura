import * as PIXI from 'pixi.js';
import {aboveTokenY} from './PlateAnchors';

/**
 * The interact prompt (plan-entity-model.md chunk 3b-i, D12): a small key cap
 * floating over an actor the server says this player can talk to right now.
 *
 * Driven purely by GameState.interactable_entity_id, never by a client-side
 * distance test — so the badge can never promise a conversation the server
 * would refuse. The server validates an incoming Interact against the exact
 * value it used to light this up.
 *
 * It hangs on the mob's PLATE, the unfiltered overlay its name and quest glyph
 * share (PO 2026-10-19: under the mob's shape a tree or a roof covered it). The
 * plate mirrors the mob's alpha and hides while the mob stands in unlit
 * darkness, so the prompt still fades and vanishes with the NPC it labels.
 *
 * ⚑ The vertical anchor reads the sprite's rendered bounds, never the wire
 * radius: mob sprite classes size from GraphicsConfig and ignore Mob.radius,
 * while the merged NPCs size from the wire — a permanently-unwritten radius is
 * exactly how chunk 3a's invisible Farmer happened (L19).
 *
 * ⚑ ATTACHED to the mob's plate, MEASURED against its art alone (R4).
 * The two are different containers on purpose: the group also carries the aura
 * ring stack, the dwell ring and the health bar, so
 * measuring it anchors the cap to whichever decoration happens to be widest.
 * Measuring the group was correct only by accident — all 14 conversants author
 * `"skills": []`, so the ring graphic stays invisible and Pixi skips it, and
 * the health bar hangs BELOW the mob where it never reached the top edge. Give
 * a conversant an aura (the teaching guard that fights bandits) and the cap
 * would park one aura radius above its head, permanently, since build() runs
 * once.
 */

// Key cap geometry, in px. [PLACEHOLDER — no keybinding UI exists yet, so the
// label is the hardcoded default bind.]
const LABEL = 'E';
const PADDING_X = 6;
const PADDING_Y = 3;
const CORNER_RADIUS = 4;
const GAP_ABOVE_SPRITE = 10;
const FILL_COLOR = 0x1c1c1c;
const FILL_ALPHA = 0.82;
const BORDER_COLOR = 0xf2e6c8;
const TEXT_COLOR = 0xf2e6c8;
const FONT_SIZE = 13;

export class InteractBadge {
    private container: PIXI.Container = null;
    // Horizontal offset from the mob's origin: 0 alone, beside a quest giver's
    // `!` when the two share the row (plan-quest-giver-markers.md C3).
    private offsetX = 0;

    /**
     * @param parent the container the cap is drawn into — the mob's plate,
     *               above every prop, fading and hiding with the mob
     * @param sprite the mob's art alone, the thing the cap is anchored above
     * @param clearance px above the art the cap also stays clear of: the
     *                  medallion's state indicators (plan-entity-presentation.md
     *                  D8), 0 for a plain object
     */
    constructor(private readonly parent: PIXI.Container,
                private readonly sprite: PIXI.Container,
                private readonly clearance: number) {
    }

    /**
     * Show or hide the prompt. Called every snapshot with the answer to "is
     * this the entity the server named", so it must be cheap when nothing
     * changed — hence the visible-flag early return rather than a rebuild.
     */
    setVisible(visible: boolean) {
        if (!visible) {
            if (this.container !== null) {
                this.container.visible = false;
            }
            return;
        }
        if (this.container === null) {
            this.build();
        }
        this.container.visible = true;
    }

    /**
     * The cap's width while it shows, 0 while hidden, so a quest giver's `!`
     * can share its row (plan-quest-giver-markers.md C3).
     */
    shownWidth(): number {
        if (this.container === null || !this.container.visible) {
            return 0;
        }
        return this.container.width;
    }

    /** Shift the cap sideways from the mob's centre (0 = centred). */
    setOffsetX(x: number) {
        this.offsetX = x;
        if (this.container !== null) {
            this.container.x = x;
        }
    }

    destroy() {
        if (this.container === null) {
            return;
        }
        this.container.destroy({children: true});
        this.container = null;
    }

    private build() {
        this.container = new PIXI.Container();

        const text = new PIXI.Text({
            text: LABEL,
            style: new PIXI.TextStyle({
                fontFamily: 'monospace',
                fontSize: FONT_SIZE,
                fontWeight: 'bold',
                fill: TEXT_COLOR,
            }),
        });
        text.anchor.set(0.5);

        const capWidth = text.width + PADDING_X * 2;
        const capHeight = text.height + PADDING_Y * 2;

        const cap = new PIXI.Graphics()
            .roundRect(-capWidth / 2, -capHeight / 2, capWidth, capHeight, CORNER_RADIUS)
            .fill({color: FILL_COLOR, alpha: FILL_ALPHA})
            .stroke({width: 1, color: BORDER_COLOR, alpha: 0.9});

        this.container.addChild(cap);
        this.container.addChild(text);
        this.container.x = this.offsetX;
        this.container.y = aboveTokenY(this.spriteTopOffset(), this.clearance) - capHeight / 2 - GAP_ABOVE_SPRITE;

        this.parent.addChild(this.container);
    }

    // How far the sprite's TOP edge sits above its origin, measured — never
    // derived from an authored or wire size (L19), and never from the shape
    // group, whose bounds include every overlay hung on the mob (R4).
    //
    // ⚑ Read `bounds.y`, not `height / 2`. A mob's art is not centred on its
    // origin: the Farmer measures y −73.5 with height 115.5, so half-height is
    // 16 px short of the top and the cap lands on the NPC's face instead of
    // above its head. Measured in-game, not reasoned about.
    private spriteTopOffset(): number {
        const bounds = this.sprite.getLocalBounds();
        return Math.max(0, -bounds.y);
    }
}
