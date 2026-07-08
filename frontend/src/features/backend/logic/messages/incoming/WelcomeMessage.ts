import {BerryhunterApi} from '../../BerryhunterApi';

export class WelcomeMessage {

    serverName: string;
    mapWidth: number;
    mapHeight: number;
    totalDayCycleTicks: number;
    dayTimeTicks: number;

    /**
     *
     * @param {BerryhunterApi.Welcome} welcome
     */
    constructor(welcome) {
        this.serverName = welcome.serverName();
        this.mapWidth = welcome.mapWidth();
        this.mapHeight = welcome.mapHeight();
        this.totalDayCycleTicks = Number(welcome.totalDaycycleTicks());
        this.dayTimeTicks = Number(welcome.dayTimeTicks());
    }
}
