import '../assets/HUD.less';
import * as Preloading from '../../../core/logic/Preloading';
import {BasicConfig as Constants} from '../../../../client-data/BasicConfig';
import {skillDisplayName, skillMaxLevel, skillCategory} from '../../../../client-data/Skills';
import {clearNode, isUndefined, playCssAnimation} from '../../../common/logic/Utils';
import {VitalSignBar} from '../../../vital-signs/logic/VitalSignBar';
import {IGame} from "../../../core/logic/IGame";
import {UserInteraceDomReadyEvent} from '../../../core/logic/Events';
import {VitalSign} from '../../../vital-signs/logic/VitalSigns';
import {InputMessage, DEACTIVATE_AURA_SLOT} from '../../../backend/logic/messages/outgoing/InputMessage';
import {EquipMessage} from '../../../backend/logic/messages/outgoing/EquipMessage';
import {SpendSkillPointMessage} from '../../../backend/logic/messages/outgoing/SpendSkillPointMessage';
import * as Zoom from '../../../camera/logic/Zoom';

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
// remaining seconds (ticks × 33 ms, the cooldown convention). All-zero
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
        `${skillDisplayName(skillId)} ${(ticksLeft * 33 / 1000).toFixed(1)}s`;
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
// rejects loadout edits. Client-side we short-circuit equip clicks with an
// over-the-head message (same feedback channel as the campfire bind) instead of
// letting the request travel and get silently dropped.
let combatLocked = false;

