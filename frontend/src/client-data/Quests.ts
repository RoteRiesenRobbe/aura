// Quest catalog (plan-quests.md chunk C3, D14): per-quest title and per-stage
// diary prose, fetched once at startup from the aurad HTTP sidecar (GET
// /quests) — the same contract as the skill and mob catalogs. The wire carries
// only ids (GameState.quest_progress: quest id + the walked stage path), so
// this is where the journal's words come from.
//
// ⚑ The degrade is EXPLICIT, unlike the other two catalogs. A missing skill name
// renders as "Skill #7" and a missing mob name hides a nameplate, but a journal
// with no words is indistinguishable from a journal with no quests — so the
// fetch state is tracked and the panel says "journal unavailable" instead of
// quietly showing an empty diary to somebody mid-quest.

import {catalogUrl} from '../features/backend/logic/Urls';

export interface QuestStageDefinition {
    id: string;
    /** The diary text appended when this stage is entered. */
    journal: string;
}

export interface QuestDefinition {
    id: string;
    title: string;
    stages: QuestStageDefinition[];
}

/**
 * 'loading' until the fetch settles, then 'ready' (even for an empty world —
 * a server with no authored quests serves `[]`) or 'unavailable'.
 */
export type CatalogState = 'loading' | 'ready' | 'unavailable';

const catalog = new Map<string, QuestDefinition>();
let state: CatalogState = 'loading';

export function loadQuestCatalog(): Promise<void> {
    return fetch(catalogUrl('quests'))
        .then(response => {
            if (!response.ok) {
                throw new Error(`GET /quests returned ${response.status}`);
            }
            return response.json();
        })
        .then((definitions: QuestDefinition[]) => {
            catalog.clear();
            for (const def of definitions) {
                catalog.set(def.id, def);
            }
            state = 'ready';
        })
        .catch(error => {
            state = 'unavailable';
            console.warn('Quest catalog unavailable — the journal cannot render its entries', error);
        });
}

// Fetched once at startup; the journal renders its unavailable state until then.
loadQuestCatalog();

export function catalogState(): CatalogState {
    return state;
}

export function questDefinition(id: string): QuestDefinition | undefined {
    return catalog.get(id);
}

/**
 * The diary text of one stage. Returns undefined for a stage the catalog does
 * not know — which is a real case, not a defensive one: a server restarted with
 * edited content can carry a ledger naming a stage this catalog never saw.
 */
export function stageJournal(questId: string, stageId: string): string | undefined {
    return catalog.get(questId)?.stages.find(s => s.id === stageId)?.journal;
}
