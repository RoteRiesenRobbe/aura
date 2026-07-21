import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

export class SpendSkillPointMessage extends ClientMessage {
    private readonly skillId: number;
    private readonly unspend: boolean;

    constructor(skillId: number, unspend: boolean = false) {
        super();
        this.skillId = skillId;
        this.unspend = unspend;
    }

    public send(): void {
        AuraApi.SpendSkillPoint.startSpendSkillPoint(this.builder);
        AuraApi.SpendSkillPoint.addSkillId(this.builder, this.skillId);
        AuraApi.SpendSkillPoint.addUnspend(this.builder, this.unspend);
        let body = AuraApi.SpendSkillPoint.endSpendSkillPoint(this.builder);
        super.send(AuraApi.ClientMessageBody.SpendSkillPoint, body);
    }
}