// rejectEquipInCombat blocks a loadout edit while in combat, showing the reason
// over the local character. Returns true when the edit was blocked. Only equip
// (re-slotting) is locked — switching the active aura and firing cooldowns stay
// available mid-fight.
function rejectEquipInCombat(): boolean {
    if (!combatLocked) {
        return false;
    }
    Game.player?.character?.showFloatingText("Can't change loadout in combat", 0xE05038);
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
// health as currentHP/maxHP, XP as within-level progress toward the next
// level (server-authoritative — resets to 0/needed on level-up and on the
// death XP penalty).
export function updateBarTexts(health: number, maxHealth: number, xpInLevel: number, xpForNextLevel: number) {
    if (healthBarTextElement) {
        healthBarTextElement.textContent = `${health}/${maxHealth}`;
    }
    if (xpBarTextElement) {
        xpBarTextElement.textContent = `${xpInLevel}/${xpForNextLevel}`;
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

function setupAuraLoadout() {
    auraLoadoutElement = document.getElementById('auraLoadout');
    auraSlotListElement = document.getElementById('auraSlotList');
    auraSlotListElement.addEventListener('pointerdown', (e) => {
        const li = (e.target as HTMLElement).closest('li') as HTMLElement;
        if (!li || li.dataset.slot === undefined) return;
        const slot = Number(li.dataset.slot);

        if (selectedSkillId !== null) {
            // Equip branch: a pending skill installs into this slot — but only
            // if its category matches (the server derives the target slot array
            // from the skill, so a mismatched send would equip elsewhere).
            if (skillCategory(selectedSkillId) === 'aura') {
                if (rejectEquipInCombat()) return;
                new EquipMessage(selectedSkillId, slot).send();
                clearEquipSelection();
            }
            return;
        }

        toggleAuraSlot(slot);
    });
}

// toggleAuraSlot activates the given aura slot, or deactivates the aura when
// the slot is already active (→ Nothing). Empty slots (skill id 0) do
// nothing. The highlight set here is optimistic (instant feedback); the
// server-authoritative active_aura_slot overwrites it every tick
// (updateActiveAuraSlot), and the on-character ring follows
// Character.active_skill_id. Shared by slot clicks and hotkeys 1–4.
function toggleAuraSlot(slot: number) {
    if (currentAuraSlots[slot] === 0 || currentAuraSlots[slot] === undefined) {
        return;
    }

    const input = new InputMessage();
    if (activeSlotIndex === slot) {
        input.activeAuraSlot = DEACTIVATE_AURA_SLOT;
        input.send();
        clearActiveSlotHighlight();
    } else {
        input.activeAuraSlot = slot;
        input.send();
        setActiveSlotHighlight(slot);
    }
}

// hotkeyAuraSlot is the keyboard entry point (Controls, keys 1–4).
export function hotkeyAuraSlot(slot: number) {
    toggleAuraSlot(slot);
}

// hotkeyCooldownSlot is the keyboard entry point (Controls, Q/E).
export function hotkeyCooldownSlot(slot: number) {
    activateCooldownSlot(slot);
}

function setupPassiveLoadout() {
    passiveLoadoutElement = document.getElementById('passiveLoadout');
    passiveSlotListElement = document.getElementById('passiveSlotList');
    passiveSlotListElement.addEventListener('pointerdown', (e) => {
        const li = (e.target as HTMLElement).closest('li') as HTMLElement;
        if (!li || li.dataset.slot === undefined) return;
        const slot = Number(li.dataset.slot);

        // Passives have no activate branch — all equipped passives are always
        // on. The only interaction is equipping a pending passive skill.
        if (selectedSkillId !== null && skillCategory(selectedSkillId) === 'passive') {
            if (rejectEquipInCombat()) return;
            new EquipMessage(selectedSkillId, slot).send();
            clearEquipSelection();
        }
    });
}

function setupCooldownLoadout() {
    cooldownLoadoutElement = document.getElementById('cooldownLoadout');
    cooldownSlotListElement = document.getElementById('cooldownSlotList');
    cooldownSlotListElement.addEventListener('pointerdown', (e) => {
        const li = (e.target as HTMLElement).closest('li') as HTMLElement;
        if (!li || li.dataset.slot === undefined) return;
        const slot = Number(li.dataset.slot);

        // Equip branch: a pending cooldown skill installs into this slot.
        if (selectedSkillId !== null) {
            if (skillCategory(selectedSkillId) === 'cooldown') {
                if (rejectEquipInCombat()) return;
                new EquipMessage(selectedSkillId, slot).send();
                clearEquipSelection();
            }
            return;
        }

        // Activate branch: clicking an occupied, ready slot fires it — the
        // same wire signal as the hotkeys. The server re-validates anyway.
        activateCooldownSlot(slot);
    });
}

// activateCooldownSlot fires an occupied, ready cooldown slot. Shared by
// slot clicks and the Q/E hotkeys; the server re-validates every request.
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
// one-shot glow. Empty = no baseline yet (join/respawn/death cleared it) —
// the first non-empty list renders without glow. That never swallows a real
// unlock, since players always spawn with DamageAura already discovered.
let knownSpellbookIds: number[] = [];
// Previous tick's per-skill levels, parallel to knownSpellbookIds; level
// changes trigger a list rebuild but never the unlock glow.
let knownSpellbookLevels: number[] = [];

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
    if (sameIds(ids, knownSpellbookIds) && sameIds(levels, knownSpellbookLevels)) return;

    const isBaseline = knownSpellbookIds.length === 0;
    const known = new Set(knownSpellbookIds);
    let anyUnlock = false;

    const entries = ids.map((id, i) => ({id, level: levels[i] ?? 1}));
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

            const spendBtn = document.createElement('button');
            spendBtn.className = 'spendBtn';
            spendBtn.textContent = '+';
            spendBtn.classList.toggle('inactive', level >= maxLevel);
            controls.appendChild(spendBtn);

            li.appendChild(controls);

            if (selectedSkillId === id) {
                li.classList.add('selected');
            }
            if (!isBaseline && !known.has(id)) {
                li.classList.add('unlocked');
                anyUnlock = true;
            }
            spellbookListElement.appendChild(li);
        }
    }

    if (anyUnlock) {
        playCssAnimation(document.getElementById('spellbook'), 'unlockPulse');
    }

    knownSpellbookIds = ids.slice();
    knownSpellbookLevels = levels.slice();
}

// updateActiveAuraSlot applies the server-authoritative active aura slot
// (GameState.active_aura_slot) each tick; -1 = Nothing. It overwrites the
// optimistic click highlight within a tick, making the server the source of
// truth for the panel from spawn on.
export function updateActiveAuraSlot(slot: number) {
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
    }
}

// updateCooldownLoadout renders the server-authoritative cooldown slots and
// their remaining time (ticks × 33 ms), which doubles as the fired/ready state.
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
        const remaining = remainingTicks[i] ?? 0;
        cd.textContent = remaining > 0 ? `${(remaining * 33 / 1000).toFixed(1)}s` : '';
        li.classList.toggle('onCooldown', remaining > 0);
    }
}

