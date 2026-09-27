-- plan-map-fog-persistence.md F1: the map area each character has revealed,
-- as a coverage bitmap stored one row per EXPLORED chunk.
--
-- ⚑ A REAL TABLE, one row per chunk, not a blob per character and not a
-- character_flags key (D2). Every cost here then scales with what the
-- character has SEEN rather than with the size of the world, which the PO
-- confirmed will be very large. game.character_campfires is the precedent.
--
-- ⚑ WORLD COORDINATES, NO ZONE ID (D9). A chunk is (chunk_x, chunk_y) in the
-- one coordinate space every zone is placed into, so resizing a zone keeps its
-- reveal. chunk_x / chunk_y may be negative: world.json spans the origin.
-- world.MaxWorldCoordinate (8192) bounds them to ±64, well inside SMALLINT.
--
-- ⚑ THE GRID TRAVELS WITH EACH ROW (D10). cell_size (units) and chunk_cells
-- (cells per chunk side) are the grid the bits were drawn on; a row whose grid
-- differs from the server's is skipped SILENTLY at load, never a boot failure
-- and never a lockout, so changing the grid is a reset, not a migration.
--
-- ⚑ bits is chunk_cells² bits, row-major, LSB-first within a byte.
--
-- ⚑ The set only ever grows: the save path upserts every explored chunk and
-- never deletes. Death and ascension leave these rows alone (D12), like the
-- campfire rows.
CREATE TABLE game.character_map_fog (
    character_id  BIGINT NOT NULL REFERENCES game.characters(id),
    chunk_x       SMALLINT NOT NULL,
    chunk_y       SMALLINT NOT NULL,
    cell_size     SMALLINT NOT NULL,
    chunk_cells   SMALLINT NOT NULL,
    bits          BYTEA NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, chunk_x, chunk_y)
);
