import '../assets/HUD.less';
import * as Conversation from '../../../conversation/logic/Conversation';
import * as Journal from '../../../journal/logic/Journal';
import * as Preloading from '../../../core/logic/Preloading';
import {BasicConfig as Constants} from '../../../../client-data/BasicConfig';
import {
    skillDisplayName,
    skillMaxLevel,
    skillCategory,
    skillPointCost,
    SkillCategory,
} from '../../../../client-data/Skills';
import {attachSkillTooltips} from './SkillTooltip';
import {clearNode, isUndefined, playCssAnimation} from '../../../common/logic/Utils';
import * as AlertBanner from '../../alert-banner/logic/AlertBanner';
import {VitalSignBar} from '../../../vital-signs/logic/VitalSignBar';
import {IGame} from "../../../core/logic/IGame";
import {UserInteraceDomReadyEvent} from '../../../core/logic/Events';
import {VitalSign} from '../../../vital-signs/logic/VitalSigns';
import {InputMessage, DEACTIVATE_AURA_SLOT} from '../../../backend/logic/messages/outgoing/InputMessage';
import {EquipMessage} from '../../../backend/logic/messages/outgoing/EquipMessage';
import {SpendSkillPointMessage} from '../../../backend/logic/messages/outgoing/SpendSkillPointMessage';
import * as Zoom from '../../../camera/logic/Zoom';
import SimpleBar from 'simplebar';

let Game: IGame = null;

let rootElement: HTMLElement;
let cycleIcon = require('../assets/cycle-icon.svg?raw');

let spellbookListElement: HTMLElement;
let auraLoadoutElement: HTMLElement;
let auraSlotListElement: HTMLElement;
let passiveLoadoutElement: HTMLElement;
let passiveSlotListElement: HTMLElement;
let cooldownLoadoutElement: HTMLElement;
let cooldownSlotListElement: HTMLElement;

// Latest cooldown slot state from the server; gates the activate-on-click.
let currentCooldownSlots: number[] = [];
let currentCooldownRemaining: number[] = [];

// Current level of every spellbook-known skill, kept by updateSpellbook.
// Feeds the hover tooltips (spellbook entries AND loadout slots — a slotted
// skill's level is its spellbook level).
const currentSkillLevels = new Map<number, number>();

function skillLevelOf(skillId: number): number {
    return currentSkillLevels.get(skillId) ?? 1;
}

let selectedSkillId: number | null = null;
let skillPointsBadgeElement: HTMLElement;
// Latest unspent-skill-point count from the server; gates the spend buttons.
let currentSkillPoints = 0;

// Latest positional aura-slot contents from the server (skill id per slot, 0 = empty).
// Source of truth for the activate-vs-empty check in the slot pointerdown handler.
let currentAuraSlots: number[] = [];
// Optimistically-highlighted active slot in the new panel; client-side only in 1a.
let activeSlotIndex: number | null = null;

let vitalSignsBars: { [key: string]: VitalSignBar };
let combatIndicatorElement: HTMLElement;
let healthBarTextElement: HTMLElement;
let xpBarTextElement: HTMLElement;
let shieldIndicatorElement: HTMLElement;
let castBarElement: HTMLElement;
let castBarIndicatorElement: HTMLElement;
let castBarTextElement: HTMLElement;

Preloading.renderPartial(require('../assets/HUD.html'), () => {
    rootElement = document.getElementById('gameUI');
    UserInteraceDomReadyEvent.trigger(rootElement);
});

export function setup(game) {
    Game = game;

    setupVitalSigns();
    setupZoomControl();
    setupSpellbook();
    setupAuraLoadout();
    setupPassiveLoadout();
    setupCooldownLoadout();
    Conversation.setup();
    Journal.setup();
}

