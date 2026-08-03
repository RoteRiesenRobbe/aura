//  Resets a Key object's press state back to released.
//  Optionally resets the keyCode as well.
//
//  Deliberately leaves the configuration fields (preventDefault, enabled)
//  alone: the inherited Phaser version forced preventDefault to false, which
//  contradicts Key's own constructor default of true — a swept movement key
//  would have started scrolling the page on its next press.
export function ResetKey(key, clearKeyCode = false) {
    key.isDown = false;
    key.isUp = true;
    key.altKey = false;
    key.ctrlKey = false;
    key.shiftKey = false;
    key.timeDown = 0;
    key.duration = 0;
    key.timeUp = 0;
    key.repeats = 0;
    key._justDown = false;
    key._justUp = false;

    if (clearKeyCode) {
        key.keyCode = 0;
        key.char = '';
    }

    return key;
}
