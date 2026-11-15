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

    // `camp` = the campfire tab's reset (plan-campfire-traits R21): it lowers
    // every campfire trait to its floor and touches no skill; the plain reset
    // skips traits.
    constructor(private readonly camp: boolean = false) {
        super();
    }

    public send(): void {
        AuraApi.Respec.startRespec(this.builder);
        AuraApi.Respec.addCamp(this.builder, this.camp);
        const body = AuraApi.Respec.endRespec(this.builder);
        super.send(AuraApi.ClientMessageBody.Respec, body);
    }
}
