import '../assets/HUD.less';
import * as Preloading from '../../../core/logic/Preloading';
import {BasicConfig as Constants} from '../../../../client-data/BasicConfig';
import {skillDisplayName} from '../../../../client-data/Skills';
import {clearNode, isUndefined, playCssAnimation} from '../../../common/logic/Utils';
import {ClickableIcon} from './ClickableIcon';
import {ClickableCountableIcon} from './ClickableCountableIcon';
import {VitalSignBar} from '../../../vital-signs/logic/VitalSignBar';
import {IGame} from "../../../core/logic/IGame";
import {UserInteraceDomReadyEvent} from '../../../core/logic/Events';
import {VitalSign} from '../../../vital-signs/logic/VitalSigns';
import {InputMessage, DEACTIVATE_AURA_SLOT} from '../../../backend/logic/messages/outgoing/InputMessage';
import {EquipMessage} from '../../../backend/logic/messages/outgoing/EquipMessage';

let Game: IGame = null;

let rootElement: HTMLElement;
let cycleIcon = require('../assets/cycle-icon.svg?raw');

let craftingElement: HTMLElement;
let craftableItemTemplate: HTMLElement;
let inventorySlots: ClickableCountableIcon[];
let spellbookListElement: HTMLElement;
let auraLoadoutElement: HTMLElement;
let auraSlotListElement: HTMLElement;

let selectedSkillId: number | null = null;

// Latest positional aura-slot contents from the server (skill id per slot, 0 = empty).
// Source of truth for the activate-vs-empty check in the slot pointerdown handler.
let currentAuraSlots: number[] = [];
// Optimistically-highlighted active slot in the new panel; client-side only in 1a.
let activeSlotIndex: number | null = null;

let vitalSignsBars: { [key: string]: VitalSignBar };

Preloading.renderPartial(require('../assets/HUD.html'), () => {
    rootElement = document.getElementById('gameUI');
    UserInteraceDomReadyEvent.trigger(rootElement);
});

export function setup(game) {
    Game = game;

    setupCrafting();

    setupInventory();

    setupVitalSigns();
    setupSpellbook();
    setupAuraLoadout();
}

function setupCrafting() {
    craftingElement = document.getElementById('crafting');
    craftableItemTemplate = craftingElement.removeChild(craftingElement.querySelector('.craftableItem'));
}

function setupInventory() {
    let inventoryElement = document.getElementById('inventory');
    let inventorySlot = document.querySelector('#inventory > .inventorySlot');

    inventorySlots = new Array(Constants.INVENTORY_SLOTS);
    setupInventorySlot(inventorySlot, 0);

    for (let i = 1; i < Constants.INVENTORY_SLOTS; ++i) {
        let inventorySlotCopy = inventorySlot.cloneNode(true);
        inventoryElement.appendChild(inventorySlotCopy);
        setupInventorySlot(inventorySlotCopy, i);
    }
}

function setupInventorySlot(inventorySlot, index) {
    inventorySlots[index] = new ClickableCountableIcon(
        inventorySlot
            .getElementsByClassName('clickableItem')
            .item(0));
    let autoFeedToggle = inventorySlot.getElementsByClassName('autoFeedToggle').item(0);
    autoFeedToggle.innerHTML = cycleIcon;
}