// Zoom control: steps through the fixed-FOV zoom levels (camera/logic/Zoom.ts).
// The camera reads the level every frame, so a click applies on the next frame.
function setupZoomControl() {
    const inButton = document.getElementById('zoomInButton');
    const outButton = document.getElementById('zoomOutButton');
    const levelDisplay = document.getElementById('zoomLevelDisplay');

    const render = () => {
        levelDisplay.textContent = String(Zoom.getLevelNumber());
        inButton.classList.toggle('inactive', !Zoom.canZoomIn());
        outButton.classList.toggle('inactive', !Zoom.canZoomOut());
    };

    // pointerdown, not click — MouseManager's mousedown preventDefault
    // suppresses synthetic click events on HUD elements.
    inButton.addEventListener('pointerdown', () => {
        Zoom.zoomIn();
        render();
    });
    outButton.addEventListener('pointerdown', () => {
        Zoom.zoomOut();
        render();
    });

    render();
}


function setupVitalSigns() {
    vitalSignsBars = {
        health: new VitalSignBar(document.getElementById('healthBar'), VitalSign.health),
        xp: new VitalSignBar(document.getElementById('xpBar'), VitalSign.xp),
    };
    combatIndicatorElement = document.getElementById('combatIndicator');
    healthBarTextElement = document.querySelector('#healthBar .barText');
    xpBarTextElement = document.querySelector('#xpBar .barText');
    shieldIndicatorElement = document.querySelector('#healthBar .shieldIndicator');
    castBarElement = document.getElementById('castBar');
    castBarIndicatorElement = castBarElement?.querySelector('.indicator');
    castBarTextElement = castBarElement?.querySelector('.barText');
}

// updateCastBar renders the owning player's running cast (skill-vocab
// chunk 4, bare rendering): fill = elapsed fraction, text = skill name +
// remaining seconds (ticks × the server tick interval, the cooldown
// convention — never a rounded 33, see Constants.SERVER_TICKRATE). All-zero
// hides the bar — no cast, or the cast was canceled/completed.
export function updateCastBar(skillId: number, ticksLeft: number, ticksTotal: number) {
    if (!castBarElement) {
        return;
    }
    const casting = skillId > 0 && ticksTotal > 0;
    castBarElement.classList.toggle('casting', casting);
    if (!casting) {
        return;
    }
    const progress = Math.min(Math.max(1 - ticksLeft / ticksTotal, 0), 1);
    castBarIndicatorElement.style.width = `${progress * 100}%`;
    castBarTextElement.textContent =
        `${skillDisplayName(skillId)} ${(ticksLeft * Constants.SERVER_TICKRATE / 1000).toFixed(1)}s`;
}

// updateCombatIndicator shows/hides the red sword next to the zoom control
// while the own player is in combat (Character.in_combat) — the same window
// during which the server locks loadout editing.
export function updateCombatIndicator(inCombat: boolean) {
    combatLocked = inCombat;
    if (!combatIndicatorElement) {
        return;
    }
    combatIndicatorElement.classList.toggle('hidden', !inCombat);
}

// combatLocked mirrors Character.in_combat — the window during which the server
// rejects loadout edits. Client-side we short-circuit equip clicks with a
// warning banner instead of letting the request travel and get silently
// dropped.
let combatLocked = false;

// rejectEquipInCombat blocks a loadout edit while in combat, showing the reason
// in the alert banner. Returns true when the edit was blocked. Only equip
// (re-slotting) is locked — switching the active aura and firing cooldowns stay
// available mid-fight.
//
// Feedback pass B item 7: this used to be a floating text over the local
// character, which the playtester never noticed (the eyes are on the panel
// being clicked, not on the avatar). The banner is the established
// "read this" surface.
function rejectEquipInCombat(): boolean {
    if (!combatLocked) {
        return false;
    }
    AlertBanner.show("Can't change loadout in combat", 'warning');
    return true;
}

