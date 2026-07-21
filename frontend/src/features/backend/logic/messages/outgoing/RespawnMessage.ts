import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";
import {GameLateSetupEvent} from "../../../../core/logic/Events";

/**
 * Respawn a dead player (atmosphere & recovery chunk 4): sent from the death
 * overlay instead of a fresh Join. The server reuses the reserved name and
 * carried progression and spawns at the campfire anchor. Empty body — the
 * message type is the whole payload.
 */
export class RespawnMessage extends ClientMessage {

    private marshal(): number {
        AuraApi.Respawn.startRespawn(this.builder);
        return AuraApi.Respawn.endRespawn(this.builder);
    }

    public send(): void {
        GameLateSetupEvent.subscribe(() => {
            let messageBody = this.marshal();
            super.send(AuraApi.ClientMessageBody.Respawn, messageBody);
        });
    }
}
