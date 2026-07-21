import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

export class ChatMessage extends ClientMessage {
    private readonly message: string;

    constructor(message: string) {
        super();
        this.message = message;
    }

    public send(): void {
        let messageString = this.builder.createString(this.message);
        AuraApi.ChatMessage.startChatMessage( this.builder);
        AuraApi.ChatMessage.addMessage( this.builder, messageString);
        let body = AuraApi.ChatMessage.endChatMessage( this.builder);
        super.send(AuraApi.ClientMessageBody.ChatMessage, body);
    }
}