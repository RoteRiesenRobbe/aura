import {AuraApi} from "../../AuraApi";
import {ClientMessage} from "./ClientMessage";

/**
 * Ask to fly from the campfire you are standing at to another discovered one
 * (plan-flight-paths.md C2/C3, D2 — any discovered fire to any other, in a
 * straight line).
 *
 * ⚑ Fire-and-forget, and the refusal is SILENT (§4.4, the established
 * pattern): the server re-checks every precondition — alive, not already
 * flying, standing in the bind radius of a discovered fire, destination a
 * DIFFERENT discovered fire that resolves in the boot-frozen authored set. The
 * map is a convenience, never the authority, so nothing here may be read as a
 * permission check. Takeoff is visible only as `Character.flying` turning true
 * in the next snapshot.
 *
 * ⚑ Not a UtilityKind: utilities are argument-free presses, this one carries a
 * destination.
 */
export class StartFlightMessage extends ClientMessage {

    public constructor(private readonly destinationCampfireId: string) {
        super();
    }

    public send(): void {
        // The string offset must exist before startStartFlight — a nested
        // object cannot be built inside an open table.
        const destination = this.builder.createString(this.destinationCampfireId);
        AuraApi.StartFlight.startStartFlight(this.builder);
        AuraApi.StartFlight.addDestinationCampfireId(this.builder, destination);
        const body = AuraApi.StartFlight.endStartFlight(this.builder);
        super.send(AuraApi.ClientMessageBody.StartFlight, body);
    }
}
