-- Reverses 000003. Nothing references this table, so the drop is unqualified.
--
-- ⚑ Dropping it loses every character's map reveal. The reveal is game
-- progress, not a cache: nothing else can rebuild it.
DROP TABLE game.character_map_fog;
