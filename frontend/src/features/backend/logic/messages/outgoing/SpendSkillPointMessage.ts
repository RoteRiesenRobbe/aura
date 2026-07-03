import {BerryhunterApi} from "../../BerryhunterApi";
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
        BerryhunterApi.SpendSkillPoint.startSpendSkillPoint(this.builder);
        BerryhunterApi.SpendSkillPoint.addSkillId(this.builder, this.skillId);
        BerryhunterApi.SpendSkillPoint.addUnspend(this.builder, this.unspend);
        let body = BerryhunterApi.SpendSkillPoint.endSpendSkillPoint(this.builder);
        super.send(BerryhunterApi.ClientMessageBody.SpendSkillPoint, body);
    }
}
