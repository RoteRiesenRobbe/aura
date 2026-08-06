import {AuraApi} from '../../AuraApi';

export class WelcomeMessage {

    serverName: string;
    mapWidth: number;
    mapHeight: number;
    totalDayCycleTicks: number;
    dayTimeTicks: number;
    zoneName: string;
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
        this.grayBase = welcome.grayBase();
        this.grayStep = welcome.grayStep();
    }
}
