// Input — one job: keyboard state, edge-triggered keys, nothing else.
// Keys: WASD/arrows drive & walk, Shift run, Space handbrake, E enter/exit
// car, F punch/shoot, R reload, T taxi, P/Esc pause, M mute.

const DOWN = new Set();
const PRESSED = new Set();

export const input = {
  // Continuous state, read every frame.
  get up() { return DOWN.has('KeyW') || DOWN.has('ArrowUp'); },
  get down() { return DOWN.has('KeyS') || DOWN.has('ArrowDown'); },
  get left() { return DOWN.has('KeyA') || DOWN.has('ArrowLeft'); },
  get right() { return DOWN.has('KeyD') || DOWN.has('ArrowRight'); },
  get run() { return DOWN.has('ShiftLeft') || DOWN.has('ShiftRight'); },
  get handbrake() { return DOWN.has('Space'); },
  get anyKey() { return DOWN.size > 0; },

  // Edge-triggered: true once, consumed by the caller.
  pressed(code) {
    if (PRESSED.has(code)) { PRESSED.delete(code); return true; }
    return false;
  },
  consumeAll() { PRESSED.clear(); },
};

export function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) PRESSED.add(e.code);
    DOWN.add(e.code);
  });
  window.addEventListener('keyup', (e) => DOWN.delete(e.code));
  window.addEventListener('blur', () => { DOWN.clear(); PRESSED.clear(); });
}