// updateShield renders the absorb segment on the health bar (skill-vocab
// chunk 2, bare rendering): width proportional to shieldHp/maxHealth,
// anchored at the end of the HP fill — sliding left over it when the bar is
// too full to fit, so an active shield is always visible.
export function updateShield(shieldHp: number, maxHealth: number, healthFraction: number) {
    if (!shieldIndicatorElement) {
        return;
    }
    if (!(shieldHp > 0) || !(maxHealth > 0)) {
        shieldIndicatorElement.style.display = 'none';
        return;
    }
    const width = Math.min(shieldHp / maxHealth, 1);
    const left = Math.min(healthFraction, 1 - width);
    shieldIndicatorElement.style.display = 'block';
    shieldIndicatorElement.style.left = `${left * 100}%`;
    shieldIndicatorElement.style.width = `${width * 100}%`;
}

// updateBarTexts renders the absolute numbers over the HUD bars each tick:
// Focus as current/max, XP as within-level progress toward the next level
// (server-authoritative — resets to 0/needed on level-up and on the death XP
// penalty).
//
// Both bars carry an explicit prefix. The XP one came from feedback pass B
// item 5 (the playtester did not recognise the bare "12/40" as an experience
// bar at all); the Focus one from F7 — the resource is spent by every tooltip
// in the game and had no name anywhere on screen to spend.
export function updateBarTexts(health: number, maxHealth: number, xpInLevel: number, xpForNextLevel: number) {
    if (healthBarTextElement) {
        healthBarTextElement.textContent = `Focus ${health}/${maxHealth}`;
    }
    if (xpBarTextElement) {
        xpBarTextElement.textContent = `XP ${xpInLevel}/${xpForNextLevel}`;
    }
}

export function show() {
    rootElement.classList.remove('hidden');
    Game.domElement.focus();
    Game.miniMap.start();
}

export function hide() {
    rootElement.classList.add('hidden');
    Game.miniMap.stop();
}

export function getRootElement() {
    return rootElement;
}


export function getVitalSignBar(vitalSign: string): VitalSignBar {
    return vitalSignsBars[vitalSign];
}

export function getMinimapContainer(): Element {
    return document.querySelector('#minimap > .wrapper');
}

export function getChat(): HTMLElement {
    return document.getElementById('chat');
}

function setupSpellbook() {
    spellbookListElement = document.getElementById('spellbookList');
    skillPointsBadgeElement = document.getElementById('skillPointsBadge');
    // Explicit init: the HUD partial lands after DOMContentLoaded, so
    // simplebar's data-attribute auto-init never sees it. SimpleBar's own
    // MutationObserver tracks the list re-renders in updateSpellbook.
    new SimpleBar(document.getElementById('spellbookScroll'), { autoHide: false });
    attachSkillTooltips(spellbookListElement, skillLevelOf);
    spellbookListElement.addEventListener('pointerdown', (e) => {
        const target = e.target as HTMLElement;
        const li = target.closest('li') as HTMLElement;
        if (!li || !li.dataset.skillId) return;
        const id = Number(li.dataset.skillId);

        // Spend/unspend buttons take precedence over the select-for-equip
        // logic below; the server re-validates every request.
        const spendBtn = target.closest('.spendBtn');
        if (spendBtn) {
            if (currentSkillPoints > 0 && !spendBtn.classList.contains('inactive')) {
                new SpendSkillPointMessage(id).send();
            }
            return;
        }
        const unspendBtn = target.closest('.unspendBtn');
        if (unspendBtn) {
            if (!unspendBtn.classList.contains('inactive')) {
                new SpendSkillPointMessage(id, true).send();
            }
            return;
        }

        if (selectedSkillId === id) {
            clearEquipSelection();
        } else {
            selectedSkillId = id;
            spellbookListElement.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
            // Only the panel matching the skill's category invites the equip click.
            auraLoadoutElement.classList.toggle('hasPendingSkill', skillCategory(id) === 'aura');
            passiveLoadoutElement.classList.toggle('hasPendingSkill', skillCategory(id) === 'passive');
            cooldownLoadoutElement.classList.toggle('hasPendingSkill', skillCategory(id) === 'cooldown');
        }
    });
}

