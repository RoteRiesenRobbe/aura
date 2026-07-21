import * as flatbuffers from "flatbuffers";
import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";
import {GameLateSetupEvent} from "../../../../core/logic/Events";

export class JoinMessage extends ClientMessage {
    playerName: string;
    reconnectToken: string | null;

    constructor(playerName: string, reconnectToken: string | null = null) {
        super();
        this.playerName = playerName;
        this.reconnectToken = reconnectToken;
    }

    private marshal(): flatbuffers.Offset {
        let playerName = this.builder.createString(this.playerName);
        let reconnectToken = this.reconnectToken ?
            this.builder.createString(this.reconnectToken) : null;
        AuraApi.Join.startJoin(this.builder);
        AuraApi.Join.addPlayerName(this.builder, playerName);
        if (reconnectToken !== null) {
            AuraApi.Join.addReconnectToken(this.builder, reconnectToken);
        }
        return AuraApi.Join.endJoin(this.builder);
    }

    public send(): void {
        GameLateSetupEvent.subscribe(() => {
            let messageBody = this.marshal();
            super.send(AuraApi.ClientMessageBody.Join, messageBody);
        });
    }
}
