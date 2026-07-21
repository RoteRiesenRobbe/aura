import {AuraApi} from '../../AuraApi';

export class WelcomeMessage {

    serverName: string;
    mapWidth: number;
    mapHeight: number;
    totalDayCycleTicks: number;
    dayTimeTicks: number;
    zoneName: string;

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
    }
}
