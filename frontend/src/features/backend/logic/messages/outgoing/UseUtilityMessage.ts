import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

/**
 * Press a baseline utility (plan-downtime.md C1) — Recall now, the
 * mini-campfire with C2. Free and cooldown-less by design (D7): the server's
 * interruptible cast window is the entire brake, so the message carries the
 * kind and nothing else. Kinds are the pinned UtilityKind wire enum.
 */
export class UseUtilityMessage extends ClientMessage {

    public constructor(private readonly kind: AuraApi.UtilityKind) {
        super();
    }

    public send(): void {
        AuraApi.UseUtility.startUseUtility(this.builder);
        AuraApi.UseUtility.addKind(this.builder, this.kind);
        const body = AuraApi.UseUtility.endUseUtility(this.builder);
        super.send(AuraApi.ClientMessageBody.UseUtility, body);
    }
}
