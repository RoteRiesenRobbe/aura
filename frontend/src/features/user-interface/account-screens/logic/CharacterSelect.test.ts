import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

/**
 * The slot cards (plan-ascension.md §12.12, D22/D23/D15).
 *
 * ⚑ THIS DRIVES THE REAL `render`, not an extracted lookalike, and that is the
 * whole point of the file. The bug C2b exists to fix lived in the DOM-building
 * loop — the create affordance went to the FIRST empty slot, so ascending slot 2
 * while slot 0 sat empty aimed the heir at slot 0, cut off from the bloodline it
 * was just granted. A pure "which slot gets a card" module extracted around that
 * loop would be a second implementation that cannot fail the way the product
 * did.
 *
 * `CharacterSelect` imports exactly two things, which is what makes driving it
 * cheap: AccountScreens (mocked to a fixture panel, because the real one reaches
 * a document the app builds at boot) and DeleteDialog (never opened here).
 */

vi.mock('./AccountScreens', () => {
    const panels = new Map<string, HTMLElement>();
    return {
        element: (id: string): HTMLElement => {
            let panel = panels.get(id);
            if (!panel) {
                panel = document.createElement('div');
                if (id === 'characterSelect') {
                    panel.innerHTML = '<div class="slotCards"></div>'
                        + '<p class="playingWarning hidden"></p>';
                }
                panels.set(id, panel);
            }
            return panel;
        },
        clearError: vi.fn(),
        showError: vi.fn(),
        showPanel: vi.fn(),
        setFormBusy: vi.fn(),
        whenReady: vi.fn(),
    };
});
vi.mock('./DeleteDialog', () => ({open: vi.fn()}));

// ⚑ Mocked so this file asserts the WIRING (gifts render through the display-name
// lookup) rather than Skills.ts's own fallback rule, which has its own test.
vi.mock('../../../../client-data/Skills', () => ({
    skillDisplayNameFor: (key: string) => (key === 'FrostShield' ? 'Frost Shield' : key),
}));

import * as AccountScreens from './AccountScreens';
import * as CharacterSelect from './CharacterSelect';
import {Character, CharacterList, SlotBloodline} from '../../../accounts/logic/AccountsApi';

const aSession = {hasAccount: true, registered: true, hasProgress: true, playingCharacterId: 0};

function aCharacter(slotIndex: number, name: string): Character {
    return {
        id: slotIndex + 100,
        slotIndex,
        name,
        avatar: 'default',
        faction: 'aligned',
        level: 30,
        experience: 0,
        createdAt: '2026-08-10T00:00:00Z',
    };
}

function aBloodline(slotIndex: number, over: Partial<SlotBloodline> = {}): SlotBloodline {
    return {
        slotIndex, unlocks: [], ascensions: 0, ...over,
    };
}

function aList(characters: Character[], slots: SlotBloodline[]): CharacterList {
    return {characters, maxAliveCharacters: 3, slots};
}

function cards(): HTMLElement[] {
    const container = AccountScreens.element('characterSelect')
        .querySelector('.slotCards') as HTMLElement;
    return Array.from(container.children) as HTMLElement[];
}

let created: Array<{ characterCount: number, slotIndex: number }>;

beforeEach(() => {
    created = [];
    CharacterSelect.setup({
        onPlay: () => undefined,
        onCreate: (characterCount, slotIndex) => created.push({characterCount, slotIndex}),
        onLoggedOut: () => undefined,
        onLoginRequested: () => undefined,
    });
});

afterEach(() => vi.clearAllMocks());

