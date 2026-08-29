import {describe, it, expect} from 'vitest';
import {playCssAnimation} from './Utils';

// playCssAnimation restarts a CSS animation by taking its class off and putting
// it back on. The contract this pins is what the UI-pass C5 metronome defect
// exposed (plan-ui-pass.md §5 C5 follow-up):
//
//   1. the re-add is SYNCHRONOUS. It used to be deferred to a
//      requestAnimationFrame, which leaves the restart to whether the engine
//      happens to run a style recalc between the removal and the re-add. Some
//      engines do, some do not; the deferred version is a coin flip and cannot
//      be tested from a task at all.
//   2. the class comes back OFF once the animation is over, so the element
//      rests in the class-absent state. A retained class replays the animation
//      on its own the next time the element is shown again (`display: none`
//      cancels a running animation and displaying it re-creates one) - a pulse
//      nobody asked for, and, on the beat pip, exactly the "spurious pulse
//      reads as broken" the BeatDetector's switch guard exists to prevent.
//
// ⚑ jsdom never RUNS a CSS animation, so `animationend` never fires by itself.
// The cleanup is pinned by dispatching the event, which is what the browser
// does when the real animation finishes.
describe('playCssAnimation', () => {
    const el = () => document.createElement('div');

    it('adds the class synchronously - not on the next animation frame', () => {
        const div = el();
        playCssAnimation(div, 'beatPulse');
        expect(div.classList.contains('beatPulse')).toBe(true);
    });

    it('restarts on a second call while the class is still on the element', () => {
        const div = el();
        div.classList.add('beatPulse');
        playCssAnimation(div, 'beatPulse');
        expect(div.classList.contains('beatPulse')).toBe(true);
    });

    it('takes the class back off when the animation ends', () => {
        const div = el();
        playCssAnimation(div, 'beatPulse');
        expect(div.classList.contains('beatPulse')).toBe(true); // not vacuous
        div.dispatchEvent(new Event('animationend'));
        expect(div.classList.contains('beatPulse')).toBe(false);
    });

    it('takes the class back off when the animation is cancelled', () => {
        // `display: none` on a running animation cancels it rather than ending
        // it - the pip's case every time its slot stops being the active one.
        const div = el();
        playCssAnimation(div, 'beatPulse');
        expect(div.classList.contains('beatPulse')).toBe(true); // not vacuous
        div.dispatchEvent(new Event('animationcancel'));
        expect(div.classList.contains('beatPulse')).toBe(false);
    });

    it('keeps exactly ONE cleanup listener across repeated replays', () => {
        // The superseded call's listener has to go, and it has to go BEFORE the
        // restart: cancelling the running animation delivers `animationcancel`
        // asynchronously, so a stale listener would arrive after the new class
        // is on and strip it straight back off. Two spellbook unlocks inside
        // one 5 s glow reach that. jsdom cannot stage the async cancel itself,
        // so what is pinned here is the property that prevents it.
        const div = el();
        let live = 0;
        const add = div.addEventListener.bind(div);
        const remove = div.removeEventListener.bind(div);
        div.addEventListener = ((t, l, o) => {
            if (t === 'animationcancel') live++;
            return add(t, l, o);
        }) as typeof div.addEventListener;
        div.removeEventListener = ((t, l, o) => {
            if (t === 'animationcancel') live--;
            return remove(t, l, o);
        }) as typeof div.removeEventListener;

        for (let i = 0; i < 5; i++) {
            playCssAnimation(div, 'unlockPulse');
        }
        expect(live).toBe(1);
        expect(div.classList.contains('unlockPulse')).toBe(true);
    });

    it('ignores animation events BUBBLING UP from children', () => {
        // `unlockPulse` is played on #spellbook, a panel whose children animate
        // on their own clocks - the `.unlocked` row glow and the C4b
        // `.breadcrumb` pulse. Those events bubble. A dwell that marks a row
        // seen removes `.breadcrumb`, which CANCELS an infinite animation on a
        // still-attached row; that cancel reaches the panel and would otherwise
        // strip the 5 s glow mid-flight and tear the cleanup down with it.
        const panel = el();
        const row = el();
        panel.appendChild(row);
        playCssAnimation(panel, 'unlockPulse');

        row.dispatchEvent(new Event('animationcancel', {bubbles: true}));
        expect(panel.classList.contains('unlockPulse')).toBe(true);
        row.dispatchEvent(new Event('animationend', {bubbles: true}));
        expect(panel.classList.contains('unlockPulse')).toBe(true);

        // ...and the panel's OWN end still cleans up - the child events must not
        // have removed the listeners either.
        panel.dispatchEvent(new Event('animationend'));
        expect(panel.classList.contains('unlockPulse')).toBe(false);
    });

    it('a later end event cannot strip the class off a fresh replay', () => {
        // The stale listener from pulse N must not fire on pulse N+1's start.
        const div = el();
        playCssAnimation(div, 'beatPulse');
        div.dispatchEvent(new Event('animationend'));
        playCssAnimation(div, 'beatPulse');
        expect(div.classList.contains('beatPulse')).toBe(true);
    });
});
