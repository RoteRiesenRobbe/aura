/**
 * The conversation panel's navigation model (plan-entity-model.md chunk 3b-ii).
 *
 * Deliberately DOM-free and PixiJS-free, the `SkillTooltip` /
 * `InteractBadgeTargeting` precedent: the interesting part is not the drawing,
 * it is the bookkeeping around a tree that the server re-sends every tick while
 * the client walks it locally.
 *
 * The division of labour (D16): the server owns AVAILABILITY — which rows exist,
 * which are locked, what each one replies — and the client owns POSITION. Only
 * taking a row goes back over the wire. That is what keeps server-side session
 * state to two fields with no node bookkeeping, and it is why navigating feels
 * instant.
 */

/** One clickable row. Mirrors the wire's ConversationOption. */
export interface ConversationRow {
    /**
     * ⚑ The AUTHORED indices, echoed back verbatim when the row is taken (L21).
     * The server omits already-known rows, so this row's position in `rows` is
     * NOT its position in the definition — echoing the position back would
     * teach the wrong skill, and only after the player had already learned
     * something.
     */
    optionIndex: number;
    /** 255 = this row only navigates. */
    grantIndex: number;
    text: string;
    /** Node to continue at; '' = none. */
    next: string;
    locked: boolean;
    requiredLevel: number;
    /** What the actor says when this row is taken. */
    reply: string;
    /**
     * Seconds of countdown confirmation before this row may be SENT; 0 (every
     * row but the ascension picks) means take it immediately.
     *
     * ⚑ Friction against a misclick, not a security control: the server applies
     * the row whenever it arrives, exactly as the delete endpoint does. This
     * only decides whether the panel makes the player wait first.
     */
    confirmSeconds: number;
}

export interface ConversationNode {
    id: string;
    lines: string[];
    rows: ConversationRow[];
}

/** The whole personalised tree, as one snapshot delivered it. */
export interface ConversationTree {
    entityId: number;
    actorName: string;
    entryNode: string;
    nodes: ConversationNode[];
}

/** 255 — the wire default for "this row hands over nothing". */
export const NO_GRANT = 255;

/** What the panel should draw right now; null = draw nothing. */
export interface ConversationView {
    actorName: string;
    /** The actor's lines for the current node, plus any reply already spoken. */
    lines: string[];
    rows: ConversationRow[];
    /** Whether a Back button belongs on screen (never authored — D15). */
    canGoBack: boolean;
    /**
     * Whether the synthetic "Leave." row belongs on screen: last, ONLY at the
     * root, where Back is absent (Q1 §4.3). Its handler must call leave() —
     * never take() — because it is not a server row and mutates nothing.
     */
    showLeave: boolean;
}

/**
 * Tracks where the player is inside a streamed tree.
 *
 * Lifecycle is entirely server-driven: `update()` is fed every snapshot, and the
 * panel closes because the tree went ABSENT, never because the client decided
 * to. Every server-side end condition — range, combat, death, disconnect —
 * therefore needs no counterpart here.
 */
export class ConversationModel {
    private tree: ConversationTree | null = null;
    private nodeId = '';
    /** Where Back goes. Automatic, never authored, so no dead ends exist. */
    private backStack: string[] = [];
    /**
     * The reply the actor gave to the row just taken, shown until the player
     * navigates. ⚑ Optimistic by design (L24): it is spoken from the row the
     * server already computed, one tick before the grant lands, and the two
     * cannot disagree because the same server computed both from the same
     * spellbook.
     */
    private spokenReply = '';
    /**
     * Whether the current node's own lines still belong UNDER the reply. True
     * only for a row that both granted and navigated (N1's client half): the
     * destination's lines are text the player has not read yet, so the answer
     * leads and the new node speaks below it. For a grant row that stays put the
     * reply replaces the greeting instead — see view().
     */
    private replyLeadsNode = false;

