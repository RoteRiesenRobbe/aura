// Getting a harness run into the world, after step 8a chunk 2.
//
// Before accounts, every script did the same three lines: wait for the start
// screen's name field, type a name, click Play. That form is gone — a character
// now comes from the account screens — so the three lines live here once
// instead of nineteen times.
//
// ⚑ Harness clients mint their own identity through the ANONYMOUS path, exactly
// like a brand-new player (plan-accounts-frontend.md §10b ruling 2). No seeded
// pool, no credentials, no bcrypt — and a fresh account every run, which is the
// "pristine character" property several scripts assert against ("the spellbook
// is empty", "XP goes 0 → 70").

/**
 * A reserved, unique character name.
 *
 * ⚑ The `hrnss_` prefix is REQUIRED, not decorative: it is what makes the
 * cleanup statement exactly scoped, and it is refused outright in production —
 * the prefix is only grantable under `-dev` (accounts.Config.AllowHarnessNames).
 *
 * ⚑ The old `tag + process.pid` scheme is NOT good enough any more. Character
 * names are globally unique and now PERSIST, and PIDs recycle — so a name that
 * worked on Monday fails on Friday, as a baffling "that name is taken" in a
 * script that has nothing to do with names.
 *
 * Shape rules (auth.ValidateCharacterName): 3–20 characters, letters/digits
 * joined by SINGLE interior separators, beginning and ending on a letter or
 * digit. The tag is squeezed to letters so a caller cannot accidentally build
 * an illegal name.
 */
export function harnessCharacterName(tag) {
  const safeTag = String(tag).toLowerCase().replace(/[^a-z]/g, '').slice(0, 5) || 'run';
  const stamp = (Date.now() % 1e6).toString(36);
  const salt = Math.random().toString(36).slice(2, 5);
  return `hrnss_${safeTag}_${stamp}${salt}`;
}

/**
 * Drive the account screens until the player is in the world.
 *
 * Handles both entry states, because a script that reloads mid-run gets the
 * second one: a cold profile lands on character creation, while a profile that
 * already minted an anonymous account lands on character-select.
 *
 * @returns the character name that ended up being used
 */
export async function joinAsNewCharacter(page, tag, { timeout = 120_000 } = {}) {
  const creation = page.locator('#characterCreation:not(.hidden)');
  const select = page.locator('#characterSelect:not(.hidden)');

  await Promise.race([
    creation.waitFor({ state: 'visible', timeout }),
    select.waitFor({ state: 'visible', timeout }),
  ]);

  let name;
  if (await select.isVisible()) {
    // Returning profile: play the character already in slot 0.
    name = await page.textContent('#characterSelect .slotCard .slotCharacterName');
    await page.click('#characterSelect .slotCard .button');
  } else {
    name = harnessCharacterName(tag);
    await page.fill('#characterCreation .characterNameInput', name);
    await page.click('#characterCreation .characterCreateSubmit');
  }

  // ⚑ state:'attached' is MANDATORY. `.hidden` is display:none in this codebase
  // and waitForSelector defaults to waiting for VISIBLE, so the happy path
  // would time out while the product behaved perfectly — a hang that looks like
  // a product bug.
  await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout });

  return name;
}
