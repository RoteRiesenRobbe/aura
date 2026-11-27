import * as PIXI from 'pixi.js';
import {registerPreload} from '../../core/logic/Preloading';
import {spatialAudio} from '../../audio/logic/SpatialAudio';
import {random} from '../../common/logic/Utils';
import {Vector} from '../../core/logic/Vector';

PIXI.Assets.add({alias: 'mobHit', src: require('../assets/mobs/348241__newagesoup__punch-boxing-04.mp3')});
PIXI.Assets.add({alias: 'titanium-shard-hit', src: require('../assets/mobs/760566__noisyredfox__pickaxe2.mp3')});


// noinspection JSIgnoredPromiseFromCall
registerPreload(PIXI.Assets.load('mobHit'));
registerPreload(PIXI.Assets.load('titanium-shard-hit'));

/** The generic hit, at the struck entity (audio/logic/HitSounds decides when). */
export function playHitSound(position: Vector) {
    spatialAudio.play('mobHit', Vector.clone(position), {
        volume: random(0.3, 0.4),
        speed: random(0.9, 1.5),
    });
}
