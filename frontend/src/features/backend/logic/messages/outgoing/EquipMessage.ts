import {AuraApi} from "../../AuraApi";
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
        AuraApi.Equip.startEquip(this.builder);
        AuraApi.Equip.addSkillId(this.builder, this.skillId);
        AuraApi.Equip.addSlot(this.builder, this.slot);
        let body = AuraApi.Equip.endEquip(this.builder);
        super.send(AuraApi.ClientMessageBody.Equip, body);
    }
}
