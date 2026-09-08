import {AuraApi} from '../../AuraApi';

export class WelcomeMessage {

    serverName: string;
    mapWidth: number;
    mapHeight: number;
    totalDayCycleTicks: number;
    dayTimeTicks: number;
    zoneName: string;
    // Every zone the server LOADED, primary first (plan-underworld.md U2).
    // zoneName above stays the primary one, so every existing consumer is
    // unchanged. The client already bundles every zone file, so this only says
    // which of them are real this boot — WHERE the player is comes from their
    // own position, never from the wire.
    zoneNames: string[];
    // The kill-XP gray knobs the nameplate tint derives its gray boundary from
    // (plan-world-replacement.md C0). Static conf, hence Welcome and not the
    // per-tick snapshot; the resolved distance depends on the player's level
    // and is computed client-side so it cannot go stale on a level-up.
    grayBase: number;
    grayStep: number;

    /**
     *
     * @param {AuraApi.Welcome} welcome
     */
    constructor(welcome) {
        this.serverName = welcome.serverName();
        this.mapWidth = welcome.mapWidth();
        this.mapHeight = welcome.mapHeight();
        this.totalDayCycleTicks = Number(welcome.totalDaycycleTicks());
        this.dayTimeTicks = Number(welcome.dayTimeTicks());
        this.zoneName = welcome.zoneName();
        this.zoneNames = [];
        for (let i = 0; i < welcome.zoneNamesLength(); i++) {
            this.zoneNames.push(welcome.zoneNames(i));
        }
        // A server older than this field, or one that loaded a single zone the
        // pre-U2 way, sends an empty vector. Falling back to the primary keeps
        // "the list of zones to render" always non-empty, so no consumer needs
        // a second code path for "no zones".
        if (this.zoneNames.length === 0 && this.zoneName) {
            this.zoneNames = [this.zoneName];
        }
        this.grayBase = welcome.grayBase();
        this.grayStep = welcome.grayStep();
    }
}
