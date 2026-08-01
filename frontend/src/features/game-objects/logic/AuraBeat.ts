// Aura beat detection (N5, plan-feel-pass-2.md §5 / D3): the client is never
// told a tick landed — it receives aura_tick_interval + aura_tick_phase per
// snapshot and infers the beat from the phase wrap.
//
// ⚑ The trap that makes this a class instead of a comparison: the server
// RESETS the tick accumulator on an aura switch, so the phase can drop
// mid-cycle exactly like a wrap. A pulse fired on that reset re-introduces
// the switch stutter the tick indicator's baseline alpha was added to bury
// (C2 PO finding 2026-07-17). So a beat only counts within the SAME stream —
// same active skill (the key), same effective interval, with a prior
// observation. Any stream change (switch, haste re-scaling the interval,
// deactivation) reseeds silently: a missed pulse degrades gracefully, a
// spurious one reads as broken.
export class BeatDetector {
    private key = 0;
    private interval = 0;
    private phase = -1; // -1 = no prior observation in this stream

    /**
     * Feed one snapshot's beat fields; returns true when a tick landed
     * between the previous observation and this one.
     *
     * @param key stream identity — the active skill id where the wire carries
     *            one (characters), 0 otherwise (mobs never re-equip)
     * @param interval effective tick interval in game ticks, 0 = no active aura
     * @param phase game ticks since the last tick landed
     */
    observe(key: number, interval: number, phase: number): boolean {
        const sameStream = key === this.key && interval === this.interval && this.phase >= 0;
        const landed = sameStream && interval > 0 && phase < this.phase;
        this.key = key;
        this.interval = interval;
        this.phase = interval > 0 ? phase : -1;
        return landed;
    }
}