// tryEquipPending installs a pending spellbook selection into `slot`, and is
// the single implementation of the click-to-bind flow (feedback pass C item 1)
// — shared by the three slot-click handlers and the slot hotkeys, so keyboard
// and mouse can never drift apart on the combat lock or the category rule.
//
// Returns true when the interaction was consumed by the equip flow, so callers
// skip their activate branch. A category mismatch also consumes: while a
// passive is pending, clicking an aura slot must not silently fire that aura
// (the server derives the target slot array from the skill, so the send would
// equip somewhere the player never pointed at).
function tryEquipPending(category: SkillCategory, slot: number): boolean {
    if (selectedSkillId === null) {
        return false;
    }
    if (skillCategory(selectedSkillId) !== category) {
        return true;
    }
    if (rejectEquipInCombat()) {
        return true;
    }
    new EquipMessage(selectedSkillId, slot).send();
    clearEquipSelection();
    return true;
}

// cancelEquipSelection drops a pending selection from outside the panel
// (Controls binds it to Escape). Without an escape hatch a pending skill the
// player changed their mind about keeps swallowing every slot hotkey press.
export function cancelEquipSelection() {
    if (selectedSkillId === null) {
        return;
    }
    clearEquipSelection();
}

function setupAuraLoadout() {
    auraLoadoutElement = document.getElementById('auraLoadout');
    auraSlotListElement = document.getElementById('auraSlotList');
    attachSkillTooltips(auraSlotListElement, skillLevelOf);
    auraSlotListElement.addEventListener('pointerdown', (e) => {
        const li = (e.target as HTMLElement).closest('li') as HTMLElement;
        if (!li || li.dataset.slot === undefined) return;
        const slot = Number(li.dataset.slot);

        if (tryEquipPending('aura', slot)) return;

        toggleAuraSlot(slot);
    });
}

// toggleAuraSlot activates the given aura slot, or deactivates the aura when
// the slot is already active (→ Nothing). Empty slots (skill id 0) do
// nothing. The highlight set here is optimistic (instant feedback); the
// server-authoritative active_aura_slot overwrites it every tick
// (updateActiveAuraSlot), and the on-character ring follows
// Character.active_skill_id. Shared by slot clicks and hotkeys 1–3.
function toggleAuraSlot(slot: number) {
    if (currentAuraSlots[slot] === 0 || currentAuraSlots[slot] === undefined) {
        return;
    }

    const input = new InputMessage();
    if (activeSlotIndex === slot) {
        input.activeAuraSlot = DEACTIVATE_AURA_SLOT;
        input.send();
        pendingSlot = null;
        pendingSlotUntil = Date.now() + PENDING_SLOT_GRACE_MS;
        clearActiveSlotHighlight();
    } else {
        input.activeAuraSlot = slot;
        input.send();
        pendingSlot = slot;
        pendingSlotUntil = Date.now() + PENDING_SLOT_GRACE_MS;
        setActiveSlotHighlight(slot);
    }
}

// Optimistic-highlight grace (C2 PO finding 2026-07-17): after a slot click,
// snapshots still carry the OLD active slot for a tick or two — blindly
// applying them made the selector flicker old→new. During the grace window,
// authoritative values that don't confirm the pending choice are ignored;
// confirmation or expiry ends the window (expiry = the command really was
// lost, so the server value wins again).
let pendingSlot: number | null | undefined = undefined;
let pendingSlotUntil = 0;
const PENDING_SLOT_GRACE_MS = 400;

// hotkeyAuraSlot is the keyboard entry point (Controls, keys 1–3). With a
// skill selected in the spellbook the key BINDS instead of activating —
// decision 6's "click skill → press slot key" half.
export function hotkeyAuraSlot(slot: number) {
    if (tryEquipPending('aura', slot)) return;
    toggleAuraSlot(slot);
}

// hotkeyCooldownSlot is the keyboard entry point (Controls, Q/E/F); binds a
// pending cooldown skill before it fires anything, like hotkeyAuraSlot.
export function hotkeyCooldownSlot(slot: number) {
    if (tryEquipPending('cooldown', slot)) return;
    activateCooldownSlot(slot);
}