function setupVitalSigns() {
    vitalSignsBars = {
        health: new VitalSignBar(document.getElementById('healthBar'), VitalSign.health),
        satiety: new VitalSignBar(document.getElementById('satietyBar'), VitalSign.satiety),
        bodyHeat: new VitalSignBar(document.getElementById('bodyHeatBar'), VitalSign.bodyHeat),
    };
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

const CRAFTABLES_NEW_LINES = [
    [],
    [1],
    [2],
    [2, 3],
    [2, 4],
    [3, 5],
    [3, 5, 6],
    [3, 5, 7],
    [3, 6, 8],
    [4, 7, 9],
    [4, 7, 9, 10],
    [4, 7, 9, 11],
    [4, 7, 10, 12],
    [4, 8, 11, 13],
    [5, 9, 12, 14],
    [5, 9, 12, 14, 15],
    [5, 9, 12, 14, 16],
    [5, 9, 12, 15, 17],
    [5, 9, 13, 16, 18],
    [5, 10, 14, 17, 19],
    [6, 11, 15, 18, 20]
];

export function displayAvailableCrafts(availableCrafts, onLeftClick) {
    clearNode(craftingElement);

    if (availableCrafts.length === 0) {
        return;
    }

    let newLines = CRAFTABLES_NEW_LINES[availableCrafts.length - 1];

    availableCrafts.forEach(function (recipe, index) {
        if (isUndefined(recipe.clickableIcon)) {
            let craftableItemElement = craftableItemTemplate.cloneNode(true) as HTMLElement;

            let clickableIcon = new ClickableIcon(craftableItemElement);
            clickableIcon.onLeftClick = function (event) {
                onLeftClick.call(clickableIcon, event, recipe);
            };
            clickableIcon.setIconGraphic(recipe.item.icon.file, true);
            clickableIcon.addSubIcons(recipe.materials);

            recipe.clickableIcon = clickableIcon;
        }
        recipe.clickableIcon.setHinted(!recipe.isCraftable);
        recipe.clickableIcon.appendTo(craftingElement);
        if (newLines.indexOf(index) === -1) {
            recipe.clickableIcon.domElement.classList.remove('newLine');
        } else {
            recipe.clickableIcon.domElement.classList.add('newLine');
        }
    });
}

export function flashInventory() {
    let inventoryElement = document.getElementById('inventory');
    playCssAnimation(inventoryElement, 'overfilled');
}

export function getInventorySlot(slotIndex: number): ClickableCountableIcon {
    return inventorySlots[slotIndex];
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

export function getScoreboard(): HTMLElement {
    return document.getElementById('scoreboard');
}

function setupSpellbook() {
    spellbookListElement = document.getElementById('spellbookList');
    spellbookListElement.addEventListener('pointerdown', (e) => {
        const li = (e.target as HTMLElement).closest('li') as HTMLElement;
        if (!li || !li.dataset.skillId) return;
        const id = Number(li.dataset.skillId);
        if (selectedSkillId === id) {
            clearEquipSelection();
        } else {
            selectedSkillId = id;
            spellbookListElement.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
            auraLoadoutElement.classList.add('hasPendingSkill');
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
            // Equip branch: a spellbook skill is pending — install it into this slot.
            new EquipMessage(selectedSkillId, slot).send();
            clearEquipSelection();
            return;
        }

        // Activate branch: nothing pending — toggle this slot's aura.
        // Empty slots (skill id 0) do nothing. The highlight set here is
        // optimistic (instant feedback); the server-authoritative
        // active_aura_slot overwrites it every tick (updateActiveAuraSlot),
        // and the on-character ring follows Character.active_skill_id.
        if (currentAuraSlots[slot] === 0 || currentAuraSlots[slot] === undefined) {
            return;
        }

        const input = new InputMessage();
        if (activeSlotIndex === slot) {
            // Clicking the already-active slot deactivates it → Nothing.
            input.activeAuraSlot = DEACTIVATE_AURA_SLOT;
            input.send();
            clearActiveSlotHighlight();
        } else {
            // Switch the active aura to this slot.
            input.activeAuraSlot = slot;
            input.send();
            setActiveSlotHighlight(slot);
        }
    });
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
}

// Previous tick's spellbook contents, used to detect fresh unlocks for the
// one-shot glow. Empty = no baseline yet (join/respawn/death cleared it) —
// the first non-empty list renders without glow. That never swallows a real
// unlock, since players always spawn with DamageAura already discovered.
let knownSpellbookIds: number[] = [];

function sameIds(a: number[], b: number[]) {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

// updateSpellbook is called every tick in PLAYING state with the full list of
// discovered skill IDs. An empty array clears the list. Rebuilds the DOM only
// when the list actually changed, so the unlock animation is not restarted by
// the per-tick calls.
export function updateSpellbook(ids: number[]) {
    if (!spellbookListElement) return;
    if (sameIds(ids, knownSpellbookIds)) return;

    const isBaseline = knownSpellbookIds.length === 0;
    const known = new Set(knownSpellbookIds);
    let anyUnlock = false;

    spellbookListElement.innerHTML = '';
    for (const id of ids) {
        const li = document.createElement('li');
        li.textContent = skillDisplayName(id);
        li.dataset.skillId = String(id);
        if (selectedSkillId === id) {
            li.classList.add('selected');
        }
        if (!isBaseline && !known.has(id)) {
            li.classList.add('unlocked');
            anyUnlock = true;
        }
        spellbookListElement.appendChild(li);
    }

    if (anyUnlock) {
        playCssAnimation(document.getElementById('spellbook'), 'unlockPulse');
    }

    knownSpellbookIds = ids.slice();
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
        li.textContent = slots[i] !== 0 ? skillDisplayName(slots[i]) : '— Empty —';
        // Re-apply the optimistic highlight after the per-tick text re-render.
        // Never highlight an empty slot (guards against a slot emptied while active).
        li.classList.toggle('activeSlot', activeSlotIndex === i && slots[i] !== 0);
    }
}

