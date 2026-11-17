// Shots — one job: deterministic staged screenshots.
// ?shot=cover|drive|foot|mission & ?seed=N. The autopilot plays the
// real rules forward (fixed 1/60 steps, pure lane-keeping — no sine
// wobble, which once drifted the car into building corners), then sets
// window.__shotReady. Nothing here hand-composes a frame.

import { CFG, clamp, angDiff } from './config.js';
import { spawnCop } from './police.js';
import { clearTrafficRect } from './traffic.js';
import { tryAttack } from './combat.js';
import { scarePeds } from './pedestrians.js';
import { startMission } from './missions.js';
import { stepWorld } from './world.js';
import { stepCar } from './vehicles.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  return { name: shot, seed: Number(q.get('seed') || 7) };
}

// Lane-keeping autopilot: steer toward a target lane x on a road with a
// base heading (0 = south, PI = north). Pure lane-keeping, no wobble.
function laneSteer(W, laneX, baseHeading) {
  const car = W.player.car;
  const sign = baseHeading === 0 ? -1 : 1;
  const correction = clamp((car.x - laneX) * 0.06 * sign, -0.35, 0.35);
  return clamp(angDiff(car.heading, baseHeading + correction) * 1.6, -1, 1);
}

const IDLE = () => ({
  up: false, down: false, left: false, right: false, run: false,
  handbrake: false, pressedE: false, pressedF: false, pressedR: false,
  pressedT: false, pressedB: false,
});

export function stageShot(W, scene, name) {
  const p = W.player;
  // All shots skip the start screen.
  W.shotMode = true;
  W.started = true;

  if (name === 'cover') {
    // Sunset chase on the beach boulevard: player car mid-drift, 2 cops
    // behind, wanted 3, "Lose the cops" objective.
    const car = W.parked.find((c) => Math.abs(c.x - 216) < 2) || W.parked[0];
    const pi = W.parked.indexOf(car);
    if (pi >= 0) W.parked.splice(pi, 1);
    car.kind = 'player';
    car.x = 222; car.z = -40; car.heading = 0; car.speed = 26;
    car.vx = 0; car.vz = 26;
    car.playerOwned = true;
    p.car = car;
    p.mesh.visible = false;
    p.wanted = 3;
    W.stats.bestWanted = 3;
    W.shotObjective = 'Lose the cops';
    // Two cops posed behind: offsets x ±5, z -12/-19.
    const c1 = spawnCop(W, scene, 217, -52);
    const c2 = spawnCop(W, scene, 227, -59);
    c1.heading = 0; c2.heading = 0;
    c1.speed = 24; c2.speed = 24;
    W.camOverride = { yaw: Math.PI + 0.35, pitch: 0.36, dist: 17 };
    W.shotSteps = 150;
    W.shotKind = 'drive';
    W.shotLane = 222;
    W.shotBaseHeading = 0;
  } else if (name === 'drive') {
    // Downtown driving with traffic + pedestrians, northbound through
    // the tower district (heading PI) so the run stays inside the city.
    const car = W.parked[0];
    W.parked.splice(0, 1);
    car.kind = 'player';
    car.x = -40; car.z = 0; car.heading = Math.PI; car.speed = 42;
    car.vx = 0; car.vz = -42;
    car.playerOwned = true;
    p.car = car;
    p.mesh.visible = false;
    // Clear traffic off the route x=-40, z -170..-30, then re-stage
    // three traffic cars ahead on the same road (visible up the avenue)
    // and a few peds on the sidewalks near the player.
    clearTrafficRect(W, -50, -170, -30, -30);
    const routeCars = W.traffic.slice(0, 3);
    const routeSpots = [[-42.6, -110], [-37.4, -140], [-42.6, -170]];
    routeCars.forEach((c, i) => {
      c.x = routeSpots[i][0];
      c.z = routeSpots[i][1];
      c.heading = Math.PI;
      c.cruise = 12;
      c.route = { x: -40, z: c.z - 40 };
      c.mesh.position.set(c.x, 0, c.z);
    });
    W.peds.slice(3, 6).forEach((pd, i) => {
      pd.x = i % 2 === 0 ? -47 : -33;
      pd.z = -95 - i * 10;
      pd.mesh.position.set(pd.x, 0, pd.z);
    });
    W.shotObjective = 'Cruise downtown — find your next job';
    W.camOverride = { yaw: Math.PI, pitch: 0.36, dist: 16 };
    W.shotSteps = 120;
    W.shotKind = 'drive';
    W.shotLane = -40;
    W.shotBaseHeading = Math.PI;
  } else if (name === 'foot') {
    // On foot: pistol standoff by a car, peds fleeing, wanted 1.
    p.x = 206; p.z = 30; p.heading = Math.PI * 0.75;
    p.mesh.position.set(p.x, 0, p.z);
    p.hasPistol = true;
    p.ammo = CFG.PISTOL_AMMO;
    const car = W.parked.find((c) => Math.abs(c.x - 216) < 2) || W.parked[0];
    car.x = 212; car.z = 34; car.heading = Math.PI / 2;
    car.mesh.position.set(car.x, 0, car.z);
    for (const ped of W.peds.slice(0, 4)) {
      ped.x = 200 + W.rng() * 12;
      ped.z = 24 + W.rng() * 10;
      ped.mesh.position.set(ped.x, 0, ped.z);
    }
    scarePeds(W, p.x, p.z, 30);
    tryAttack(W); // fire one shot: muzzle flash + wanted 1
    p.wanted = 1;
    W.stats.bestWanted = 1;
    W.missions.objective = 'Steal a car — walk up to one and press E';
    W.camOverride = { yaw: p.heading, pitch: 0.3, dist: 8.5 };
    W.shotSteps = 90;
    W.shotKind = 'idle';
  } else if (name === 'mission') {
    // Mission start at the club: objective text, skyline + beach behind.
    startMission(W, scene, 3); // Solano's Cut, stage 0 — marker = club
    p.x = 160; p.z = 168; p.heading = Math.PI;
    p.mesh.position.set(p.x, 0, p.z);
    // Look NORTH toward the club (camYaw is the look direction here).
    W.camOverride = { yaw: Math.PI - 0.15, pitch: 0.3, dist: 13 };
    W.shotSteps = 60;
    W.shotKind = 'idle';
  } else {
    W.shotSteps = 30;
    W.shotKind = 'idle';
  }
  W.shotDone = false;
}