    /**
     * Apply a snapshot's conversation field.
     *
     * @param tree the streamed tree, or null when the field is absent
     * @returns true while a panel should be on screen
     */
    update(tree: ConversationTree | null): boolean {
        if (tree === null) {
            this.close();
            return false;
        }

        // A different actor (or a first open) restarts navigation; the same
        // actor's re-sent tree must NOT, or every tick would bounce the player
        // back to the greeting.
        if (this.tree === null || this.tree.entityId !== tree.entityId) {
            this.tree = tree;
            this.nodeId = tree.entryNode;
            this.backStack = [];
            this.spokenReply = '';
            this.replyLeadsNode = false;
            return true;
        }

        this.tree = tree;
        // The node can vanish under the player's feet — a condition that stopped
        // passing, most plausibly because they just learned something. Falling
        // back to the entry node beats rendering an empty panel. A standing reply
        // survives this exactly as it always has; only its lead-in role drops, so
        // the greeting does not surface under an answer to a row that is gone.
        if (!this.nodeById(this.nodeId)) {
            this.nodeId = tree.entryNode;
            this.backStack = [];
            this.replyLeadsNode = false;
        }
        return true;
    }

    /** What to draw; null = no panel. */
    view(): ConversationView | null {
        if (this.tree === null) {
            return null;
        }
        const node = this.nodeById(this.nodeId);
        if (!node) {
            return null;
        }
        return {
            actorName: this.tree.actorName,
            // The reply replaces the node's lines while it stands: the actor
            // answered, and showing the greeting underneath would read as if it
            // had not. The exception is a row that answered AND moved — there the
            // lines below are new, so the answer leads them (N1).
            lines: this.replyLines(node),
            rows: node.rows,
            canGoBack: this.backStack.length > 0,
            showLeave: this.backStack.length === 0,
        };
    }

    /** The actor this panel belongs to; 0 = none. */
    entityId(): number {
        return this.tree === null ? 0 : this.tree.entityId;
    }

    /** The node the player is on; '' = no panel. */
    currentNodeId(): string {
        return this.tree === null ? '' : this.nodeId;
    }

    /**
     * Take a row: speak its reply locally and follow its `next`, if any.
     *
     * Returns the row so the caller can send it — the model deliberately does no
     * I/O, which is what keeps it testable without a socket.
     */
    take(row: ConversationRow): ConversationRow {
        // Q1/R1: a locked row is INERT. The server presents it with an empty
        // reply and refuses the click silently; this guard is the client's half
        // of that twin, so nothing is spoken and nothing navigates even if a
        // stale tree carried a reply.
        if (row.locked) {
            return row;
        }
        this.spokenReply = row.reply;
        this.replyLeadsNode = false;
        if (row.next && this.nodeById(row.next)) {
            this.backStack.push(this.nodeId);
            this.nodeId = row.next;
            if (row.grantIndex === NO_GRANT) {
                // A pure navigation row has nothing to say — the destination node's
                // own lines take over.
                this.spokenReply = '';
            } else {
                // ⚑ N1: a row that both grants and navigates. This used to fall into
                // the branch above and swallow the grant's authored line, which is
                // the shape every quest turn-in has (reward plus follow-up node).
                this.replyLeadsNode = true;
            }
        }
        return row;
    }

    /** Pop the back-stack. No-op at the root, where Back is not drawn. */
    back(): void {
        this.spokenReply = '';
        this.replyLeadsNode = false;
        const previous = this.backStack.pop();
        if (previous !== undefined) {
            this.nodeId = previous;
        }
    }

    /**
     * Forget everything. ⚑ Called when the server drops the tree — NOT when the
     * player clicks Leave: that sends `close` and waits for the tree to go
     * absent, so the panel can never disagree with the server about whether a
     * conversation is open.
     */
    close(): void {
        this.tree = null;
        this.nodeId = '';
        this.backStack = [];
        this.spokenReply = '';
        this.replyLeadsNode = false;
    }

    /**
     * The lines to draw: the standing reply alone, the node's own lines, or —
     * for a row that granted and moved — the reply leading the new node's lines.
     */
    private replyLines(node: ConversationNode): string[] {
        if (!this.spokenReply) {
            return node.lines;
        }
        return this.replyLeadsNode ? [this.spokenReply, ...node.lines] : [this.spokenReply];
    }

    private nodeById(id: string): ConversationNode | null {
        return this.tree?.nodes.find((n) => n.id === id) ?? null;
    }
}