describe('an empty slot that continues a bloodline', () => {
    it('names the life it continues, what it cost and what it hands over', () => {
        CharacterSelect.show(aList(
            [aCharacter(0, 'Wilma')],
            [
                aBloodline(0),
                aBloodline(1, {ascensions: 1, unlocks: ['FrostShield'], predecessorName: 'Grimwald'}),
                aBloodline(2),
            ],
        ), aSession);

        const card = cards()[1];
        expect(card.textContent).toContain('Continue the bloodline of Grimwald');
        expect(card.textContent).toContain('1 life spent');
        // ⚑ The DISPLAY name, never the unlock key — the key is a registry id
        // (D17) and no player has ever seen one.
        expect(card.textContent).toContain('Frost Shield');
        expect(card.textContent).not.toContain('FrostShield');
    });

    it('counts more than one spent life', () => {
        CharacterSelect.show(aList([], [
            aBloodline(0, {ascensions: 2, unlocks: ['FrostShield', 'Paralyze'], predecessorName: 'Grimwald'}),
            aBloodline(1), aBloodline(2),
        ]), aSession);

        expect(cards()[0].textContent).toContain('2 lives spent');
        expect(cards()[0].textContent).toContain('Frost Shield, Paralyze');
    });

    /**
     * ⛑ D11'S PRIVACY LANDMINE, and D24's answer to it. DiscardAnonymousAccount
     * renames every row of an account to 'deleted_' || id, sacrificed ones
     * included, so the server omits an erased name entirely. The card must then
     * drop the sentence rather than print "the bloodline of undefined" — and it
     * still says everything that is not a person's name.
     */
    it('drops the name when there is none, and keeps the rest', () => {
        CharacterSelect.show(aList([], [
            aBloodline(0, {ascensions: 1, unlocks: ['FrostShield']}),
            aBloodline(1), aBloodline(2),
        ]), aSession);

        const card = cards()[0];
        expect(card.textContent).toContain('Continue this bloodline');
        expect(card.textContent).not.toContain('undefined');
        expect(card.textContent).toContain('1 life spent');
        expect(card.textContent).toContain('Frost Shield');
    });

    it('is still an ordinary create card', () => {
        CharacterSelect.show(aList([], [
            aBloodline(0, {ascensions: 1, predecessorName: 'Grimwald'}),
            aBloodline(1), aBloodline(2),
        ]), aSession);

        cards()[0].dispatchEvent(new Event('pointerdown'));
        expect(created).toEqual([{characterCount: 0, slotIndex: 0}]);
    });
});

describe('a slot with no history', () => {
    it('offers the plain create card and claims no bloodline', () => {
        CharacterSelect.show(aList([], [aBloodline(0), aBloodline(1), aBloodline(2)]), aSession);

        const card = cards()[0];
        expect(card.textContent).toContain('Create character');
        expect(card.textContent).not.toContain('bloodline');
        // ⚑ A first life is NOT a bloodline. Without this the account every
        // player starts with would print "1st life · 0 gifts" on every card.
        expect(card.textContent).not.toContain('life');
    });

    it('says nothing on an occupied card either', () => {
        CharacterSelect.show(aList([aCharacter(0, 'Wilma')],
            [aBloodline(0), aBloodline(1), aBloodline(2)]), aSession);

        expect(cards()[0].textContent).toContain('Wilma');
        expect(cards()[0].textContent).not.toContain('life');
        expect(cards()[0].textContent).not.toContain('gift');
    });
});

/** D23: the PO widened D22's empty-slot card to every card. */
describe('an occupied slot whose bloodline has a history', () => {
    it('counts the life it is and the gifts it inherited', () => {
        CharacterSelect.show(aList([aCharacter(0, 'Wilma')], [
            aBloodline(0, {ascensions: 1, unlocks: ['FrostShield'], predecessorName: 'Grimwald'}),
            aBloodline(1), aBloodline(2),
        ]), aSession);

        const card = cards()[0];
        expect(card.textContent).toContain('2nd life');
        expect(card.textContent).toContain('1 gift');
        // The living character's own spellbook answers "what do I know"; the
        // card is the densest element on the screen and only carries counts.
        expect(card.textContent).not.toContain('Frost Shield');
    });

    it('counts a third life as a third life', () => {
        CharacterSelect.show(aList([aCharacter(0, 'Wilma')], [
            aBloodline(0, {ascensions: 2, unlocks: ['FrostShield', 'Paralyze']}),
            aBloodline(1), aBloodline(2),
        ]), aSession);

        expect(cards()[0].textContent).toContain('3rd life');
        expect(cards()[0].textContent).toContain('2 gifts');
    });

    /**
     * ⚑ D14: an ascension against an exhausted catalog commits with NO unlock,
     * so a slot can genuinely have spent a life and hold nothing. The card must
     * not then say "0 gifts", which reads as a bug rather than as a fact.
     */
    it('omits the gift count when a spent life bought nothing', () => {
        CharacterSelect.show(aList([aCharacter(0, 'Wilma')], [
            aBloodline(0, {ascensions: 1}), aBloodline(1), aBloodline(2),
        ]), aSession);

        expect(cards()[0].textContent).toContain('2nd life');
        expect(cards()[0].textContent).not.toContain('gift');
    });
});

