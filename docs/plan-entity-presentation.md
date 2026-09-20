# Plan: Entity presentation rework - one frame that says what is happening to an actor

> **Status: SCOPE CAPTURED 2026-08-24 (folded out of backlog §39; that entry
> now points here) · nothing designed, nothing built · owes its own design
> session.** Ordering PO-ruled 2026-08-24: **`plan-entity-medallions.md`
> executes FIRST** (at least through its C1/C2 geometry and stance chunks);
> this plan's design session runs against the ratified token, not against the
> current six loose overlays. See §4.
>
> ⚑ The backlog number **§39 stays the citation anchor**: many docs and two
> other backlog sections cite "§39" by number, and the backlog entry remains
> as a pointer here. New references should name this doc.
>
> ⚑ **AMENDED 2026-09-11 by `plan-skill-vfx.md`** (PO-ruled): the per-hit
> SOURCE on the wire (§6 items 3, 4, 10) and the per-effect presentation ART
> the §3 moratorium forbade now live THERE, as a `SkillEvent` vector and a
> seven-kind visual vocabulary. What §3 keeps: no new independently-anchored
> overlay on the sprite (the VFX layer is world-space, attached to nothing).
> Durations, stacks, cast progress, the stun/slow split and the medallion
> ordering are untouched and still this doc's. §3 and §6 were **rewritten
> 2026-09-19** by that plan's C0.

---

## 1. Origin

PO ruling 2026-07-29, in the open-questions sweep. Raised by
`plan-faction-flips.md` §8 question 3 (*does the charm pip show duration?*)
and deliberately answered wider than the question asked:

> *"we will need a full design of mob and player frontend presentation that
> includes information like currently active buffs, debuffs, durations,
> allegiance, faction, cast bars etc. So for now, the pip can stay, but this
> will need a full and comprehensive rework."*

What the pip question exposed: a calmed or charmed wolf shows **a dot, and
nothing else**. `AppliedEffect*` bits ride the wire and `EffectPips` draws one
coloured mark per bit, which answers "something is on this mob" and nothing
more. With a 59.4 s charm, *time remaining* is the single most useful fact
about the mob and there is nowhere to put it. Bolting a countdown onto the pip
would have been yet another overlay invented per-feature.

## 2. Scope

One design pass covering, for both mobs and the player:

- active **buffs and debuffs, with durations** (the charm/calm case)
- **allegiance**: is this thing on my side right now? Charm made that a
  runtime property, not a species fact. ⚑ The *disc-tint slice* of this is
  already claimed by `plan-entity-medallions.md` D11/C2 (see §5).
- **faction**: the skill tooltip names factions since `2fffe9ee`; the entity
  itself does not
- **cast bars**: nothing in the engine has one today
- and by implication the existing overlays the frame would absorb or anchor:
  nameplate, tier frame, health bar, `AuraRings`, `EffectPips`,
  `AuraTickIndicator`, `InteractBadge`

## 3. Why this is a design pass and not a UI ticket

1. **Most of this is not on the wire.** Effect *bits* are; remaining ticks,
   stack counts, the source of an effect, and cast progress are not. The
   schema cost is the real cost, and it wants doing **once**, bundled (the
   same argument backlog §38 makes for the per-spawn level field).
2. **The overlays grew one per feature.** Six independently-anchored things
   sit over one sprite, and R4 already found the interact badge's anchor
   breaks the moment a conversant carries an aura (`plan-entity-model.md`
   §10b). A frame makes anchoring one decision instead of six.
3. **It is the natural consumer of the Actor model.** Role and capabilities
   are authored now; the presentation layer still infers what to draw from
   whichever fields happen to be non-zero, the same defect the entity model
   fixed server-side.

Until this plan runs, the standing moratorium holds, in the one form it kept
after `plan-skill-vfx.md` took the art half (PO-ruled 2026-09-11, written in
2026-09-19): **no new independently-anchored overlay on the sprite.** That is
the objection item 2 above records, and it is the whole of the rule now.

Per-effect and per-skill VFX are no longer forbidden and no longer queue here:
they are `plan-skill-vfx.md`'s, which meets this rule by construction (one
world-space container attached to no sprite, §7.1 there). A presentation ask
belongs here when it wants a new thing ANCHORED to an actor, or a fact that is
not on the wire (durations, stacks, cast progress, the stun/slow split).

## 4. Sequencing: medallions first (PO 2026-08-24)

