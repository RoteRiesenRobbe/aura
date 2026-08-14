// The wire-driven setter surface (plan-code-health.md C5): the narrow
// interfaces EntityManager dispatches GameState fields through. They replace
// the old `gameObject['setLevel']`-style string probes, whose failure mode was
// silent — a rename left every guard false and the feature dead with no
// compile error and no test.
//
// The contract runs in both directions: Character/Mob/Campfire `implements`
// these (rename a class method → error at the clause), and EntityManager
// reaches the members through typed dot access on a `Partial<...>` cast
// (rename an interface member → TS2339 at the call site). The runtime
// `isFunction` guards stay: props, corpses and DebugCircle implement none of
// this, and that is what the guards are for.
//
// Members are deliberately REQUIRED, not optional — `implements` gives no
// rename error for an optional member (the Badgeable style is a consumer-side
// structural type, a different tool).

export interface OverheadVitals {   // Character, Mob
    setHealth(health: number, maxHealth: number): void;
    setShield(shieldHp: number, maxHealth: number): void;
    setAppliedEffects(mask: number): void;
}

export interface AuraDisplay {      // Character, Mob (Campfire overrides setAuraRadius)
    setAuraCategories(mask: number): void;
    setAuraRadius(radiusPx: number): void;
    // The widest shape: Character keys its beat detection on the active skill
    // id; Mob's 2-param implementation is assignable and ignores the third
    // argument, exactly as it did under the string probe.
    setAuraTick(interval: number, phase: number, activeSkillId?: number): boolean;
}

// One interface for both meanings on purpose — same signature, and the wire
// treats them as one dispatch (Character: wire level; Mob: effective level of
// this placement, plan-mob-levels.md C2).
export interface LevelDisplay {
    setLevel(level: number): void;
}

export interface MobPlate {         // Mob
    setMobId(mobId: number): void;
    setTier(rank: number): void;
}

export interface DwellRing {        // Campfire
    setDwellRadius(radiusPx: number): void;
}

export interface Interactable {     // Mob
    setInteractable(interactable: boolean): void;
}
