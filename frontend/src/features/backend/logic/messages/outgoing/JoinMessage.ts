import * as flatbuffers from "flatbuffers";
import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";
import {GameLateSetupEvent} from "../../../../core/logic/Events";

export class JoinMessage extends ClientMessage {
    playerName: string;

    constructor(playerName: string) {
        super();
        this.playerName = playerName;
    }

    private marshal(): flatbuffers.Offset {
        let playerName = this.builder.createString(this.playerName);
        AuraApi.Join.startJoin(this.builder);
        AuraApi.Join.addPlayerName(this.builder, playerName);
        return AuraApi.Join.endJoin(this.builder);
    }

    public send(): void {
        GameLateSetupEvent.subscribe(() => {
            let messageBody = this.marshal();
            super.send(AuraApi.ClientMessageBody.Join, messageBody);
        });
    }
}