// Called from the main loop while staging: advance fixed steps, then
// signal readiness. Rendering in software GL runs ~1.5fps, so a batch
// of world steps runs per rendered frame (the world step is cheap JS;
// only the render is slow). Returns true once __shotReady was set.
export function advanceShot(W) {
  if (W.shotDone) return true;
  // Batch up to 30 fixed steps per frame.
  let batch = 30;
  while (W.shotSteps > 0 && batch-- > 0) {
    W.shotSteps--;
    if (W.shotKind === 'drive' && W.player.car) {
      // Drive the player car with the autopilot steer, then run the
      // rest of the world with a no-op player input. The flag keeps
      // stepWorld from stepping the car a second time (and keeps the
      // police chasing the car, not the stale on-foot position).
      const car = W.player.car;
      stepCar(W, car, { throttle: 1, steer: laneSteer(W, W.shotLane, W.shotBaseHeading ?? 0), handbrake: false }, 1 / 60);
      W.cam.targetYaw = car.heading;
      W.autopilotDrive = true;
      stepWorld(W, 1 / 60, IDLE());
      W.autopilotDrive = false;
    } else {
      stepWorld(W, 1 / 60, IDLE());
    }
  }
  if (W.shotSteps <= 0) {
    W.shotDone = true;
    // Final composition: apply the shot's objective line, hide any
    // centre message banner (it would cover the frame), and nudge any
    // traffic car crowding the player 40 units ahead along the player's
    // heading so the frame reads as traffic ahead, not a fender-bender.
    if (W.shotObjective) W.missions.objective = W.shotObjective;
    const msg = document.getElementById('message');
    if (msg) msg.style.opacity = '0';
    const p = W.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    const heading = p.car ? p.car.heading : p.heading;
    for (const c of W.traffic) {
      const dx = c.x - px, dz = c.z - pz;
      if (dx * dx + dz * dz < 14 * 14) {
        c.x += Math.sin(heading) * 40;
        c.z += Math.cos(heading) * 40;
        c.mesh.position.set(c.x, 0, c.z);
      }
    }
    window.__shotReady = true;
    return true;
  }
  return false;
}
