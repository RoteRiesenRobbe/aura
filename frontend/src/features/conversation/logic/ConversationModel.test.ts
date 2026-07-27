import {describe, it, expect} from 'vitest';
import {ConversationModel, ConversationRow, ConversationTree, NO_GRANT} from './ConversationModel';

function row(partial: Partial<ConversationRow>): ConversationRow {
    return {
        optionIndex: 0,
        grantIndex: NO_GRANT,
        text: 'row',
        next: '',
        locked: false,
        requiredLevel: 0,
        reply: '',
        ...partial,
    };
}

/** The PO brief's tree: a greeting, a hint branch, and a teaching list. */
function tree(overrides: Partial<ConversationTree> = {}): ConversationTree {
    return {
        entityId: 42,
        actorName: 'Emberkeeper',
        entryNode: 'root',
        nodes: [
            {
                id: 'root',
                lines: ['Fire remembers who feeds it.'],
                rows: [
                    row({optionIndex: 0, text: 'Teach me something.', next: 'teachings'}),
                    row({optionIndex: 1, text: 'Anything new around here?', next: 'news'}),
                ],
            },
            {
                id: 'teachings',
                lines: ['What would you have of the flame?'],
                rows: [
                    row({optionIndex: 0, grantIndex: 0, text: 'Torch', reply: 'A light in dark places.'}),
                    row({
                        optionIndex: 0, grantIndex: 2, text: 'Immolate', locked: true, requiredLevel: 12,
                        reply: "Fire doesn't suffer the careless.",
                    }),
                ],
            },
            {id: 'news', lines: ['They burned this forest to hide their camp.'], rows: []},
        ],
        ...overrides,
    };
}

