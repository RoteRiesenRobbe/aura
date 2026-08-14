// active_aura_slot wire sentinels. NOTE: -2 is a workaround for FlatBuffers
// omitting a scalar equal to its schema default (-1), which makes an explicit -1
// indistinguishable from an absent field. Twins of the backend's
// ActiveAuraSlotNoChange/ActiveAuraSlotDeactivate (model/input.go), one wire
// contract pinned on both sides by api/shared-constants.json `activeAuraSlot`
// (SharedConstants.test.ts / cmd/aurad/shared_constants_test.go). Collapse -2
// onto -1 if the schema default is ever changed and regenerated.
//
// Own module on purpose: the pin test imports these, and InputMessage.ts's
// module graph reaches webpack-only APIs that vitest cannot load.
export const NO_ACTIVE_AURA_CHANGE = -1;
export const DEACTIVATE_AURA_SLOT = -2;
