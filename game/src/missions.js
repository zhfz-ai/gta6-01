// Missions — one job: the 5-mission story chain for Dario Cole.
// Each mission is a list of stages (goto / enterCar / escape / timed
// deliveries / escort). This module owns the objective marker beacon,
// the mission van + rivals for mission 4, and payouts.

import * as THREE from 'three';
import { CFG, dist2 } from './config.js';
import { createCar, stepCar, bumpCars } from './vehicles.js';
import { addWanted, ensureWanted } from './police.js';
import { sfxMissionDone, sfxFail, sfxCash } from './audio.js';

const STORY = [
  {
    name: 'Welcome Back',
    intro: 'Dario Cole is back in Solmara. Vera Solano owns your brother\'s debt — and now she owns you. First: get wheels.',
    stages: [
      { type: 'enterCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'escape', text: 'Lose the tail — break line of sight until the heat dies', wanted: 1 },
    ],
  },
  {
    name: 'Courier Run',
    intro: 'Vera needs packages moved across town, fast. Three drops, one clock.',
    stages: [
      { type: 'deliver', text: 'Deliver the packages — 3 drops, beat the clock', points: [[200, -120], [-160, 120], [120, 200]], time: 110 },
    ],
  },
  {
    name: 'The Marina Job',
    intro: 'A marked coupe sits at the marina. Take it, and don\'t let the harbour cops keep it.',
    stages: [
      { type: 'goto', text: 'Get to the marina', pos: [200, 190] },
      { type: 'stealTarget', text: 'Steal the marked coupe (E)', pos: [200, 190] },
      { type: 'escape', text: 'Lose the 2-star heat', wanted: 2 },
    ],
  },
  {
    name: "Solano's Cut",
    intro: 'A courier van carries Vera\'s cut through town. Rival crew wants it. Keep it rolling to the club.',
    stages: [
      { type: 'escort', text: 'Protect the courier van — get it to Club Solano', from: [0, 160], to: [160, 120] },
    ],
  },
  {
    name: 'Sunset Run',
    intro: 'The ledger. The hills. One last run at sunset — then the debt is done.',
    stages: [
      { type: 'goto', text: 'Grab the ledger at Club Solano', pos: [160, 120] },
      { type: 'escapeRun', text: '3-star chase — reach the hillside drop', pos: [-200, -160], wanted: 3 },
    ],
  },
];

export function initMissions(W, scene) {
  // Objective beacon: tall translucent pillar + ground ring.
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff4fa3, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 34, 12, 1, true), mat);
  pillar.position.y = 17;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  const marker = new THREE.Group();
  marker.add(pillar);
  marker.add(ring);
  marker.visible = false;
  scene.add(marker);
  W.marker = marker;

  W.missions = {
    defs: STORY,
    done: 0,
    idx: 0,
    stage: 0,
    timer: 0,
    dropIndex: 0,
    targetCar: null,
    van: null,
    rivals: [],
    finished: false,
    objective: 'Press Start to begin',
  };
  startMission(W, scene, 0);
}

export function currentMission(W) {
  return W.missions.defs[W.missions.idx];
}
export function currentStage(W) {
  const m = currentMission(W);
  return m ? m.stages[W.missions.stage] : null;
}

export function startMission(W, scene, idx) {
  const M = W.missions;
  M.idx = idx;
  M.stage = 0;
  M.dropIndex = 0;
  M.timer = 0;
  // Clear old mission vehicles.
  if (M.targetCar) { M.targetCar.active = false; M.targetCar.mesh.visible = false; M.targetCar = null; }
  if (M.van) { M.van.active = false; M.van.mesh.visible = false; M.van = null; }
  for (const r of M.rivals) { r.active = false; r.mesh.visible = false; }
  M.rivals = [];
  const m = currentMission(W);
  W.events.push({ type: 'mission-start', name: m.name, intro: m.intro });
  setupStage(W, scene);
}

function setupStage(W, scene) {
  const M = W.missions;
  const st = currentStage(W);
  if (!st) return;
  M.objective = st.text;
  M.timer = st.time || 0;
  if (st.type === 'goto' || st.type === 'stealTarget' || st.type === 'escapeRun') {
    W.marker.visible = true;
    W.marker.position.set(st.pos[0], 0, st.pos[1]);
  } else if (st.type === 'deliver') {
    W.marker.visible = true;
    const pt = st.points[M.dropIndex];
    W.marker.position.set(pt[0], 0, pt[1]);
  } else if (st.type === 'escort') {
    // Spawn the courier van + two rival hunters.
    const van = createCar(W, { kind: 'van', x: st.from[0], z: st.from[1], heading: Math.PI / 2, color: 0xe8e8e8 });
    van.hp = 100;
    van.waypoints = [[160, 160], [160, 120]];
    van.wpIndex = 0;
    M.van = van;
    scene.add(van.mesh);
    for (let i = 0; i < 2; i++) {
      // Round 6: rivals in bright gold / red so they read on the road
      // instead of black-on-black (was 0x222222 for both).
      const r = createCar(W, {
        kind: 'rival', x: st.from[0] - 30 - i * 14, z: st.from[1] + 20 + i * 10,
        heading: Math.PI / 2, color: i === 0 ? 0xd8a13c : 0xc0392b,
      });
      r.hp = 60;
      r.ramCooldown = 0;
      M.rivals.push(r);
      scene.add(r.mesh);
    }
    W.marker.visible = true;
    W.marker.position.set(st.to[0], 0, st.to[1]);
  } else {
    W.marker.visible = false;
  }
  if (st.type === 'stealTarget' && !M.targetCar) {
    const t = createCar(W, { kind: 'target', x: st.pos[0], z: st.pos[1], heading: Math.PI, color: 0xffd54a });
    M.targetCar = t;
    scene.add(t.mesh);
  }
  if (st.type === 'escape' || st.type === 'escapeRun') {
    ensureWanted(W, st.wanted || 1, 'mission heat');
  }
}

