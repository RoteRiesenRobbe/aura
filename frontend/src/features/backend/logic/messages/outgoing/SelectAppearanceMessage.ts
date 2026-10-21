import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

/**
 * Wear a portrait and a ring (plan-appearance.md C4), as catalog wire values
 * (Appearance.wireOf). Free and allowed any time (D11).
 *
 * ⚑ Fire-and-forget, and the refusal is SILENT (the established pattern): the
 * server checks both against what the character may wear. The change is
 * visible only as the own Character's portrait/ring in the next snapshot.
 */
export class SelectAppearanceMessage extends ClientMessage {

    public constructor(private readonly portrait: number, private readonly ring: number) {
        super();
    }

    public send(): void {
        AuraApi.SelectAppearance.startSelectAppearance(this.builder);
        AuraApi.SelectAppearance.addPortrait(this.builder, this.portrait);
        AuraApi.SelectAppearance.addRing(this.builder, this.ring);
        const body = AuraApi.SelectAppearance.endSelectAppearance(this.builder);
        super.send(AuraApi.ClientMessageBody.SelectAppearance, body);
    }
}
