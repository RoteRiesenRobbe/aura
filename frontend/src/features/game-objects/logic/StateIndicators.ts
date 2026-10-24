import {Container, Graphics, Sprite} from 'pixi.js';
import {OVERHEAD_BAR_BACKDROP} from '../../../client-data/Theme';
import {packIconTexture} from '../../../client-data/icons/PackIconFiles';
import {StateRow, TokenState, indicatorDiameter, indicatorOffset, indicatorRadius} from './TokenState';

/** Width of the dark backing rim that keeps a disc readable on any ground (the pips' rim). */
const RIM_WIDTH = 1.5;

/**
 * The state indicators of one medallion (plan-entity-presentation.md D4): each
 * live indicator at its row's reserved angle on the circle just outside the
 * ring, as its glyph when the pack has it, else as a disc in the row's colour
 * on the dark rim the pip strip used. One child per indicator, labelled with
 * the row's id, so a harness reads positions off the scene graph.
 *
 * Redrawn on a state change only, never per frame; no filter (D4). It lives in
 * the token's `indicators` slot, outside `actualShape` (D3, L1).
 */
export class StateIndicators {
    readonly container: Container = new Container({label: 'stateIndicators'});

    private readonly radius: number;
    private readonly diameter: number;
    // Snapshots repeat the mask 30×/s; redraw only when the state changes.
    private drawnMask = 0;
    private drawnDead = false;

    constructor(size: number) {
        this.radius = indicatorRadius(size);
        this.diameter = indicatorDiameter(size);
        this.container.visible = false;
    }

    setState(state: TokenState) {
        if (state.mask === this.drawnMask && state.dead === this.drawnDead) {
            return;
        }
        this.drawnMask = state.mask;
        this.drawnDead = state.dead;

        for (const child of this.container.removeChildren()) {
            child.destroy();
        }
        for (const row of state.indicators) {
            const indicator = this.draw(row);
            indicator.label = row.id;
            const {x, y} = indicatorOffset(row.angle, this.radius);
            indicator.position.set(x, y);
            this.container.addChild(indicator);
        }
        this.container.visible = state.indicators.length > 0;
    }

    private draw(row: StateRow): Container {
        const texture = row.glyph ? packIconTexture(row.glyph.packIcon) : null;
        if (texture) {
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.width = this.diameter;
            sprite.height = this.diameter;
            return sprite;
        }
        const r = this.diameter / 2;
        return new Graphics()
            .circle(0, 0, r)
            .fill(OVERHEAD_BAR_BACKDROP)
            .circle(0, 0, r - RIM_WIDTH)
            .fill({color: row.colour, alpha: 0.95});
    }
}
