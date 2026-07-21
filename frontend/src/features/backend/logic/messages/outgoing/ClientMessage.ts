"use strict";

import * as flatbuffers from 'flatbuffers';
import {AuraApi} from '../../AuraApi';
import {IBackend} from "../../IBackend";
import {BackendSetupEvent} from "../../../../core/logic/Events";

export class ClientMessage {
    // TODO dafuq is that
    static webSocket: WebSocket = null;

    protected builder: flatbuffers.Builder;

    constructor(initialBuilderSize: number = 10) {
        this.builder = new flatbuffers.Builder(initialBuilderSize);
    }

    private finish() {
        this.builder.finish(AuraApi.ClientMessage.endClientMessage(this.builder));
        return this.builder.asUint8Array();
    }

    private sendThroughWebsocket(): void {
        if (ClientMessage.webSocket == null ||
            ClientMessage.webSocket.readyState !== WebSocket.OPEN) {
            // Websocket is not open (yet), ignore sending
            return;
        }

        ClientMessage.webSocket.send(this.finish());
    }

    public send(type: AuraApi.ClientMessageBody, body: flatbuffers.Offset) {
        AuraApi.ClientMessage.startClientMessage(this.builder);
        AuraApi.ClientMessage.addBodyType(this.builder, type);
        AuraApi.ClientMessage.addBody(this.builder, body);

        this.sendThroughWebsocket();
    }
}

BackendSetupEvent.subscribe((backend: IBackend) => {
    ClientMessage.webSocket = backend.webSocket;
});
