// The cooldown slots' sweep progress (UI pass C5). The icon-only bar draws a
// running conic-gradient wedge over a slot that is on cooldown, and a wedge
// needs a FRACTION - but the wire carries only the ticks that are left, never
// the length the cooldown started at.
//
// Deriving the length from the catalog (cooldownTicks + cooldownTicksPerLevel)
// would couple the bar to a formula the server can modify at runtime (haste,
// per-level retunes) and would drift the moment it does. So the bar remembers
// instead: the largest remaining it has seen since this slot's cooldown began
// IS the length, by definition, and the memory resets whenever the cooldown
// ends or the slot changes hands.
//
// Pure and DOM-free on purpose - this is the chunk's one honest unit surface.

/** Per-slot memory: the peak remaining of the running cooldown, and whose it is. */
export interface SweepMemory {
    [slot: number]: { peak: number; skillId: number };
}

export function createSweepMemory(): SweepMemory {
    return {};
}

/**
 * The fraction of `slot`'s cooldown still to run, 0..1 (0 = ready to press).
 *
 * ⚑ Two resets, both load-bearing: a cooldown that reaches 0, and a slot whose
 * skill changed. Without the second, re-equipping over a running cooldown would
 * keep measuring against the old skill's length and draw a wedge that never
 * reaches full.
 *
 * @param memory   the caller's persistent memory (one per bar)
 * @param slot     slot index
 * @param skillId  the skill the slot holds right now (0 = empty)
 * @param remaining remaining ticks from the snapshot
 */
export function sweepFraction(
    memory: SweepMemory, slot: number, skillId: number, remaining: number): number {

    if (!(remaining > 0)) {
        delete memory[slot];
        return 0;
    }

    const seen = memory[slot];
    // A fresh cooldown, a re-equip, or a server value that ROSE above what we
    // had recorded (a re-trigger inside the same episode) all re-baseline: the
    // value in hand is the new length.
    if (!seen || seen.skillId !== skillId || remaining > seen.peak) {
        memory[slot] = {peak: remaining, skillId};
        return 1;
    }

    return Math.min(Math.max(remaining / seen.peak, 0), 1);
}
