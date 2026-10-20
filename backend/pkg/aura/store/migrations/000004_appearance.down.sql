-- Reverses 000004. Nothing references the table, so the drop is unqualified.
--
-- ⚑ Dropping it loses every earned look, and dropping the column every chosen
-- ring: both are player progress nothing else can rebuild.
DROP TABLE game.appearance_unlocks;
ALTER TABLE game.characters DROP COLUMN ring;