/**
 * ⚑ A client that is newer than its server, or older, must still draw this
 * screen — it is the one screen with no way back. `decodeBody` refuses
 * DisallowUnknownFields for the same reason in the other direction.
 */
describe('a server that sends no slots at all', () => {
    it('renders the screen anyway', () => {
        const list = {characters: [aCharacter(0, 'Wilma')], maxAliveCharacters: 3} as CharacterList;
        expect(() => CharacterSelect.show(list, aSession)).not.toThrow();
        expect(cards()).toHaveLength(3);
        expect(cards()[0].textContent).toContain('Wilma');
    });
});

/**
 * ⭐ D15's CLIENT HALF, and the reason C2b exists.
 *
 * ⛑ THE OLD RENDER OFFERED CREATION IN THE FIRST EMPTY SLOT ONLY. Ascend the
 * character in slot 1 while slot 0 sits empty and the single card on offer aimed
 * at slot 0 — so the heir landed in a slot with no history, permanently cut off
 * from the unlocks its predecessor had just bought. It was invisible in every
 * playtest because the harness character always occupied slot 0, which is
 * exactly why the fixture below puts the living character in the MIDDLE.
 */
describe('every empty slot', () => {
    it('offers creation, and each card aims at its own slot', () => {
        CharacterSelect.show(aList([aCharacter(1, 'Wilma')], [
            aBloodline(0),
            aBloodline(1),
            aBloodline(2, {ascensions: 1, unlocks: ['FrostShield'], predecessorName: 'Grimwald'}),
        ]), aSession);

        expect(cards()[0].textContent).toContain('Create character');
        expect(cards()[1].textContent).toContain('Wilma');
        expect(cards()[2].textContent).toContain('Continue the bloodline of Grimwald');

        cards()[2].dispatchEvent(new Event('pointerdown'));
        cards()[0].dispatchEvent(new Event('pointerdown'));
        expect(created.map((c) => c.slotIndex)).toEqual([2, 0]);
    });

    /**
     * ⛑ THE FIXTURE IS ODD ON PURPOSE, AND THE OBVIOUS ONE ASSERTS NOTHING.
     * "Three characters at the cap of three" cannot reach the at-cap branch at
     * all: every slot the loop visits holds a character, so it never asks
     * whether creation is on offer, and the test passes with the guard deleted.
     * (Measured — the mutation survived it.)
     *
     * The ONE way an empty slot coexists with a full account is a cap that was
     * lowered under characters that already exist: `maxAliveCharacters` 4 → 3 in
     * conf leaves someone with a character in slot 3, which this screen cannot
     * draw, while slot 2 sits empty. Offering creation there would be offering
     * an action the server answers with slots_full.
     */
    it('offers nothing when the account is full but a drawable slot is empty', () => {
        CharacterSelect.show(aList(
            [aCharacter(0, 'Wilma'), aCharacter(1, 'Betty'), aCharacter(3, 'Pearl')],
            [aBloodline(0), aBloodline(1), aBloodline(2)],
        ), aSession);

        expect(cards()[2].textContent).not.toContain('Create character');
        cards().forEach((card) => card.dispatchEvent(new Event('pointerdown')));
        expect(created).toHaveLength(0);
    });
});
