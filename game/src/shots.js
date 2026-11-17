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
import { stepCar, createCar } from './vehicles.js';

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
    // Three cops posed behind: offsets x ±5, z -12/-19/-26.
    const c1 = spawnCop(W, scene, 217, -52);
    const c2 = spawnCop(W, scene, 227, -59);
    const c3 = spawnCop(W, scene, 222, -66);
    c1.heading = 0; c2.heading = 0; c3.heading = 0;
    c1.speed = 24; c2.speed = 24; c3.speed = 24;
    // Roadblock across the boulevard behind the chase (visible in
    // frame beyond the cops): two static police cars, sideways.
    // They are NOT in W.police, so nothing steps them — they just sit.
    for (const bx of [216, 224]) {
      const block = createCar(W, { kind: 'police', x: bx, z: -80, heading: Math.PI / 2, color: 0x1a2a4a });
      block.active = true;
      scene.add(block.mesh);
    }
    // Two traffic cars fleeing south up the boulevard ahead of the
    // cops, and pedestrians scattering on both sidewalks.
    W.traffic.slice(0, 2).forEach((c, i) => {
      c.x = i === 0 ? 217 : 223;
      c.z = i === 0 ? -88 : -108;
      c.heading = 0;
      c.cruise = 11;
      c.route = { x: c.x, z: c.z + 40 };
      c.mesh.position.set(c.x, 0, c.z);
    });
    W.peds.slice(0, 4).forEach((pd, i) => {
      pd.x = i % 2 === 0 ? 211 : 229;
      pd.z = -55 - i * 13;
      pd.mesh.position.set(pd.x, 0, pd.z);
    });
    scarePeds(W, 222, -40, 45);
    W.camOverride = { yaw: Math.PI + 0.3, pitch: 0.32, dist: 14 };
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
    // five traffic cars ahead on the same road (visible up the avenue)
    // and six peds on the sidewalks near the player.
    clearTrafficRect(W, -50, -170, -30, -30);
    const routeCars = W.traffic.slice(0, 5);
    const routeSpots = [[-42.6, -70], [-37.4, -100], [-42.6, -130], [-37.4, -160], [-42.6, -190]];
    routeCars.forEach((c, i) => {
      c.x = routeSpots[i][0];
      c.z = routeSpots[i][1];
      c.heading = Math.PI;
      c.cruise = 12;
      c.route = { x: -40, z: c.z - 40 };
      c.mesh.position.set(c.x, 0, c.z);
    });
    W.peds.slice(3, 9).forEach((pd, i) => {
      pd.x = i % 2 === 0 ? -47 : -33;
      pd.z = -55 - i * 15;
      pd.mesh.position.set(pd.x, 0, pd.z);
    });
    W.shotObjective = 'Cruise downtown — find your next job';
    W.camOverride = { yaw: Math.PI, pitch: 0.33, dist: 13 };
    W.shotSteps = 120;
    W.shotKind = 'drive';
    W.shotLane = -40;
    W.shotBaseHeading = Math.PI;
  } else if (name === 'foot') {
    // On foot: pistol standoff by a car, peds fleeing, wanted 1.
    // Dario faces the car he is about to steal (east-south of him).
    p.x = 206; p.z = 30; p.heading = 1.0;
    p.mesh.position.set(p.x, 0, p.z);
    p.hasPistol = true;
    p.ammo = CFG.PISTOL_AMMO;
    const car = W.parked.find((c) => Math.abs(c.x - 216) < 2) || W.parked[0];
    car.x = 212; car.z = 34; car.heading = Math.PI / 2;
    car.mesh.position.set(car.x, 0, car.z);
    // A second parked car across the road, and a traffic car passing
    // on the road behind Dario, so the frame reads as a live street.
    const car2 = W.parked.find((c) => c !== car) || null;
    if (car2) {
      car2.x = 198; car2.z = 44; car2.heading = Math.PI / 2;
      car2.mesh.position.set(car2.x, 0, car2.z);
    }
    const passer = W.traffic[0];
    passer.x = 200; passer.z = 8; passer.heading = 0; passer.cruise = 12;
    passer.route = { x: 200, z: 48 };
    passer.mesh.position.set(passer.x, 0, passer.z);
    for (const ped of W.peds.slice(0, 6)) {
      ped.x = 198 + W.rng() * 18;
      ped.z = 22 + W.rng() * 24;
      ped.mesh.position.set(ped.x, 0, ped.z);
    }
    scarePeds(W, p.x, p.z, 30);
    tryAttack(W); // fire one shot: muzzle flash + wanted 1
    p.wanted = 1;
    W.stats.bestWanted = 1;
    W.missions.objective = 'Steal a car — walk up to one and press E';
    W.camOverride = { yaw: p.heading, pitch: 0.28, dist: 6.5 };
    W.shotSteps = 90;
    W.shotKind = 'idle';
  } else if (name === 'mission') {
    // Mission start at the club: objective text, skyline + beach behind.
    // The escort van + both rival hunters are pulled up close to Dario
    // so the frame shows the whole beat: white van ahead, black rivals
    // flanking it, pink marker pillar at Club Solano beyond.
    startMission(W, scene, 3); // Solano's Cut, stage 0 — marker = club
    // Everyone stands ON the x=160 road (block centres are 20 mod 40,
    // so x=148 would put Dario inside a building's footprint).
    p.x = 160; p.z = 154; p.heading = Math.PI;
    p.mesh.position.set(p.x, 0, p.z);
    const van = W.missions.van;
    if (van) {
      van.x = 160; van.z = 140; van.heading = Math.PI;
      van.waypoints = [[160, 120]];
      van.wpIndex = 0;
      van.mesh.position.set(van.x, 0, van.z);
    }
    W.missions.rivals.forEach((r, i) => {
      r.x = i === 0 ? 156 : 164;
      r.z = i === 0 ? 130 : 134;
      r.heading = Math.PI;
      r.mesh.position.set(r.x, 0, r.z);
    });
    W.peds.slice(0, 3).forEach((pd, i) => {
      pd.x = [153, 167, 154][i];
      pd.z = [128, 132, 118][i];
      pd.mesh.position.set(pd.x, 0, pd.z);
    });
    // Look NORTH toward the club (camYaw is the look direction here).
    W.camOverride = { yaw: Math.PI - 0.1, pitch: 0.28, dist: 11 };
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
