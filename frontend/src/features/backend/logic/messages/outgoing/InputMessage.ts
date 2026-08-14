import {radians} from "../../../../common/logic/Types";
import {Vector} from "../../../../core/logic/Vector";
import {AuraApi} from "../../AuraApi";
import * as flatbuffers from "flatbuffers";
import {ClientMessage} from "./ClientMessage";
import * as BackendConstants from "../../BackendConstants";
import {isDefined} from "../../../../common/logic/Utils";
import * as SnapshotFactory from "../../SnapshotFactory";
import {Develop} from "../../../../internal-tools/develop/logic/_Develop";

import {NO_ACTIVE_AURA_CHANGE} from './ActiveAuraSlot';

export class InputMessage extends ClientMessage {
    rotation: radians = undefined;
    movement: Vector = null;
    activeAuraSlot: number = NO_ACTIVE_AURA_CHANGE;
    // cooldown slot indices to activate this tick (hotkey or panel click)
    cooldownActivations: number[] = [];
    tick: number;

    private marshal(): flatbuffers.Offset {
        // Vectors must be built before startInput (FlatBuffers rule).
        let cooldownActivations: flatbuffers.Offset = null;
        if (this.cooldownActivations.length > 0) {
            cooldownActivations = AuraApi.Input.createCooldownActivationsVector(this.builder, this.cooldownActivations);
        }

        AuraApi.Input.startInput(this.builder);

        if (this.movement !== null) {
            AuraApi.Input.addMovement(this.builder,
                AuraApi.Vec2f.createVec2f(this.builder, this.movement.x, this.movement.y));
        }

        if (isDefined(this.rotation)) {
            AuraApi.Input.addRotation(this.builder, this.rotation);
        }

        // Marshal any real command: slot index (>= 0) or the -2 deactivate sentinel.
        // The default -1 ("no change") stays omitted so it reads as absent on the wire.
        if (this.activeAuraSlot !== NO_ACTIVE_AURA_CHANGE) {
            AuraApi.Input.addActiveAuraSlot(this.builder, this.activeAuraSlot);
        }

        if (cooldownActivations !== null) {
            AuraApi.Input.addCooldownActivations(this.builder, cooldownActivations);
        }

        AuraApi.Input.addTick(this.builder, BigInt(this.tick));

        return AuraApi.Input.endInput(this.builder);
    }

    public send(): void {
        if (!SnapshotFactory.hasSnapshot()) {
            // If the backend hasn't send a snapshot yet, don't send any input.
            return;
        }

        this.tick = SnapshotFactory.getLastGameState().tick + 1;

        if (Develop.isActive()) {
            Develop.get().logClientTick(this);
        }

        let messageBody = this.marshal();
        super.send(AuraApi.ClientMessageBody.Input, messageBody);
    }
}
