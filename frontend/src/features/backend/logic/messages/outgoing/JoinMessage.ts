import * as flatbuffers from "flatbuffers";
import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";
import {GameLateSetupEvent} from "../../../../core/logic/Events";

/**
 * Enter the world (step 8a chunk 3).
 *
 * ⚑ The PLAY TICKET is what proves who is joining. The socket carries no cookie
 * and no account id: the server exchanges the ticket for (account, character)
 * and burns it. `playerName` is legacy and ignored by the server — a fresh join
 * without a ticket is refused outright.
 *
 * ⚑ The ticket is OPAQUE. Present it; never parse it, never derive anything
 * from it, never split it across fields (plan-accounts-frontend.md §10 ②).
 */
export class JoinMessage extends ClientMessage {
    playerName: string;
    reconnectToken: string | null;
    playTicket: string | null;

    constructor(playerName: string, reconnectToken: string | null = null, playTicket: string | null = null) {
        super();
        this.playerName = playerName;
        this.reconnectToken = reconnectToken;
        this.playTicket = playTicket;
    }

    private marshal(): flatbuffers.Offset {
        let playerName = this.builder.createString(this.playerName);
        let reconnectToken = this.reconnectToken ?
            this.builder.createString(this.reconnectToken) : null;
        let playTicket = this.playTicket ?
            this.builder.createString(this.playTicket) : null;
        AuraApi.Join.startJoin(this.builder);
        AuraApi.Join.addPlayerName(this.builder, playerName);
        if (reconnectToken !== null) {
            AuraApi.Join.addReconnectToken(this.builder, reconnectToken);
        }
        if (playTicket !== null) {
            AuraApi.Join.addPlayTicket(this.builder, playTicket);
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
