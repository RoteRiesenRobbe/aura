import {BerryhunterApi} from "../../BerryhunterApi";
import {ClientMessage} from "./ClientMessage";

export class EquipMessage extends ClientMessage {
    private readonly skillId: number;
    private readonly slot: number;

    constructor(skillId: number, slot: number) {
        super();
        this.skillId = skillId;
        this.slot = slot;
    }

    public send(): void {
        BerryhunterApi.Equip.startEquip(this.builder);
        BerryhunterApi.Equip.addSkillId(this.builder, this.skillId);
        BerryhunterApi.Equip.addSlot(this.builder, this.slot);
        let body = BerryhunterApi.Equip.endEquip(this.builder);
        super.send(BerryhunterApi.ClientMessageBody.Equip, body);
    }
}