`plan-entity-medallions.md` defines the actor's *identity* layer (the token in
a frame: species, faction family, tier, allegiance tint). This plan defines
the actor's *state* layer (effects, durations, sources, cast progress) and the
consolidation of the sibling overlays around that token. The dependency runs
one way:

- This plan's central structural question is anchoring, and the medallion IS
  the anchor. Its design needs the **D15 sizing ruling** (does the ring pin to
  the collider?) and **C0's named sub-container refactor** (which retires the
  child-index arithmetic this plan would otherwise inherit) to be settled
  first.
- The reverse dependency does not exist: medallions ships fine with bar, pips
  and nameplate unchanged below the token, where the PO mockup already places
  them.

The original sequencing note ("after the persistence/step-8 stretch, because
both touch the wire") is satisfied: step 8a shipped. Whether this plan's
design session slots directly after medallions C2 or waits for a play-feel
trigger stays a PO call; nothing is scheduled by this doc.

## 5. Boundaries (owned elsewhere, do not double-build)

- **The allegiance/stance wire field** (`stance: ubyte` appended to `Mob`) is
  `plan-entity-medallions.md` C2 (its §6.2, ruling D11). That plan pulled
  exactly this slice forward; this plan *inherits* the field and must not
  re-introduce it.
- **HUD chrome** (panels, ability bar, journal, dialogue, mobile layout,
  font) is `plan-ui-pass.md`'s lane; its §1 excludes this plan's scope
  symmetrically ("a world-rendering conversation, not a HUD one").
- **Frame customization** (player rings, per-NPC frames) is
  `plan-avatar-system.md`'s lane via medallions D6/D7.

## 6. The queue: everything waiting on this plan

Collected 2026-08-24 from the docs; input inventory for the design session.

1. **Buff/debuff durations** on the wire: the founding case (charm 59.4 s,
   calm), plus effect-foundations §6's still-open buff-visibility question
   (icons/timers vs pure VFX).
2. **The stun/slow wire conflation**: `stunPayload` reuses
   `AppliedEffectSlow`, so a stunned mob and a slowed one are
   wire-indistinguishable and a stun suppresses a weaker slow's pip; backlog
   §40's update box records **two** buffs queued behind the presence-bits →
   durations widening (lifesteal, and this conflation). This plan owns the
   split.
3. **Per-hit attribution (backlog §57 attack lines)**: MOVED to
   `plan-skill-vfx.md`, C1 (the `SkillEvent` vector carries the source).
4. **Per-hit damage numbers**: MOVED to `plan-skill-vfx.md`, C1 (the events
   replace the per-tick aggregates, under its D6 own-caused rule).
5. **Stealth / invisibility**: v1 is cosmetic by effect-foundations F9
   (transparency + aggro drop, no per-viewer hiding); the effect-types
   round-1 ruling (2026-08-15) blocks even that on this plan.
6. **CC-immunity feedback**: a refused stun is silent in-game (CLAUDE.md
   watch item). Since `9fb3859d` the "Immune"-label rails exist and the
   follow-up needs only its own signal; anything richer (a persistent
   immunity marker) lands here.
7. **The next aura ring category**: the `aura_category` wire ubyte is FULL
   (speed took the last bit, plan-effect-types C4), so any new ring category
   is part of this plan's wire widening.
8. **A shared ascension-ceremony effect**: the ceremony's Graphics are
   visible only to the ascending player (plan-ascension D29); a shared moment
   is a wire field, recorded as a conversation for this plan.
9. **The six wanted effect archetypes** (backlog §40 complexity ranking):
   "presentation for all six rides §39; none of them justifies a seventh
   independently-anchored overlay before it."
10. **Per-skill hit/field dressings** (PO animation mockups 2026-08-24):
    MOVED to `plan-skill-vfx.md`, C0 (the authored `visual` vocabulary,
    shipped 2026-09-19) and C2a/C2b (the renderer).

## 7. Open questions for the design session

- The wire shape: which facts ride per-entity state (durations, stacks, cast
  progress), and in what encoding; bundled once per §3.1. ⚑ The per-hit half
  of this question is answered elsewhere: `plan-skill-vfx.md` C1 rules that
  sources and landings ride a `SkillEvent` vector, so what is left here is
  per-entity state.
- Which sibling overlays merge *into* the frame vs stay anchored *to* it
  (medallions §2.5 keeps all six out of the token; this plan revisits that
  from the state side).
- Player-facing self-presentation (own buffs/debuffs with timers) vs
  on-entity presentation: same system or two surfaces?
- Sizing/legibility budget on mobile: fill rate is the proven failure mode
  (medallions §5.4); every new on-entity element pays it.
