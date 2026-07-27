import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

/** What the message does beyond naming an actor (chunk 3b-ii). */
export interface InteractDetail {
    /** The node a taken row belongs to. Absent = just open the conversation. */
    nodeId?: string;
    /**
     * ⚑ The AUTHORED indices the server streamed in the row (L21) — never the
     * row's position on screen. The server hides already-known rows, so the two
     * differ the moment a player has learned anything, and echoing the position
     * would teach the wrong skill.
     */
    optionIndex?: number;
    grantIndex?: number;
    /** Dismiss the panel: Leave, Escape, or a second E. */
    close?: boolean;
}

/**
 * The conversation panel's one upstream message (chunks 3b-i and 3b-ii).
 *
 * The entity id is echoed back rather than left implied so a keypress names
 * exactly what the player saw the badge on: the server refuses anything that
 * does not match the id it stamped this tick, which is what keeps the badge
 * from ever promising a conversation the server would decline.
 *
 * Three shapes: open (id alone), take a row (id + node + indices), close.
 */
export class InteractMessage extends ClientMessage {
    private readonly entityId: number;
    private readonly detail: InteractDetail;

    constructor(entityId: number, detail: InteractDetail = {}) {
        super();
        this.entityId = entityId;
        this.detail = detail;
    }

    public send(): void {
        // FlatBuffers builds inside out: the string has to exist before the
        // table that points at it is started.
        const nodeId = this.detail.nodeId
            ? this.builder.createString(this.detail.nodeId)
            : 0;

        AuraApi.Interact.startInteract(this.builder);
        AuraApi.Interact.addEntityId(this.builder, BigInt(this.entityId));
        if (nodeId !== 0) {
            AuraApi.Interact.addNodeId(this.builder, nodeId);
        }
        if (this.detail.optionIndex !== undefined) {
            AuraApi.Interact.addOptionIndex(this.builder, this.detail.optionIndex);
        }
        if (this.detail.grantIndex !== undefined) {
            AuraApi.Interact.addGrantIndex(this.builder, this.detail.grantIndex);
        }
        if (this.detail.close) {
            AuraApi.Interact.addClose(this.builder, true);
        }
        let body = AuraApi.Interact.endInteract(this.builder);
        super.send(AuraApi.ClientMessageBody.Interact, body);
    }
}
