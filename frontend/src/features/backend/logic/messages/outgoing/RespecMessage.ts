import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

/**
 * Reset the whole spellbook to level 1, refunding every spent point in one
 * step (round-7 item 8). Free — the per-level unspend always was — but
 * atomic. Empty body: the message type is the whole payload. The server
 * rejects it while in combat (the equip-lock precedent), and the HUD
 * short-circuits that case with the usual banner before sending.
 */
export class RespecMessage extends ClientMessage {

    public send(): void {
        AuraApi.Respec.startRespec(this.builder);
        const body = AuraApi.Respec.endRespec(this.builder);
        super.send(AuraApi.ClientMessageBody.Respec, body);
    }
}
