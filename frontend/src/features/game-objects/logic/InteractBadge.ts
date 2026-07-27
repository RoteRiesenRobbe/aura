import * as PIXI from 'pixi.js';

/**
 * The interact prompt (plan-entity-model.md chunk 3b-i, D12): a small key cap
 * floating over an actor the server says this player can talk to right now.
 *
 * Driven purely by GameState.interactable_entity_id, never by a client-side
 * distance test — so the badge can never promise a conversation the server
 * would refuse. The server validates an incoming Interact against the exact
 * value it used to light this up.
 *
 * It hangs off the mob's own shape, the AuraTickIndicator pattern, rather than
 * the unfiltered nameplate overlay: a prompt should dim and vanish with the NPC
 * it labels when the light does, whereas a nameplate deliberately stays legible
 * above the darkness layer and pays for that with an explicit isHidden test.
 *
 * ⚑ The vertical anchor reads the parent's rendered bounds, never the wire
 * radius: mob sprite classes size from GraphicsConfig and ignore Mob.radius,
 * while the merged NPCs size from the wire — a permanently-unwritten radius is
 * exactly how chunk 3a's invisible Farmer happened (L19).
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

    constructor(private readonly parent: PIXI.Container) {
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
        this.container.y = -(this.spriteTopOffset() + capHeight / 2 + GAP_ABOVE_SPRITE);

        this.parent.addChild(this.container);
    }

    // How far the parent's TOP edge sits above its origin, measured — never
    // derived from an authored or wire size (L19).
    //
    // ⚑ Read `bounds.y`, not `height / 2`. A mob's shape is not centred on its
    // origin: the Farmer measures y −73.5 with height 115.5, so half-height is
    // 16 px short of the top and the cap lands on the NPC's face instead of
    // above its head. Measured in-game, not reasoned about.
    private spriteTopOffset(): number {
        const bounds = this.parent.getLocalBounds();
        return Math.max(0, -bounds.y);
    }
}
