// World — one job: game state and the per-frame step that wires the
// systems together (player, traffic, peds, police, missions, combat,
// taxi, postcards, events, save).

import * as THREE from 'three';
import { CFG, clamp, dist2, angDiff, mulberry32 } from './config.js';
import { loadSave, writeSave } from './save.js';
import { buildCity } from './city.js';
import { createCar, stepCar, bumpCars, randomCarColor } from './vehicles.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { spawnPeds, updatePeds, scarePeds } from './pedestrians.js';
import { updatePolice, addWanted } from './police.js';
import { initMissions, updateMissions, startMission } from './missions.js';
import { tryAttack, reload } from './combat.js';
import { showMessage, showGameOver } from './hud.js';
import { makePedMesh } from './pedestrians.js';
import {
  sfxPickup, sfxCash, sfxCrash, sfxSirenBlip, sfxClick,
} from './audio.js';

export function createWorld(scene, seed) {
  const W = {
    seed,
    rng: mulberry32(seed),
    time: 0,
    events: [],
    colliders: [],
    traffic: [],
    police: [],
    peds: [],
    parked: [],
    postcards: [],
    ramps: [],
    roadblock: { active: false, last: -99, cars: [] },
    stats: { bestWanted: 0, totalEarned: 0 },
    cam: { yaw: Math.PI, pitch: 0.32, dist: 13 },
    flash: 0,
    gameOver: null,
    taxi: null,
    saveTimer: 0,
    shotMode: false,
    autopilot: null,
  };
  buildCity(W, scene);

  // Dario Cole on foot: dark jacket, distinct from peds.
  // Spawn on the road (x=40), never inside a building block.
  const mesh = makePedMesh(W.rng);
  mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  W.player = {
    x: 40, z: 60, heading: Math.PI, hp: CFG.PLAYER_HP,
    cash: CFG.START_CASH, wanted: 0, heatTimer: 0, bustedTimer: 0,
    car: null, mesh, hasPistol: false, ammo: CFG.PISTOL_AMMO,
    attackCooldown: 0, lastDamage: -99,
  };
  mesh.position.set(40, 0, 60);
  scene.add(mesh);

  // Parked cars the player can steal (roadside, clear of buildings).
  const parkedSpots = [
    [36, 40, 0], [-116, -160, Math.PI / 2], [76, 120, Math.PI],
    [-116, 40, -Math.PI / 2], [216, -40, 0], [116, -160, Math.PI / 2],
    [-4, 196, 0], [156, 76, Math.PI],
  ];
  for (const [x, z, h] of parkedSpots) {
    const car = createCar(W, { kind: 'parked', x, z, heading: h, color: randomCarColor(W.rng) });
    car.playerOwned = false;
    W.parked.push(car);
    scene.add(car.mesh);
  }

  spawnTraffic(W, scene, 14);
  spawnPeds(W, scene, 22);
  initMissions(W, scene);

  // Restore a previous save (cash, postcards, progress).
  const s = loadSave();
  if (s) {
    W.player.cash = Math.max(CFG.START_CASH, s.cash);
    W.stats.bestWanted = s.bestWanted;
    W.stats.totalEarned = s.totalEarned;
    for (const i of s.postcards) {
      if (W.postcards[i]) { W.postcards[i].taken = true; W.postcards[i].mesh.visible = false; }
    }
    if (s.missionsDone > 0 && s.missionsDone < 5) {
      // Jump straight to the next uncompleted mission.
      W.missions.done = s.missionsDone;
      startMission(W, scene, s.missionsDone);
    }
  }
  W.scene = scene;
  return W;
}

// Push a point out of every building AABB (on-foot collision).
export function collidePoint(W, pos, radius) {
  for (const b of W.colliders) {
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    const ox = b.hw + radius - Math.abs(dx);
    const oz = b.hd + radius - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) pos.x += Math.sign(dx || 1) * ox;
      else pos.z += Math.sign(dz || 1) * oz;
    }
  }
  const B = CFG.CITY + 38;
  pos.x = clamp(pos.x, -B, B);
  pos.z = clamp(pos.z, -B, B);
}

