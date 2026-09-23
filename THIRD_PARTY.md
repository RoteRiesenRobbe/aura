# Third-party assets

The repository's own `LICENSE` (All Rights Reserved, Team Dodo) covers the code
and the content authored here. It does **not** cover the assets below, which
carry their own licences.

## PONETI "6000 Fantasy Icons" (Unity Asset Store)

- **Licence:** Unity Asset Store End User License Agreement, **Extension Asset**
  licence, one seat per user (<https://unity.com/legal/as-terms>).
- **Where the raw pack is:** **not in this repository and not in its history.**
  The PNGs live outside the repo, in the folder `AURA_ICON_PACK_DIR` points at,
  on the seat holder's machine only.
- **What the repo holds:** only `frontend/src/client-data/icons/pack-manifest.json`,
  a list of the icons Aura uses by file name.
- **What ships:** the licence allows the icons embedded in the game build, and
  that is the only place they appear: `tools/pack-icons.mjs` packs the listed
  icons into 2048² texture atlases in `frontend/icons-prebuilt/` (the seat
  holder's local build, gitignored) and copies them into `frontend/dist/icons/`
  on every build, where the game serves them. The deploy bundle is built on the
  seat holder's machine, so the live server carries them.
- **Guard:** `.githooks/pre-commit` refuses any staged file that is a raw pack
  icon (by name or by content hash) or a generated atlas, the local build in
  `frontend/icons-prebuilt/` included.
- **Why not in git:** this repository is public (confirmed 2026-09-24, and it
  stays so for now), so anything committed, in history, in LFS, in a release or
  a package, is a public download of the icons, which the licence forbids.
  **Seat holder only, for now (PO 2026-09-24):** nobody else gets the atlases;
  the live server carries them because the deploy bundle is built on the seat
  holder's machine, and every other build draws the game-icons glyphs and the
  committed portraits. If that changes, the shapes are a private sidecar
  repository holding the atlases, or an encrypted archive in this repo whose
  key travels privately (whether ciphertext of licensed art satisfies the
  licence is a judgement, not a fact).

The icons are **not** covered by this repository's licence and may not be
redistributed as files.

## game-icons.net glyphs (CC BY 3.0)

The SVG skill glyphs under `frontend/src/client-data/icons/vendor/` are from
game-icons.net under CC BY 3.0; the per-author attribution lives beside them in
`frontend/src/client-data/icons/NOTICE.md`.
