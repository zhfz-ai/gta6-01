// Main — one job: boot the game and run the frame loop.
// Parses ?shot= / ?seed=, builds the world, wires the start / pause /
// game-over buttons, and steps the world at a fixed clamp. Debug
// handles: window.__world and window.__renderer.

import * as THREE from 'three';
import { hashSeed } from './config.js';
import { bindInput, input } from './input.js';
import { createWorld, stepWorld } from './world.js';
import { setupRenderer, setupScene, createCamera, updateCamera, updateEffects } from './render.js';
import { buildHUD, updateHUD, showScreen, setSaveNote, hudEls } from './hud.js';
import { initMinimap, drawMinimap } from './minimap.js';
import { parseShot, stageShot, advanceShot } from './shots.js';
import { initAudio, resumeAudio, updateAudio, setMuted, isMuted } from './audio.js';
import { loadSave, clearSave } from './save.js';

const shot = parseShot();
const seed = shot ? shot.seed : hashSeed('solmara-' + new Date().toDateString());

const renderer = setupRenderer();
const scene = setupScene();
const camera = createCamera();
const W = createWorld(scene, seed);
W.started = false;

window.__world = W;
window.__renderer = renderer;
// Debug/test hook: step the world directly with a synthetic input.
window.__step = (dt, inp) => stepWorld(W, dt, inp);

buildHUD();
initMinimap();
bindInput();

const saved = loadSave();
if (saved && saved.missionsDone > 0) {
  setSaveNote(`Save found: $${saved.cash}, ${saved.missionsDone}/5 missions done — continuing.`);
}

let paused = false;
let last = performance.now();

function readInput() {
  return {
    up: input.up,
    down: input.down,
    left: input.left,
    right: input.right,
    run: input.run,
    handbrake: input.handbrake,
    pressedE: input.pressed('KeyE'),
    pressedF: input.pressed('KeyF'),
    pressedR: input.pressed('KeyR'),
    pressedT: input.pressed('KeyT'),
    pressedB: input.pressed('KeyB'),
  };
}

function startGame() {
  initAudio();
  resumeAudio();
  W.started = true;
  showScreen('');
  input.consumeAll();
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', () => {
  paused = false;
  showScreen('');
});
document.getElementById('btn-restart').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});

window.addEventListener('keydown', (e) => {
  if ((e.code === 'KeyP' || e.code === 'Escape') && W.started && !W.gameOver && !W.shotMode) {
    paused = !paused;
    showScreen(paused ? 'pause' : '');
  }
  if (e.code === 'KeyM') setMuted(!isMuted());
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Shot mode stages the world before the first frame.
if (shot) {
  stageShot(W, scene, shot.name);
  showScreen('');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;

  if (shot) {
    advanceShot(W);
  } else if (W.started && !paused && !W.gameOver) {
    stepWorld(W, dt, readInput());
  }
  if (W.started) {
    updateCamera(W, camera, dt);
    updateEffects(W, dt);
    updateHUD(W, dt);
    drawMinimap(W);
    updateAudio(W, dt);
  }
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