function nearestStealableCar(W) {
  const p = W.player;
  const list = [
    ...W.traffic.filter((c) => c.active),
    ...W.parked,
    ...(W.missions.targetCar && W.missions.targetCar.active ? [W.missions.targetCar] : []),
    ...W.police.filter((c) => c.active),
  ];
  let best = null;
  let bestD = 4.5;
  for (const c of list) {
    const d = dist2(p.x, p.z, c.x, c.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterCar(W, car) {
  const p = W.player;
  // Pull it out of the traffic stream.
  const ti = W.traffic.indexOf(car);
  if (ti >= 0) W.traffic.splice(ti, 1);
  const pi = W.parked.indexOf(car);
  if (pi >= 0) W.parked.splice(pi, 1);
  car.kind = 'player';
  p.car = car;
  p.mesh.visible = false;
  car.speed = 0;
  if (!car.playerOwned) {
    car.playerOwned = true;
    if (car !== W.missions.targetCar) addWanted(W, 1, 'grand theft auto');
    else W.events.push({ type: 'message', text: 'The marked coupe is yours. Go!' });
  }
  sfxClick();
}

function exitCar(W) {
  const p = W.player;
  const car = p.car;
  if (!car || Math.abs(car.speed) > 6) return;
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  p.x = car.x + rx * 2.6;
  p.z = car.z + rz * 2.6;
  p.heading = car.heading;
  collidePoint(W, p, 0.5);
  car.kind = 'parked';
  W.parked.push(car);
  p.car = null;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
}

function startTaxi(W, ped) {
  const p = W.player;
  if (!p.car) return;
  // Destination: a random far intersection.
  const dx = (Math.floor(W.rng() * 11) - 5) * 40;
  const dz = (Math.floor(W.rng() * 11) - 5) * 40;
  W.taxi = { ped, destX: dx, destZ: dz, timer: 70 };
  ped.taxi = false;
  W.marker.visible = true;
  W.marker.position.set(dx, 0, dz);
  W.events.push({ type: 'message', text: `Fare: get to (${dx}, ${dz}) in 70s — $${CFG.TAXI_FARE}` });
  sfxSirenBlip();
}

export function stepWorld(W, dt, inp) {
  if (W.gameOver) return;
  W.time += dt;
  const p = W.player;
  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  W.flash = Math.max(0, W.flash - dt);

  // --- Player ---
  if (p.car) {
    const car = p.car;
    if (!W.autopilotDrive) {
      const throttle = (inp.up ? 1 : 0) + (inp.down ? -1 : 0);
      // Heading increases = turn left (counterclockwise from above):
      // A/left must raise the heading, D/right must lower it.
      const steer = (inp.left ? 1 : 0) + (inp.right ? -1 : 0);
      stepCar(W, car, { throttle, steer, handbrake: inp.handbrake }, dt);
    }
    W.cam.targetYaw = car.heading;
    if (inp.pressedE) exitCar(W);
  } else {
    // On foot: move relative to camera yaw. Forward F = (sin cy, cos cy);
    // right R = (-cos cy, sin cy), left L = (cos cy, -sin cy).
    let mx = 0, mz = 0;
    const cy = W.cam.yaw;
    if (inp.up) { mx += Math.sin(cy); mz += Math.cos(cy); }
    if (inp.down) { mx -= Math.sin(cy); mz -= Math.cos(cy); }
    if (inp.left) { mx += Math.cos(cy); mz -= Math.sin(cy); }
    if (inp.right) { mx -= Math.cos(cy); mz += Math.sin(cy); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const sp = inp.run ? CFG.RUN_SPEED : CFG.WALK_SPEED;
      mx /= len; mz /= len;
      p.x += mx * sp * dt;
      p.z += mz * sp * dt;
      const wantHeading = Math.atan2(mx, mz);
      p.heading += angDiff(p.heading, wantHeading) * Math.min(1, dt * 12);
      // Camera swings only on forward/backward movement: strafing must
      // not rotate the camera, or W would stop meaning "forward".
      if (inp.up || inp.down) W.cam.targetYaw = wantHeading;
      p.mesh.userData.legs[0].rotation.x = Math.sin(W.time * 11) * 0.5;
      p.mesh.userData.legs[1].rotation.x = -Math.sin(W.time * 11) * 0.5;
    }
    collidePoint(W, p, 0.5);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    if (inp.pressedE) {
      const car = nearestStealableCar(W);
      if (car) enterCar(W, car);
    }
    if (inp.pressedF) tryAttack(W);
    if (inp.pressedR) reload(W);
    if (inp.pressedT) {
      const ped = W.peds.find((pd) => pd.alive && pd.taxi && dist2(p.x, p.z, pd.x, pd.z) < 4);
      if (ped) {
        W.events.push({ type: 'message', text: 'Hop in a car first, then hail the fare' });
      }
    }
    if (inp.pressedB) {
      if (!p.hasPistol && p.cash >= 150 && dist2(p.x, p.z, W.clubPos.x, W.clubPos.z) < 14) {
        p.cash -= 150;
        p.hasPistol = true;
        p.ammo = CFG.PISTOL_AMMO;
        W.events.push({ type: 'message', text: 'Pistol bought at Club Solano — $150. Press F to shoot.' });
        sfxCash();
      } else if (!p.hasPistol) {
        W.events.push({ type: 'message', text: 'Pistol for sale at Club Solano — $150. Get close and press B.' });
      }
    }
  }
  // Taxi hail only works from inside a car.
  if (p.car && inp.pressedT && !W.taxi) {
    const ped = W.peds.find((pd) => pd.alive && pd.taxi && dist2(p.car.x, p.car.z, pd.x, pd.z) < 6);
    if (ped) startTaxi(W, ped);
  }

  // --- Systems ---
  updateTraffic(W, dt);
  updatePeds(W, dt);
  updatePolice(W, dt, W.scene);
  updateMissions(W, dt, W.scene);

  // Taxi fare progress.
  if (W.taxi) {
    const t = W.taxi;
    t.timer -= dt;
    if (p.car && dist2(p.car.x, p.car.z, t.destX, t.destZ) < 8) {
      p.cash += CFG.TAXI_FARE;
      W.stats.totalEarned += CFG.TAXI_FARE;
      W.events.push({ type: 'message', text: `Fare complete — +$${CFG.TAXI_FARE}` });
      sfxCash();
      t.ped.x = t.destX + 4;
      t.ped.z = t.destZ + 4;
      t.ped.mesh.position.set(t.ped.x, 0, t.ped.z);
      W.taxi = null;
      W.marker.visible = false;
    } else if (t.timer <= 0) {
      W.events.push({ type: 'message', text: 'Fare expired — the customer walked off' });
      t.ped.taxi = true;
      W.taxi = null;
      W.marker.visible = false;
    }
  }

  // Postcards.
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  for (const pc of W.postcards) {
    if (pc.taken) continue;
    if (dist2(px, pz, pc.x, pc.z) < 3.5) {
      pc.taken = true;
      pc.mesh.visible = false;
      p.cash += CFG.POSTCARD_VALUE;
      W.stats.totalEarned += CFG.POSTCARD_VALUE;
      sfxPickup();
      const found = W.postcards.filter((c) => c.taken).length;
      W.events.push({ type: 'message', text: `Sun postcard ${found}/10 — +$${CFG.POSTCARD_VALUE}` });
    }
  }

  // Car-car contact: player car vs everything (position-only separation).
  if (p.car) {
    const others = [
      ...W.traffic, ...W.parked,
      ...W.police.filter((c) => c.active),
      ...W.missions.rivals.filter((c) => c.active),
      ...(W.missions.van && W.missions.van.active ? [W.missions.van] : []),
      ...(W.missions.targetCar && W.missions.targetCar.active ? [W.missions.targetCar] : []),
    ];
    for (const o of others) {
      if (o === p.car) continue;
      bumpCars(p.car, o);
      // Ramming a rival damages it.
      if (o.kind === 'rival' && dist2(p.car.x, p.car.z, o.x, o.z) < 3.6 && Math.abs(p.car.speed) > 12) {
        o.hp -= 25;
        p.car.speed *= 0.7;
        if (o.hp <= 0) {
          o.active = false;
          o.mesh.visible = false;
          W.events.push({ type: 'rival-down' });
        }
      }
    }
  }

  // Health regen after 5s without damage.
  if (W.time - p.lastDamage > 5 && p.hp < CFG.PLAYER_HP) {
    p.hp = Math.min(CFG.PLAYER_HP, p.hp + 2.5 * dt);
  }

  // --- Events ---
  for (const ev of W.events) {
    switch (ev.type) {
      case 'message': showMessage(ev.text); break;
      case 'mission-start': showMessage(`${ev.name}: ${ev.intro}`, 5); break;
      case 'mission-done':
        showMessage(`Mission complete: ${ev.name} — +$${ev.payout}`, 4);
        writeSave(W);
        break;
      case 'mission-failed': showMessage(`Mission failed: ${ev.why}. Try again.`, 4); break;
      case 'stunt':
        p.cash += CFG.STUNT_VALUE;
        showMessage(`Stunt jump! Air ${ev.airTime.toFixed(1)}s — +$${CFG.STUNT_VALUE}`);
        sfxPickup();
        break;
      case 'crash':
        sfxCrash();
        if (ev.speed > 25) {
          p.hp -= 5;
          p.lastDamage = W.time;
        }
        break;
      case 'rammed': sfxCrash(); break;
      case 'wanted': showMessage(`Wanted level ${ev.level} — ${ev.reason}`); break;
      case 'cooled': showMessage(ev.level > 0 ? `Heat dropping — ${ev.level} star${ev.level > 1 ? 's' : ''} left` : 'You lost them. Heat gone.'); break;
      case 'roadblock': showMessage('Roadblock ahead!'); break;
      case 'van-hit': showMessage(`Van under attack! HP ${Math.max(0, Math.ceil(ev.hp))}`); break;
      case 'rival-down': showMessage('Rival crew car down!'); break;
      case 'busted': endGame(W, 'BUSTED', 'The Solmara PD caught up with Dario. The debt is still waiting.'); break;
      case 'shot': W.flash = 0.07; break;
      case 'drop': showMessage(`Package delivered (${ev.n}/3)`); break;
      default: break;
    }
  }
  W.events.length = 0;

  if (p.hp <= 0 && !W.gameOver) {
    endGame(W, 'WASTED', 'Dario went down in Solmara. Vera Solano does not forgive — but she does rehire.');
  }

  // Periodic save.
  W.saveTimer += dt;
  if (W.saveTimer > 5) {
    W.saveTimer = 0;
    writeSave(W);
  }
}

function endGame(W, title, text) {
  W.gameOver = { title, text };
  showGameOver(title, text);
  writeSave(W);
}

export function resetWorld(W, scene) {
  // Simplest reliable restart: reload the page state by rebuilding.
  // The main loop calls createWorld again on a fresh scene instead;
  // here we just clear the game-over flag for the restart button path.
  W.gameOver = null;
}
