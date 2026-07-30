import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

/**
 * The journal panel's one upstream message (plan-quests.md chunk C3, D13):
 * abandon a running quest.
 *
 * The server validates it on its own merits — is this quest running for this
 * player — and refuses silently, so a stale click costs nothing. Nothing is
 * hidden locally in response: the quest disappears from the panel because it
 * left the next snapshot's ledger, never because the client decided it had.
 * That is the same state-driven rule the conversation panel follows.
 */
export class AbandonQuestMessage extends ClientMessage {
    private readonly questId: string;

    constructor(questId: string) {
        super();
        this.questId = questId;
    }

    public send(): void {
        // FlatBuffers builds inside out: the string exists before the table.
        const questId = this.builder.createString(this.questId);

        AuraApi.AbandonQuest.startAbandonQuest(this.builder);
        AuraApi.AbandonQuest.addQuestId(this.builder, questId);
        const body = AuraApi.AbandonQuest.endAbandonQuest(this.builder);
        super.send(AuraApi.ClientMessageBody.AbandonQuest, body);
    }
}
