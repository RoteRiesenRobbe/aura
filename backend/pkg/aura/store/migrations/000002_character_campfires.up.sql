-- plan-world-map.md C2 (which absorbs plan-flight-paths.md C1 §5): the set of
-- campfires a character has discovered by dwelling at them.
--
-- ⚑ A REAL TABLE, not rows in game.character_flags. The cheaper option was
-- considered and rejected in the design session: flags would turn a *set* into
-- stringly-typed JSON and give up the foreign key. game.character_spellbook is
-- the precedent this follows — a per-character set with a composite primary key.
--
-- ⚑ PER CHARACTER, not per account and not per bloodline slot (flight-paths
-- D10). The exploration beat belongs to the life being played; backlog §36's
-- per-slot scoping stays reserved for sacrifice rewards.
--
-- ⚑ campfire_id is world.Campfire.ID — the authored `spawnpoint-N` string, the
-- same namespace characters.home_campfire_id already persists into. It is NOT
-- an FK to anything: campfires are authored content in api/zones/, not rows.
-- An id that no longer resolves (a fire deleted in the zone editor) is skipped
-- SILENTLY at load, exactly as home_campfire_id already is — never a boot
-- failure and never a lockout.
CREATE TABLE game.character_campfires (
    character_id   BIGINT NOT NULL REFERENCES game.characters(id),
    campfire_id    TEXT NOT NULL,
    discovered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, campfire_id)
);
