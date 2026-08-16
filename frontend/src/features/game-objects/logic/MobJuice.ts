import {sound} from '@pixi/sound';
import * as PIXI from 'pixi.js';
import {registerPreload} from '../../core/logic/Preloading';

PIXI.Assets.add({alias: 'mobHit', src: require('../assets/mobs/348241__newagesoup__punch-boxing-04.mp3')});
PIXI.Assets.add({alias: 'titanium-shard-hit', src: require('../assets/mobs/760566__noisyredfox__pickaxe2.mp3')});


// noinspection JSIgnoredPromiseFromCall
registerPreload(PIXI.Assets.load('mobHit'));
registerPreload(PIXI.Assets.load('titanium-shard-hit'));
