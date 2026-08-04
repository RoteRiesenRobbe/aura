-- Reverses 000002. Nothing references this table, so the drop is unqualified.
--
-- ⚑ Dropping it loses every character's discovered set. That is the intended
-- meaning of reversing this migration — the set is game progress, not a cache,
-- and there is nowhere else it survives.
DROP TABLE game.character_campfires;
