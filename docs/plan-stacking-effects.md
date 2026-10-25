# Plan: stacking effects

> **Status: PARKED 2026-10-25, nothing designed, nothing built.** A holding
> place for the idea; it gets a planning session (the `plan-doc` skill) when
> a design wants it.

## Where it came from

The swamp's poison bog (`content-zone-7-swamp.md` §4.1 item 2) was ruled to
slow and poison and **stack up to 3 times**, each stack more slow and more
poison, so the longer you stay the faster you die. On 2026-10-25 the PO cut
the stacking from the swamp ("we can cut the stacking") and parked it here:
the bog ships with one refreshing effect.

## What is true today

- Nothing in the skill vocabulary stacks. An effect re-applied by the same
  source **refreshes** its duration and keeps its tick phase
  (`skills/buffs.go` `ApplyDot`; `plan-area-effects.md` D6, which relies on it
  so that hopping an area's edge cannot reset the damage).
- Two sources of the same magnitude collapse into one stream
  (`plan-area-effects.md` D8).

## Questions a design must answer

1. What stacks: a count per (skill, source), or per skill across sources?
2. What a stack adds: the same effect again, or a per-stack value authored on
   the skill (`perStack`)?
3. How stacks fall off: all at once when the effect lapses, or one at a time.
4. How a player reads the count: a number on the buff-tray circle
   (`plan-buff-tray.md`) and on the medallion's state ring
   (`plan-entity-presentation.md`)? Wire impact either way.
5. Does D6 survive: re-applying every tick must not add a stack every tick.

## Candidate users

The swamp bog (the origin). Any "the longer you stay, the worse it gets"
hazard; a mob poison that builds per bite.
