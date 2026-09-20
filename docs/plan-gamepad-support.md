# Plan: Gamepad / Controller Support

> **Status: DESIGNED, NOTHING BUILT (2026-09-16).** All numbers **[PLACEHOLDER]**
> unless marked measured.
>
> ⭐ **Context:** *Aura* has **no manual aiming** (`roadmap.md` §11): combat is
> proximity- and positioning-driven, and abilities hit targets automatically
> based on authored selector rules (`nearest`, `lowest_health`). The backend
> already accepts continuous 2D float movement vectors (`phy.Vec2f {X, Y}`
> normalized via `input2vec()`, proven by the mobile virtual joystick). This
> makes gamepad support a natural, high-leverage addition that requires zero
> backend changes.
>
> ⚑ **Browser Standard:** Built on the native [Web Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
> (`navigator.getGamepads()`), requiring **zero runtime dependencies**. Standard
> 16-button + 4-axis mapping (`StandardGamepad` layout) works out-of-the-box
> across Xbox, PlayStation (DualShock / DualSense), Switch Pro, and standard HID
> controllers on modern browsers.
>
> ⛔ **Scope boundary:** Gamepad input operates on the client side only. No new
> wire fields, no server modifications, no database schema changes.

---

## 1. What this is

A native controller integration providing analog stick movement, discrete face
button aura selection, shoulder-button cooldown firing, D-pad utility/menu
toggles, and a virtual cursor for HTML overlay navigation.

| Chunk | What | Purity / Verification |
|---|---|---|
| **G1** | `GamepadManager.ts` + `Controls.ts` polling: left stick movement, face button auras (X, Y, B), interact (A), shoulder cooldowns (LB, RB, RT), D-pad utilities (Camp, Recall) & menus (Journal, Map), Start button (Spellbook), and `InputModeChangedEvent` (`ActiveInputMode` with `onChange`). | **Pure logic testable under vitest** with mocked `Gamepad` snapshots; in-game movement check. |
| **G2** | UI navigation via **Virtual Cursor**: right stick moves a hardware-independent virtual cursor over HTML overlays (Spellbook, Quests, Conversation options); trigger / button click simulation; Escape / B cancel. | **Browser harness / In-game**; DOM click dispatch. |
| **G3** | HUD glyphs & feedback: dynamic button prompt swaps (`[E]` $\rightarrow$ `[A]`, `[Q]` $\rightarrow$ `[LB]`, `[1-3]` $\rightarrow$ `[X/Y/B]`), controller connect/disconnect toast feedback, and optional rumble/haptics (`vibrationActuator`). | **Browser harness / In-game**. |

⭐ **G1 delivers a 100 % playable game in combat and exploration.** G2 closes the
loop for full couch play without touching the mouse.

---

## 2. Decision ledger

| | Decision | Status | Rationale |
|---|---|---|---|
| **D1** | **Aura Slots map directly to face buttons: X = Slot 1, Y = Slot 2, B = Slot 3.** | PO-RULED | Direct access mirrors keyboard hotkeys (1, 2, 3). The top, left, and right face buttons form a natural cluster around the thumb. Instantaneous one-button switching outranks cycling. |
| **D2** | **Cooldown Slots map to bumpers and triggers: LB = Cooldown 1 (Q), RB = Cooldown 2 (R), RT = Cooldown 3 (F).** | PO-RULED | Keeps fingers on combat abilities while thumb remains on the left analog stick. RT is used for slot 3; LT is reserved for alternate utility / modifier. |
| **D3** | **Interact verb (`E`) stays on primary action button: A.** | PO-RULED | Standard game convention: bottom face button (A / ✕) is primary interaction/confirmation. One press talks to the interactable actor in range; in menus/dialogues, A selects/confirms; second press leaves conversation (`Interact.trigger()`). |
| **D4** | **Spellbook (`B`) maps to the `Start` / Menu button.** | PO-RULED | *Aura* has no pause menu (real-time MMO), and Escape has no gameplay action beyond closing panels; the Spellbook is the primary character loadout panel. |
| **D5** | **D-Pad owns baseline utilities and secondary UI menus:** D-Pad Left = Camp, D-Pad Right = Recall, D-Pad Up = Journal (`J`), D-Pad Down = Full-screen Map (`M`). | PO-RULED | Cleanly hosts the un-slotted baseline utilities (`Utilities.ts`) and primary navigation tools without cluttering face buttons. |
| **D6** | **UI navigation uses a Virtual Cursor in Phase 1 (Chunk G2).** | PO-RULED | The HTML panels (Spellbook skill assignment, Quest scrolling) are mouse-driven DOM. A right-stick virtual cursor is the fastest path to full controller accessibility without rewriting UI layouts. |
| **D7** | **Edge-triggered button tracking is mandatory.** | FORCED | Gamepad buttons are polled at 33 ms (`INPUT_TICKRATE`). Without tracking previous-frame down state, a held button would fire slot toggles or interact calls 30 times a second. |
| **D8** | **Automatic input mode detection with an `onChange` event.** | PO-RULED | An explicit `ActiveInputMode` (`'KEYBOARD_MOUSE' | 'GAMEPAD' | 'TOUCH'`) emits `InputModeChangedEvent` on change. Stick deflection or pad press switches seamlessly to `'GAMEPAD'`; mouse move or keystroke restores `'KEYBOARD_MOUSE'`. |

---

## 3. Control Mapping Matrix

Standard Gamepad Layout (Xbox / PlayStation equivalent):

```
                       [LB: Cooldown 1]                 [RB: Cooldown 2]
                       [LT: (Reserved)]                 [RT: Cooldown 3]
                              \                               /
       [D-Pad Up: Journal]    ---------------------------------    [Y: Aura 2]
   [D-Pad Left: Camp]       /   [Back: Map]      [Start: Book]  \   [X: Aura 1]    [B: Aura 3]
       [D-Pad Down: Map]   |                                     |         [A: Interact]
   [D-Pad Right: Recall]   |   (L Stick: Move)   (R Stick: Cursor)|
                            \                                   /
                             -----------------------------------
```

### Detailed Binding Reference

| Controller Input | Target Action | Underlying Code Seam |
| :--- | :--- | :--- |
| **Left Stick** | Character Movement | `movement = new Vector(axisX, axisY)` $\rightarrow$ `InputMessage.movement` |
| **Button X** (West) | Active Aura Slot 1 | `HUD.hotkeyAuraSlot(0)` |
| **Button Y** (North) | Active Aura Slot 2 | `HUD.hotkeyAuraSlot(1)` |
| **Button B** (East) | Active Aura Slot 3 | `HUD.hotkeyAuraSlot(2)` |
| **Button A** (South) | Interact / Talk / Confirm | `Interact.trigger(Game.getInteractableEntityId())` |
| **LB** (L1) | Cooldown Slot 1 | `HUD.hotkeyCooldownSlot(0)` |
| **RB** (R1) | Cooldown Slot 2 | `HUD.hotkeyCooldownSlot(1)` |
| **RT** (R2) | Cooldown Slot 3 | `HUD.hotkeyCooldownSlot(2)` |
| **Start** (Menu) | Toggle Spellbook | `Spellbook.toggle()` |
| **Back** (View / Select) | Toggle Full-screen Map | `Game?.miniMap?.toggle()` |
| **D-Pad Left** | Baseline Camp | `Utilities.trigger(AuraApi.UtilityKind.Camp)` |
| **D-Pad Right** | Baseline Recall | `Utilities.trigger(AuraApi.UtilityKind.Recall)` |
| **D-Pad Up** | Toggle Journal | `Journal.toggle()` |
| **D-Pad Down** | Toggle Full-screen Map | `Game?.miniMap?.toggle()` |
| **Right Stick** | Move Virtual Cursor | G2: updates virtual cursor screen coordinates |
| **A / RT** (in menus) | Cursor Click | G2: dispatches `pointerdown` / `click` on element under cursor |

---

## 4. Architecture & Implementation

### 4.1 G1: Core Gameplay & Movement

#### Polling in `Controls.ts`
The Web Gamepad API does not emit event streams for button presses or stick
movements; it requires polling `navigator.getGamepads()`.

*Aura* already has a dedicated 33 ms input clock (`clock: Tock` in [Controls.ts](file:///f:/Projects/aura/frontend/src/features/controls/logic/Controls.ts#L92-L99)),
which ticks at `Constants.INPUT_TICKRATE` (~30 Hz). Polling gamepads inside
`Controls.update()` aligns input reads with network message dispatch.

#### Analog Deadzone & Magnitude Clamping
Raw stick inputs hover around $\pm 0.05$ due to hardware drift.
- **Radial deadzone formula:**
  $$\text{magnitude} = \sqrt{x^2 + y^2}$$
  $$\text{if } \text{magnitude} \le \text{DEADZONE} \implies (0, 0)$$
  $$\text{else } \vec{v}_{\text{norm}} = \frac{\vec{v}}{\text{magnitude}} \times \min\left(1.0, \frac{\text{magnitude} - \text{DEADZONE}}{1.0 - \text{DEADZONE}}\right)$$
- **Default deadzone:** `0.15` [PLACEHOLDER].
- The normalized vector feeds into `movement.x` and `movement.y`. Because
  `input2vec()` on the backend normalizes all non-zero vectors, fractional stick
  deflections govern direction, while speed is authoritative on the server.

#### Edge-Triggered Buttons
Like `auraHotkeysWereDown` in [Controls.ts](file:///f:/Projects/aura/frontend/src/features/controls/logic/Controls.ts#L72-L74),
gamepad buttons maintain a bitmask or `boolean[]` of their previous frame state:
```typescript
const isDown = pad.buttons[btnIndex].pressed;
if (isDown && !previousState[btnIndex]) {
    // Fire action
}
previousState[btnIndex] = isDown;
```

#### Active Input Mode & `onChange` Events (D8)
`Controls.ts` currently stores `lastInputType: ('MOUSE' | 'TOUCH')`. This expands
into a first-class `ActiveInputMode`:
```typescript
export type InputMode = 'KEYBOARD_MOUSE' | 'GAMEPAD' | 'TOUCH';
```
- **Automatic detection in `Controls.update()`:**
  - Stick deflection exceeding deadzone or any pad button press sets mode to `'GAMEPAD'`.
  - Mouse movement (`activePointer.justMoved`) or keyboard keydown sets mode to `'KEYBOARD_MOUSE'`.
  - Touch interaction sets mode to `'TOUCH'`.
- **Change detection & event:**
  When the active mode changes, it triggers `InputModeChangedEvent` (in `features/core/logic/Events.ts`):
  ```typescript
  export class InputModeChangedEvent extends Event {
      static trigger(mode: InputMode): void { ... }
      static subscribe(callback: (mode: InputMode) => void): ISubscriptionToken { ... }
  }
  ```
  This single seam powers dynamic glyph swaps across the entire interface without polling.

---

### 4.2 G2: UI Navigation via Virtual Cursor

1. When any UI panel is open (`Journal.isOpen()`, `Spellbook.isOpen()`,
   `Conversation.isOpen()`, etc.), the Right Analog Stick drives a virtual
   cursor:
   - Maintains virtual screen position $(X_v, Y_v)$ clamped to $[0, \text{window.innerWidth}] \times [0, \text{window.innerHeight}]$.
   - Renders a floating cursor dot/arrow over the DOM layer (`#virtualCursor`).
2. When the virtual cursor moves, `document.elementFromPoint(X_v, Y_v)`
   identifies hover targets (displaying tooltips via existing `attachTooltips`).
3. Pressing `A` (or `RT`) synthesizes a `pointerdown` and `click` event at $(X_v, Y_v)$:
   - Selects conversation options (`li.take(row)`).
   - Equips skills or spends skill points in the Spellbook.
4. Pressing `B` or `Start` closes open panels (identical to `Escape`).

---

### 4.3 G3: HUD Glyphs & Feedback

1. **Dynamic Prompt Glyphs:**
   - Elements subscribe to `InputModeChangedEvent.subscribe((mode) => ...)`:
     - When `'GAMEPAD'` is active:
       - NPC interact badge shows `[A] Talk` instead of `[E] Talk`.
       - Ability bar displays `[LB]`, `[RB]`, `[RT]` on cooldown slots and `[X]`, `[Y]`, `[B]` on aura slots.
     - When `'KEYBOARD_MOUSE'` is active:
       - Restores `[E] Talk`, `[Q]`, `[R]`, `[F]`, and `[1]`, `[2]`, `[3]`.
2. **Haptic Rumble:**
   - `pad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: 150, weakMagnitude: 0.5, strongMagnitude: 0.3 })`.
   - Triggered on player taking damage (`DamageReceived` event) or activating a cooldown.

---

## 5. Landmines & Gotchas

1. **Ghost-Walk on Disconnect or Focus Loss (Crucial):**
   - *Problem:* If a controller is disconnected or the window loses focus while
     the left stick is pushed, `getGamepads()` either returns `null` or ceases
     updating. The character would coast indefinitely.
   - *Fix:* Window `blur` and `gamepaddisconnected` event listeners must
     immediately zero the gamepad input state and invoke the existing
     `stopTailRemaining = Constants.STOP_TAIL_TICKS` mechanism in `Controls.ts`.
2. **Snapshotting in `navigator.getGamepads()`:**
   - *Problem:* In Chrome and Edge, `navigator.getGamepads()` returns a snapshot
     array that is only updated on the next call. Reusing the reference across
     ticks causes stale inputs.
   - *Fix:* Always invoke `navigator.getGamepads()` anew inside each tick.
3. **Radial vs. Axial Deadzone:**
   - *Problem:* Testing `Math.abs(x) < 0.15` and `Math.abs(y) < 0.15`
     independently (axial) creates a cross-shaped deadzone that makes smooth
     circular movement stutter near cardinal axes.
   - *Fix:* Use radial deadzone based on Euclidean distance ($\sqrt{x^2 + y^2}$).
4. **Phaser Gamepad Relics:**
   - *Problem:* `InputManager.ts` has commented-out Phaser gamepad calls
     (`this.gamepad.boot()`, `this.gamepad.update()`).
   - *Fix:* Do not revive Phaser's monolithic Gamepad manager. A clean,
     lightweight `GamepadManager.ts` tailored directly to *Aura*'s `Controls.ts`
     is simpler, fully typed, and keeps DOM/HUD decoupling clean.

---

## 6. Test Strategy & Verification

### Vitest Unit Tests
- `GamepadManager.test.ts`:
  - Mock `navigator.getGamepads()` returning dummy `Gamepad` objects.
  - Test deadzone filtering: noise below threshold yields $(0, 0)$.
  - Test edge-triggered button detection: held buttons trigger action on first
    tick only.
  - Test disconnect handling: null gamepad clears active vectors.

### In-Game Manual Verification
- Connect an Xbox / PlayStation controller.
- Walk in full 360° circles: ensure movement is fluid and character does not
  stutter or stick.
- Engage mobs: test aura switching on X, A, B; verify active aura updates in HUD.
- Fire cooldowns on LB, RB, RT; verify cooldown swipe starts.
- Walk up to an NPC: verify Y initiates conversation.
- Use Right Stick to move virtual cursor and select a dialogue option.
- Disconnect USB cable while running: verify character halts immediately (no
  ghost-walk).

---

## 7. Schema & Network Impact

- **DB Schema:** NONE.
- **FlatBuffers API:** NONE.
- **Wire Protocol:** NONE (`InputMessage` already supports arbitrary 2D float vectors).
- **Server Config:** NONE.

