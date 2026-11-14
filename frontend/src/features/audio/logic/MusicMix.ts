/**
 * Which music track plays, and how loud each one is mid-crossfade
 * (plan-audio.md C4's forest slice, ahead of the C2 music controller). Pure:
 * no Pixi, no mp3, no clock of its own. Music.ts feeds it the track a region
 * resolved and the frame time, and plays what it says.
 *
 * Rules (archive/plan-region-audio.md): an unknown id plays the fallback and
 * warns once (D4); asking for the track already audible never restarts it
 * (D9); a crossfade takes the same time whatever its size (Ramp).
 *
 * "Silent" is the muted state: nothing plays, but the wish is kept, so
 * unmuting starts the right track from its beginning.
 */
import {advanceRamp, Ramp, ramp, rampTo} from '../../regions/logic/Ramp';

export interface MixFrame {
    /** Volume (0..1, before the music slider) of every track still audible. */
    volumes: Map<string, number>;
    /** Tracks whose fade-out finished this frame: stop them. */
    stopped: string[];
}

export class MusicMix {
    /** The track the player should hear (or would, once unmuted). */
    current: string;
    private readonly fading = new Map<string, Ramp>();
    private silent = true;
    private readonly warned = new Set<string>();

    constructor(
        private readonly known: ReadonlySet<string>,
        private readonly fallback: string,
        private readonly fadeMS: number,
        private readonly warn: (message: string) => void = console.warn,
    ) {
        this.current = fallback;
    }

    /**
     * Points the mix at a track. Returns the id to start from its beginning,
     * or null when nothing needs starting (same track, a track still fading
     * that turns around, or a silent mix).
     */
    want(resolved: string): string | null {
        const id = this.known.has(resolved) ? resolved : this.unknown(resolved);
        if (id === this.current) {
            return null;
        }
        this.current = id;
        if (this.silent) {
            return null;
        }
        this.fading.forEach((r, track) => rampTo(r, track === id ? 1 : 0));
        if (this.fading.has(id)) {
            return null;
        }
        this.fading.set(id, {...ramp(0), target: 1});
        return id;
    }

    /** Leaves silence: the current track at full volume, no fade. Returns it. */
    start(): string {
        this.silent = false;
        this.fading.clear();
        this.fading.set(this.current, ramp(1));
        return this.current;
    }

    /** Enters silence. Returns every track that was playing, to stop. */
    silence(): string[] {
        this.silent = true;
        const playing = [...this.fading.keys()];
        this.fading.clear();
        return playing;
    }

    advance(deltaMS: number): MixFrame {
        const volumes = new Map<string, number>();
        const stopped: string[] = [];
        this.fading.forEach((r, track) => {
            const value = advanceRamp(r, deltaMS, this.fadeMS);
            if (value === 0 && r.target === 0) {
                stopped.push(track);
            } else {
                volumes.set(track, value);
            }
        });
        stopped.forEach(track => this.fading.delete(track));
        return {volumes, stopped};
    }

    private unknown(resolved: string): string {
        if (!this.warned.has(resolved)) {
            this.warned.add(resolved);
            this.warn(`🎵 unknown music track "${resolved}", playing "${this.fallback}"`);
        }
        return this.fallback;
    }
}
