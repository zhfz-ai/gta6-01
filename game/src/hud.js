// HUD — one job: the DOM overlay.
// Health + cash top-left, wanted stars top-right, objective bottom-left,
// speed bottom-right, centre message feed, start / pause / game-over
// screens. The minimap canvas is a SIBLING of #hud (never inside it:
// hud innerHTML rewrites would wipe the canvas).

import { CFG } from './config.js';

let els = null;
let messageTimer = 0;

export function buildHUD() {
  const root = document.getElementById('ui');
  root.innerHTML = `
    <div id="hud">
      <div id="hud-tl">
        <div id="health-wrap"><div id="health-bar"></div><span id="health-num">100</span></div>
        <div id="cash">$50</div>
      </div>
      <div id="hud-tr"><div id="stars"></div><div id="clock"></div></div>
      <div id="objective"></div>
      <div id="mission-title"></div>
      <div id="speedo">0 <span>km/h</span></div>
      <div id="ammo"></div>
      <div id="message"></div>
      <div id="controls-hint">WASD drive/walk · E enter/exit car · Space handbrake · F fight · R reload · T taxi · P pause</div>
    </div>
    <canvas id="minimap" width="180" height="180"></canvas>
    <div id="screen-start" class="screen">
      <h1>SOLMARA</h1>
      <h2>Sunset Heist</h2>
      <p class="story">Dario Cole is back in Solmara. His late brother owed club owner
      Vera Solano — and now the debt is Dario's. Five jobs stand between him
      and freedom, and the whole city is watching.</p>
      <p class="controls">WASD — drive / walk &nbsp;·&nbsp; E — steal / exit car &nbsp;·&nbsp; Space — handbrake drift<br>
      F — punch / shoot &nbsp;·&nbsp; R — reload ($10) &nbsp;·&nbsp; T — hail a taxi fare &nbsp;·&nbsp; P — pause</p>
      <button id="btn-start">START ENGINE</button>
      <p class="save-note" id="save-note"></p>
    </div>
    <div id="screen-pause" class="screen hidden">
      <h1>PAUSED</h1>
      <p class="controls">P / Esc — resume &nbsp;·&nbsp; M — mute</p>
      <button id="btn-resume">RESUME</button>
    </div>
    <div id="screen-over" class="screen hidden">
      <h1 id="over-title">WASTED</h1>
      <p class="story" id="over-text"></p>
      <button id="btn-restart">TRY AGAIN</button>
    </div>`;
  els = {
    healthBar: document.getElementById('health-bar'),
    healthNum: document.getElementById('health-num'),
    cash: document.getElementById('cash'),
    stars: document.getElementById('stars'),
    clock: document.getElementById('clock'),
    objective: document.getElementById('objective'),
    missionTitle: document.getElementById('mission-title'),
    speedo: document.getElementById('speedo'),
    ammo: document.getElementById('ammo'),
    message: document.getElementById('message'),
    start: document.getElementById('screen-start'),
    pause: document.getElementById('screen-pause'),
    over: document.getElementById('screen-over'),
    overTitle: document.getElementById('over-title'),
    overText: document.getElementById('over-text'),
    saveNote: document.getElementById('save-note'),
  };
  return els;
}

export function showMessage(text, secs = 3) {
  if (!els) return;
  els.message.textContent = text;
  els.message.style.opacity = '1';
  messageTimer = secs;
}

export function updateHUD(W, dt) {
  if (!els) return;
  const p = W.player;
  els.healthBar.style.width = `${Math.max(0, p.hp)}%`;
  els.healthBar.style.background = p.hp > 50 ? '#4caf50' : p.hp > 25 ? '#ff9800' : '#f44336';
  els.healthNum.textContent = `${Math.ceil(Math.max(0, p.hp))}`;
  els.cash.textContent = `$${Math.round(p.cash)}`;
  let stars = '';
  for (let i = 0; i < CFG.WANTED_MAX; i++) {
    stars += i < p.wanted ? '★' : '☆';
  }
  els.stars.textContent = stars;
  els.stars.style.color = p.wanted > 0 ? '#ff5252' : '#ffffff88';
  const mins = Math.floor(W.time / 60);
  const secs = Math.floor(W.time % 60);
  els.clock.textContent = `Day 1 — ${String(17 + mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const m = W.missions.defs[W.missions.idx];
  els.missionTitle.textContent = W.missions.finished
    ? 'FREE ROAM'
    : `MISSION ${W.missions.idx + 1}/5 — ${m.name}`;
  let obj = W.missions.objective;
  const st = W.missions.defs[W.missions.idx]?.stages[W.missions.stage];
  if (st && st.time) obj += `  ⏱ ${Math.ceil(W.missions.timer)}s`;
  if (W.missions.van && W.missions.van.active) obj += `  · Van HP ${Math.max(0, Math.ceil(W.missions.van.hp))}`;
  els.objective.textContent = obj;
  const spd = p.car ? Math.abs(p.car.speed) * 3.2 : 0;
  els.speedo.innerHTML = `${Math.round(spd)} <span>km/h</span>`;
  els.ammo.textContent = p.hasPistol
    ? `🔫 ${p.ammo}/${CFG.PISTOL_AMMO}  (R reload $10)`
    : 'No pistol — buy one at the club ($150)';
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) els.message.style.opacity = '0';
  }
}

export function showScreen(name) {
  if (!els) return;
  els.start.classList.toggle('hidden', name !== 'start');
  els.pause.classList.toggle('hidden', name !== 'pause');
  els.over.classList.toggle('hidden', name !== 'over');
}

export function showGameOver(title, text) {
  if (!els) return;
  els.overTitle.textContent = title;
  els.overText.textContent = text;
  showScreen('over');
}

export function setSaveNote(text) {
  if (els) els.saveNote.textContent = text;
}

export function hudEls() { return els; }
