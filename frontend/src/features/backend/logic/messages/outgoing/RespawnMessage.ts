import {BerryhunterApi} from "../../BerryhunterApi";
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
        BerryhunterApi.Respawn.startRespawn(this.builder);
        return BerryhunterApi.Respawn.endRespawn(this.builder);
    }

    public send(): void {
        GameLateSetupEvent.subscribe(() => {
            let messageBody = this.marshal();
            super.send(BerryhunterApi.ClientMessageBody.Respawn, messageBody);
        });
    }
}
