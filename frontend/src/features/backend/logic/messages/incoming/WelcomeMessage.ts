import {BerryhunterApi} from '../../BerryhunterApi';

export class WelcomeMessage {

    serverName: string;
    mapRadius: number;
    totalDayCycleTicks: number;
    dayTimeTicks: number;

    /**
     *
     * @param {BerryhunterApi.Welcome} welcome
     */
    constructor(welcome) {
        this.serverName = welcome.serverName();
        this.mapRadius = welcome.mapRadius();
        this.totalDayCycleTicks = Number(welcome.totalDaycycleTicks());
        this.dayTimeTicks = Number(welcome.dayTimeTicks());
    }
}
