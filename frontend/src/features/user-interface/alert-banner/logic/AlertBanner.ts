/**
 * AlertBanner (content pass C6): the single text-alert surface, at the top of
 * the screen (moved up out of the NPC speech bubbles in feedback pass B).
 * Four feeds share it: server-wide system messages (EntityMessage with entity
 * id 0 — boss kill/respawn beats, ANNOUNCE cheat), locally-detected spellbook
 * discoveries (HUD.updateSpellbook diff), locally-detected level-ups
 * (Player.updateFromBackend level diff), and blocked-action warnings
 * (HUD.rejectEquipInCombat).
 *
 * Messages queue and show one at a time; CSS transitions handle fade in/out.
 */

const SHOW_MS = 4500;
const FADE_MS = 400; // keep in sync with the transition in HUD.less

export type AlertKind = 'announce' | 'unlock' | 'levelup' | 'warning';

interface QueuedAlert {
    text: string;
    kind: AlertKind;
}

let bannerElement: HTMLElement = null;
let queue: QueuedAlert[] = [];
let showing = false;
let hideTimeout: ReturnType<typeof setTimeout> = null;

export function setup() {
    bannerElement = document.getElementById('alertBanner');
}

export function show(text: string, kind: AlertKind = 'announce') {
    if (bannerElement === null) return; // not set up (tests, early messages)
    queue.push({text, kind});
    if (!showing) {
        showNext();
    }
}

function showNext() {
    const next = queue.shift();
    if (next === undefined) {
        showing = false;
        return;
    }
    showing = true;

    bannerElement.textContent = next.text;
    bannerElement.className = 'visible ' + next.kind;

    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        bannerElement.classList.remove('visible');
        hideTimeout = setTimeout(showNext, FADE_MS);
    }, SHOW_MS);
}

// clear drops any pending alerts, e.g. on death/respawn screen transitions.
export function clear() {
    queue = [];
    showing = false;
    clearTimeout(hideTimeout);
    if (bannerElement !== null) {
        bannerElement.classList.remove('visible');
    }
}