function advanceStage(W, scene) {
  const M = W.missions;
  M.stage++;
  const m = currentMission(W);
  if (M.stage >= m.stages.length) {
    completeMission(W, scene);
  } else {
    setupStage(W, scene);
  }
}

function completeMission(W, scene) {
  const M = W.missions;
  const payout = CFG.MISSION_PAYOUTS[M.idx];
  W.player.cash += payout;
  W.stats.totalEarned += payout;
  M.done++;
  sfxMissionDone();
  sfxCash();
  W.events.push({ type: 'mission-done', name: currentMission(W).name, payout });
  if (M.idx + 1 >= M.defs.length) {
    M.finished = true;
    M.objective = 'Debt paid. Solmara is yours — free roam.';
    W.marker.visible = false;
    return;
  }
  startMission(W, scene, M.idx + 1);
}

export function failMission(W, scene, why) {
  sfxFail();
  W.events.push({ type: 'mission-failed', why });
  startMission(W, scene, W.missions.idx);
}

export function updateMissions(W, dt, scene) {
  const M = W.missions;
  if (M.finished) return;
  const st = currentStage(W);
  if (!st) return;
  const p = W.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;

  // Marker pulse.
  if (W.marker.visible) {
    const s = 1 + Math.sin(W.time * 4) * 0.12;
    W.marker.scale.set(s, 1, s);
    W.marker.rotation.y += dt;
  }

  if (st.time) {
    M.timer -= dt;
    if (M.timer <= 0) {
      failMission(W, scene, 'Out of time');
      return;
    }
  }

  switch (st.type) {
    case 'enterCar':
      if (p.car) advanceStage(W, scene);
      break;
    case 'goto': {
      if (dist2(px, pz, st.pos[0], st.pos[1]) < 7) advanceStage(W, scene);
      break;
    }
    case 'stealTarget': {
      if (p.car === M.targetCar) advanceStage(W, scene);
      else if (dist2(px, pz, st.pos[0], st.pos[1]) < 7) {
        M.objective = 'Steal the marked coupe — press E';
      }
      break;
    }
    case 'escape': {
      if (p.wanted === 0) advanceStage(W, scene);
      break;
    }
    case 'escapeRun': {
      if (dist2(px, pz, st.pos[0], st.pos[1]) < 8) advanceStage(W, scene);
      break;
    }
    case 'deliver': {
      const pt = st.points[M.dropIndex];
      if (dist2(px, pz, pt[0], pt[1]) < 8) {
        M.dropIndex++;
        W.player.cash += 60;
        W.events.push({ type: 'drop', n: M.dropIndex });
        sfxCash();
        if (M.dropIndex >= st.points.length) {
          advanceStage(W, scene);
        } else {
          const np = st.points[M.dropIndex];
          W.marker.position.set(np[0], 0, np[1]);
          M.objective = `Deliver the packages — drop ${M.dropIndex + 1} of ${st.points.length}`;
        }
      }
      break;
    }
    case 'escort': {
      updateEscort(W, dt, scene, st);
      break;
    }
  }
}

function updateEscort(W, dt, scene, st) {
  const M = W.missions;
  const van = M.van;
  if (!van || !van.active) return;
  // Van drives its waypoints along the roads at a steady cruise.
  const wp = van.waypoints[van.wpIndex];
  const d = dist2(van.x, van.z, wp[0], wp[1]);
  if (d < 6) {
    van.wpIndex++;
    if (van.wpIndex >= van.waypoints.length) {
      // Arrived at the club.
      van.active = false;
      van.mesh.visible = false;
      advanceStage(W, scene);
      return;
    }
  } else {
    const want = Math.atan2(wp[0] - van.x, wp[1] - van.z);
    const err = ((want - van.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    stepCar(W, van, { throttle: 0.5, steer: Math.max(-1, Math.min(1, err * 1.5)), handbrake: false }, dt);
    van.speed = Math.min(van.speed, 16);
  }
  // Rivals chase the van and ram it.
  for (const r of M.rivals) {
    if (!r.active) continue;
    r.ramCooldown -= dt;
    const want = Math.atan2(van.x - r.x, van.z - r.z);
    const err = ((want - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const rd = dist2(r.x, r.z, van.x, van.z);
    stepCar(W, r, { throttle: rd > 5 ? 1 : 0.3, steer: Math.max(-1, Math.min(1, err * 1.6)), handbrake: false }, dt);
    bumpCars(r, van);
    if (rd < 4.2 && r.ramCooldown <= 0) {
      r.ramCooldown = 0.6;
      van.hp -= 12;
      W.events.push({ type: 'van-hit', hp: van.hp });
    }
    if (r.hp <= 0) {
      r.active = false;
      r.mesh.visible = false;
      W.events.push({ type: 'rival-down' });
    }
  }
  // Player can ram rivals to damage them (handled in world via bumpCars).
  if (van.hp <= 0) {
    failMission(W, scene, 'The courier van was destroyed');
  }
}