function setupPassiveLoadout() {
    passiveLoadoutElement = document.getElementById('passiveLoadout');
    passiveSlotListElement = document.getElementById('passiveSlotList');
    attachSkillTooltips(passiveSlotListElement, skillLevelOf);
    passiveSlotListElement.addEventListener('pointerdown', (e) => {
        const li = (e.target as HTMLElement).closest('li') as HTMLElement;
        if (!li || li.dataset.slot === undefined) return;
        const slot = Number(li.dataset.slot);

        // Passives have no activate branch — all equipped passives are always
        // on. The only interaction is equipping a pending passive skill, and
        // no slot hotkey exists for them (no key is assigned), so passives
        // stay click-only.
        tryEquipPending('passive', slot);
    });
}

function setupCooldownLoadout() {
    cooldownLoadoutElement = document.getElementById('cooldownLoadout');
    cooldownSlotListElement = document.getElementById('cooldownSlotList');
    attachSkillTooltips(cooldownSlotListElement, skillLevelOf);
    cooldownSlotListElement.addEventListener('pointerdown', (e) => {
        const li = (e.target as HTMLElement).closest('li') as HTMLElement;
        if (!li || li.dataset.slot === undefined) return;
        const slot = Number(li.dataset.slot);

        // Equip branch: a pending cooldown skill installs into this slot.
        if (tryEquipPending('cooldown', slot)) return;

        // Activate branch: clicking an occupied, ready slot fires it — the
        // same wire signal as the hotkeys. The server re-validates anyway.
        activateCooldownSlot(slot);
    });
}

// activateCooldownSlot fires an occupied, ready cooldown slot. Shared by
// slot clicks and the Q/E/F hotkeys; the server re-validates every request.
function activateCooldownSlot(slot: number) {
    if ((currentCooldownSlots[slot] ?? 0) === 0) return;
    if ((currentCooldownRemaining[slot] ?? 0) > 0) return;
    const input = new InputMessage();
    input.cooldownActivations = [slot];
    input.send();
}

// setActiveSlotHighlight marks one slot active in the panel (optimistic, client-side).
function setActiveSlotHighlight(slot: number) {
    activeSlotIndex = slot;
    if (!auraSlotListElement) return;
    auraSlotListElement.querySelectorAll('.auraSlot').forEach(el => el.classList.remove('activeSlot'));
    const li = auraSlotListElement.querySelector(`.auraSlot[data-slot="${slot}"]`);
    if (li) li.classList.add('activeSlot');
}

// clearActiveSlotHighlight drops the active-slot highlight (optimistic Nothing state).
function clearActiveSlotHighlight() {
    activeSlotIndex = null;
    if (!auraSlotListElement) return;
    auraSlotListElement.querySelectorAll('.auraSlot').forEach(el => el.classList.remove('activeSlot'));
}

function clearEquipSelection() {
    selectedSkillId = null;
    spellbookListElement.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
    auraLoadoutElement.classList.remove('hasPendingSkill');
    passiveLoadoutElement.classList.remove('hasPendingSkill');
    cooldownLoadoutElement.classList.remove('hasPendingSkill');
}

// Previous tick's spellbook contents, used to detect fresh unlocks for the
// one-shot glow. null = no baseline yet — the first snapshot after load
// establishes it without glow, even when it's empty. Empty is a real state
// (peasant start owns nothing), so it must NOT double as the sentinel:
// otherwise the first skill ever learned (Harvest) reads as the baseline
// and its unlock banner is swallowed.
let knownSpellbookIds: number[] | null = null;
// Previous tick's per-skill levels, parallel to knownSpellbookIds; level
// changes trigger a list rebuild but never the unlock glow.
let knownSpellbookLevels: number[] = [];
// Previous tick's unspent point count. Part of the rebuild key since the +
// buttons grey on affordability (L9): a level-up hands out a point without
// touching ids or levels, and the buttons it makes affordable would otherwise
// stay greyed until the next unrelated spellbook change.
let knownSpellbookPoints = -1;

