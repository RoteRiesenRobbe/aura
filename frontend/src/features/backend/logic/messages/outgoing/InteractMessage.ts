import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

/**
 * Open a conversation with the actor the server told us is in range
 * (plan-entity-model.md chunk 3b-i).
 *
 * The entity id is echoed back rather than left implied so a keypress names
 * exactly what the player saw the badge on: the server refuses anything that
 * does not match the id it stamped this tick, which is what keeps the badge
 * from ever promising a conversation the server would decline.
 */
export class InteractMessage extends ClientMessage {
    private readonly entityId: number;

    constructor(entityId: number) {
        super();
        this.entityId = entityId;
    }

    public send(): void {
        AuraApi.Interact.startInteract(this.builder);
        AuraApi.Interact.addEntityId(this.builder, BigInt(this.entityId));
        let body = AuraApi.Interact.endInteract(this.builder);
        super.send(AuraApi.ClientMessageBody.Interact, body);
    }
}
