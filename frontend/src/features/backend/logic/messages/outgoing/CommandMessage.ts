import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

export class CommandMessage extends ClientMessage {
    private readonly command: string;
    private readonly token: string;

    constructor(command: string, token: string) {
        super();
        this.command = command;
        this.token = token;
    }

    public send(): void {
        let commandString = this.builder.createString(this.command);
        let tokenString = this.builder.createString(this.token);
        AuraApi.Cheat.startCheat(this.builder);
        AuraApi.Cheat.addCommand(this.builder, commandString);
        AuraApi.Cheat.addToken(this.builder, tokenString);
        let body = AuraApi.Cheat.endCheat(this.builder);
        super.send(AuraApi.ClientMessageBody.Cheat, body);
    }
}