function sameIds(a: number[], b: number[]) {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

// updateSkillPointsDisplay keeps the header badge and the panel's hasPoints
// class (which lights up the spend buttons) in sync with the server count.
function updateSkillPointsDisplay(points: number) {
    currentSkillPoints = points;
    if (skillPointsBadgeElement) {
        skillPointsBadgeElement.textContent = points === 1 ? '1 Point' : `${points} Points`;
        skillPointsBadgeElement.classList.toggle('hidden', points <= 0);
    }
    document.getElementById('spellbook').classList.toggle('hasPoints', points > 0);
}

// updateSpellbook is called every tick in PLAYING state with the full list of
// discovered skill IDs, their levels (positionally parallel), and the unspent
// point count. An empty id array clears the list. Rebuilds the DOM only when
// ids or levels actually changed, so the unlock animation is not restarted by
// the per-tick calls.
export function updateSpellbook(ids: number[], levels: number[], points: number) {
    if (!spellbookListElement) return;
    updateSkillPointsDisplay(points);
    if (knownSpellbookIds !== null
        && sameIds(ids, knownSpellbookIds) && sameIds(levels, knownSpellbookLevels)
        && points === knownSpellbookPoints) return;

    const isBaseline = knownSpellbookIds === null;
    const known = new Set(knownSpellbookIds ?? []);
    let anyUnlock = false;

    const entries = ids.map((id, i) => ({id, level: levels[i] ?? 1}));
    currentSkillLevels.clear();
    for (const {id, level} of entries) {
        currentSkillLevels.set(id, level);
    }
    const sections: { category: string, title: string }[] = [
        {category: 'aura', title: 'Auras'},
        {category: 'passive', title: 'Passives'},
        {category: 'cooldown', title: 'Cooldowns'},
    ];

    spellbookListElement.innerHTML = '';
    for (const section of sections) {
        const sectionEntries = entries.filter(e => skillCategory(e.id) === section.category);
        // Empty sections stay invisible — among other things this avoids
        // hinting at not-yet-discovered content (zero-hint policy).
        if (sectionEntries.length === 0) continue;

        const header = document.createElement('li');
        header.className = 'sectionHeader';
        header.textContent = section.title;
        spellbookListElement.appendChild(header);

        for (const {id, level} of sectionEntries) {
            const maxLevel = skillMaxLevel(id);

            const li = document.createElement('li');
            li.dataset.skillId = String(id);

            const name = document.createElement('span');
            name.className = 'skillName';
            name.textContent = skillDisplayName(id);
            li.appendChild(name);

            const controls = document.createElement('span');
            controls.className = 'skillControls';

            const unspendBtn = document.createElement('button');
            unspendBtn.className = 'unspendBtn';
            unspendBtn.textContent = '−';
            unspendBtn.classList.toggle('inactive', level <= 1);
            controls.appendChild(unspendBtn);

            const levelBadge = document.createElement('span');
            levelBadge.className = 'skillLevel';
            levelBadge.textContent = `${level}/${maxLevel}`;
            controls.appendChild(levelBadge);

            // The + button shows what the NEXT level costs and greys when it
            // cannot be afforded (L9). Before the D10 curve every level cost
            // one point, so "you have points" and "you can buy this" were the
            // same question and the button only ever greyed at the cap — an
            // unaffordable spend was refused server-side with a log line the
            // player never saw. With a variable cost that silence would be the
            // normal case, not an edge one.
            const nextCost = skillPointCost(maxLevel, level + 1);
            const spendBtn = document.createElement('button');
            spendBtn.className = 'spendBtn';
            spendBtn.textContent = level >= maxLevel ? '+' : `+${nextCost}`;
            spendBtn.classList.toggle('inactive', level >= maxLevel || points < nextCost);
            if (level < maxLevel) {
                spendBtn.title = `Costs ${nextCost} skill point${nextCost === 1 ? '' : 's'}`;
            }
            controls.appendChild(spendBtn);

            li.appendChild(controls);

            if (selectedSkillId === id) {
                li.classList.add('selected');
            }
            if (!isBaseline && !known.has(id)) {
                li.classList.add('unlocked');
                anyUnlock = true;
                // The discovery banner is now server-authored (it carries the
                // unlock source — plan-unlock-attribution.md) and arrives on the
                // EntityMessage/Unlock channel. Here we only mark the panel entry
                // and drive the unlockPulse below; level changes and the
                // join/respawn baseline still never pulse.
            }
            spellbookListElement.appendChild(li);
        }
    }

    if (anyUnlock) {
        playCssAnimation(document.getElementById('spellbook'), 'unlockPulse');
    }

    knownSpellbookIds = ids.slice();
    knownSpellbookLevels = levels.slice();
    knownSpellbookPoints = points;
}

// updateActiveAuraSlot applies the server-authoritative active aura slot
// (GameState.active_aura_slot) each tick; -1 = Nothing. It overwrites the
// optimistic click highlight within a tick, making the server the source of
// truth for the panel from spawn on.
export function updateActiveAuraSlot(slot: number) {
    if (pendingSlot !== undefined) {
        const server: number | null = slot >= 0 ? slot : null;
        if (server === pendingSlot || Date.now() > pendingSlotUntil) {
            pendingSlot = undefined;
        } else {
            // Stale tick during the click grace window — keep the optimistic
            // highlight instead of flickering back.
            return;
        }
    }
    if (slot >= 0) {
        setActiveSlotHighlight(slot);
    } else {
        clearActiveSlotHighlight();
    }
}

export function updateAuraLoadout(slots: number[]) {
    if (!auraSlotListElement) return;
    currentAuraSlots = slots;
    for (let i = 0; i < slots.length; i++) {
        const li = auraSlotListElement.querySelector(`.auraSlot[data-slot="${i}"]`) as HTMLElement;
        if (!li) continue;
        const label = li.querySelector('.slotLabel') as HTMLElement;
        label.textContent = slots[i] !== 0 ? skillDisplayName(slots[i]) : '— Empty —';
        li.dataset.skillId = String(slots[i]);
        // Re-apply the optimistic highlight after the per-tick text re-render.
        // Never highlight an empty slot (guards against a slot emptied while active).
        li.classList.toggle('activeSlot', activeSlotIndex === i && slots[i] !== 0);
    }
}

// updatePassiveLoadout renders the server-authoritative passive slot contents.
// No active state — all equipped passives are always on.
export function updatePassiveLoadout(slots: number[]) {
    if (!passiveSlotListElement) return;
    for (let i = 0; i < slots.length; i++) {
        const li = passiveSlotListElement.querySelector(`.passiveSlot[data-slot="${i}"]`) as HTMLElement;
        if (!li) continue;
        li.textContent = slots[i] !== 0 ? skillDisplayName(slots[i]) : '— Empty —';
        li.dataset.skillId = String(slots[i]);
    }
}

// updateCooldownLoadout renders the server-authoritative cooldown slots and
// their remaining time (ticks × the server tick interval), which doubles as the
// fired/ready state.
export function updateCooldownLoadout(slots: number[], remainingTicks: number[]) {
    if (!cooldownSlotListElement) return;
    currentCooldownSlots = slots;
    currentCooldownRemaining = remainingTicks;
    for (let i = 0; i < slots.length; i++) {
        const li = cooldownSlotListElement.querySelector(`.cooldownSlot[data-slot="${i}"]`) as HTMLElement;
        if (!li) continue;
        const label = li.querySelector('.slotLabel') as HTMLElement;
        const cd = li.querySelector('.cdRemaining') as HTMLElement;
        label.textContent = slots[i] !== 0 ? skillDisplayName(slots[i]) : '— Empty —';
        li.dataset.skillId = String(slots[i]);
        const remaining = remainingTicks[i] ?? 0;
        cd.textContent = remaining > 0 ? `${(remaining * Constants.SERVER_TICKRATE / 1000).toFixed(1)}s` : '';
        li.classList.toggle('onCooldown', remaining > 0);
    }
}