describe('ConversationModel', () => {
    it('opens at the entry node', () => {
        const m = new ConversationModel();

        expect(m.update(tree())).toBe(true);
        const view = m.view();
        expect(view?.actorName).toBe('Emberkeeper');
        expect(view?.lines).toEqual(['Fire remembers who feeds it.']);
        expect(view?.rows).toHaveLength(2);
        expect(view?.canGoBack).toBe(false);
    });

    it('draws nothing before a tree arrives', () => {
        expect(new ConversationModel().view()).toBeNull();
    });

    it('follows next and pushes the back-stack', () => {
        const m = new ConversationModel();
        m.update(tree());

        m.take(m.view()!.rows[0]); // "Teach me something."

        expect(m.currentNodeId()).toBe('teachings');
        expect(m.view()?.lines).toEqual(['What would you have of the flame?']);
        expect(m.view()?.canGoBack).toBe(true);
    });

    it('pops back to where it came from', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);

        m.back();

        expect(m.currentNodeId()).toBe('root');
        expect(m.view()?.canGoBack).toBe(false);
    });

    it('ignores Back at the root, where it is not drawn', () => {
        const m = new ConversationModel();
        m.update(tree());

        m.back();

        expect(m.currentNodeId()).toBe('root');
    });

    // ⚑ L24: the actor answers on click, out of the row the server already
    // computed — before the grant has landed anywhere.
    it('speaks a grant row reply in place of the node lines', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]); // to "teachings"

        m.take(m.view()!.rows[0]); // "Torch"

        expect(m.view()?.lines).toEqual(['A light in dark places.']);
        expect(m.currentNodeId()).toBe('teachings');
    });

    it('speaks a locked row refusal and stays put', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);

        const taken = m.take(m.view()!.rows[1]); // "Immolate", locked

        expect(taken.locked).toBe(true);
        expect(m.view()?.lines).toEqual(["Fire doesn't suffer the careless."]);
        expect(m.currentNodeId()).toBe('teachings');
    });

    it('clears a spoken reply on navigation', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);
        m.take(m.view()!.rows[0]); // speaks
        m.back();

        expect(m.view()?.lines).toEqual(['Fire remembers who feeds it.']);
    });

    // ⚑ The rule the whole lifecycle rests on: the panel closes because the
    // server stopped sending the tree, never on the client's own say-so. Every
    // server-side end condition — range, combat, death, disconnect — arrives
    // here as exactly this.
    it('closes when the conversation goes absent from the snapshot', () => {
        const m = new ConversationModel();
        m.update(tree());

        expect(m.update(null)).toBe(false);
        expect(m.view()).toBeNull();
        expect(m.entityId()).toBe(0);
    });

    // ⚑ The tree is re-sent every tick. If a re-send reset navigation, the panel
    // would snap back to the greeting ~30×/second and be unusable.
    it('keeps its position when the same actor re-sends the tree', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);

        m.update(tree());

        expect(m.currentNodeId()).toBe('teachings');
        expect(m.view()?.canGoBack).toBe(true);
    });

    it('restarts navigation for a different actor', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);

        m.update(tree({entityId: 99, actorName: 'Town Crier'}));

        expect(m.currentNodeId()).toBe('root');
        expect(m.view()?.actorName).toBe('Town Crier');
        expect(m.view()?.canGoBack).toBe(false);
    });

    // A taught row disappears from the next snapshot (the server rebuilds the
    // tree every tick), and the panel must simply show one fewer row.
    it('drops a row the server stopped sending', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);
        expect(m.view()?.rows).toHaveLength(2);

        const learned = tree();
        learned.nodes[1].rows = [learned.nodes[1].rows[1]]; // Torch is known now

        m.update(learned);

        expect(m.view()?.rows).toHaveLength(1);
        expect(m.view()?.rows[0].text).toBe('Immolate');
    });

    // A node can stop passing its conditions under the player's feet. Falling
    // back to the entry node beats rendering an empty panel.
    it('falls back to the entry node when the current one vanishes', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);

        const pruned = tree();
        pruned.nodes = pruned.nodes.filter((n) => n.id !== 'teachings');
        m.update(pruned);

        expect(m.currentNodeId()).toBe('root');
        expect(m.view()?.canGoBack).toBe(false);
    });

    // ⚑ L21 at the client boundary: what is echoed back is the row's AUTHORED
    // indices, never its position on screen. Here the only visible row carries
    // grant index 2.
    it('hands back the authored indices, not the row position', () => {
        const m = new ConversationModel();
        const learned = tree();
        learned.nodes[1].rows = [learned.nodes[1].rows[1]];
        m.update(learned);
        m.take(m.view()!.rows[0]); // navigate to teachings

        const taken = m.take(m.view()!.rows[0]); // the ONLY row, at position 0

        expect(taken.optionIndex).toBe(0);
        expect(taken.grantIndex).toBe(2);
    });

    // ⚑ The panel skips re-rendering when the view is unchanged, and it decides
    // that by comparing JSON.stringify(view) between ticks. That only works if
    // an unchanged conversation produces an identical view — which the server
    // re-sending the same tree every tick must not disturb.
    //
    // Why it matters: without the skip the row list is rebuilt ~30×/second,
    // `:hover` never survives, and a click can land between the old <li> being
    // detached and the new one appearing. That dropped clicks on roughly half of
    // the in-game harness runs before the skip existed.
    it('produces a stable view across identical re-sends', () => {
        const m = new ConversationModel();
        m.update(tree());
        const first = JSON.stringify(m.view());

        m.update(tree());
        m.update(tree());

        expect(JSON.stringify(m.view())).toBe(first);
    });

    it('produces a DIFFERENT view once something actually changes', () => {
        const m = new ConversationModel();
        m.update(tree());
        m.take(m.view()!.rows[0]);
        const atList = JSON.stringify(m.view());

        const learned = tree();
        learned.nodes[1].rows = [learned.nodes[1].rows[1]];
        m.update(learned);

        expect(JSON.stringify(m.view())).not.toBe(atList);
    });

    it('renders a leaf reply node with lines and no rows', () => {
        const m = new ConversationModel();
        m.update(tree());

        m.take(m.view()!.rows[1]); // "Anything new around here?"

        expect(m.currentNodeId()).toBe('news');
        expect(m.view()?.lines).toEqual(['They burned this forest to hide their camp.']);
        expect(m.view()?.rows).toEqual([]);
        expect(m.view()?.canGoBack).toBe(true);
    });
});
