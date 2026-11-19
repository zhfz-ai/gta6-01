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
    // Round 7: staged to the player's FINAL position. In r6b the player
    // drove ~65 units south during 150 steps while the roadblock sat
    // static at z=-72, so it ended 110+ units away — invisible. Now 90
    // steps and every staged piece sits north of where the player ends
    // up (z~+5): cops just behind him, roadblock just beyond the cops,
    // traffic beyond that. Camera closer (dist 10) so the cops read big.
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
    // Three cops posed behind, closer than round 5 so the 3rd car
    // reads big with its lightbar (was z -52/-59/-66, too far/small).
    // Round 7 take 2: start them WIDE (x 215/229/222) — the chase AI
    // steers them all onto the player's line, so a narrow start ends
    // as a single-file column; a wide start keeps a staggered pack.
    const c1 = spawnCop(W, scene, 215, -47);
    const c2 = spawnCop(W, scene, 229, -52);
    const c3 = spawnCop(W, scene, 222, -58);
    c1.heading = 0; c2.heading = 0; c3.heading = 0;
    c1.speed = 24; c2.speed = 24; c3.speed = 24;
    // Roadblock across the boulevard behind the chase (visible in
    // frame beyond the cops): two static police cars, sideways.
    // They are NOT in W.police, so nothing steps them — they just sit.
    // Round 7: z -35, spread WIDE (x 214/230) across the whole
    // boulevard so they read as a block, not part of the chase pack.
    for (const bx of [214, 230]) {
      const block = createCar(W, { kind: 'police', x: bx, z: -35, heading: Math.PI / 2, color: 0x35579e });
      block.active = true;
      scene.add(block.mesh);
    }
    // Two traffic cars fleeing south up the boulevard ahead of the
    // cops, and pedestrians scattering on both sidewalks.
    W.traffic.slice(0, 2).forEach((c, i) => {
      c.x = i === 0 ? 217 : 223;
      c.z = i === 0 ? -62 : -77;
      c.heading = 0;
      c.cruise = 11;
      c.route = { x: c.x, z: c.z + 40 };
      c.mesh.position.set(c.x, 0, c.z);
    });
    W.peds.slice(0, 6).forEach((pd, i) => {
      pd.x = i % 2 === 0 ? 211 : 229;
      pd.z = -40 - i * 11;
      pd.mesh.position.set(pd.x, 0, pd.z);
    });
    scarePeds(W, 222, -40, 45);
    W.camOverride = { yaw: Math.PI + 0.3, pitch: 0.34, dist: 10 };
    W.shotSteps = 90;
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
    // eight traffic cars ahead on the same road (visible up the avenue)
    // and six peds on the sidewalks near the player.
    clearTrafficRect(W, -50, -170, -30, -30);
    const routeCars = W.traffic.slice(0, 8);
    // Round 7: spots 10 units closer so the avenue traffic reads
    // bigger (was -60..-235); camera closer too.
    const routeSpots = [[-42.6, -50], [-37.4, -75], [-42.6, -100], [-37.4, -125], [-42.6, -150], [-37.4, -175], [-42.6, -200], [-37.4, -225]];
    routeCars.forEach((c, i) => {
      c.x = routeSpots[i][0];
      c.z = routeSpots[i][1];
      c.heading = Math.PI;
      c.cruise = 12;
      c.route = { x: -40, z: c.z - 40 };
      c.mesh.position.set(c.x, 0, c.z);
    });
    // Cross-street traffic on the z=-120 avenue, so the frame shows a
    // live intersection mid-distance instead of an empty road.
    const crossCars = W.traffic.slice(8, 11);
    const crossSpots = [[-90, -120, Math.PI / 2, -50], [-10, -120, -Math.PI / 2, -50], [30, -120, Math.PI / 2, 70]];
    crossCars.forEach((c, i) => {
      c.x = crossSpots[i][0];
      c.z = crossSpots[i][1];
      c.heading = crossSpots[i][2];
      c.cruise = 12;
      c.route = { x: crossSpots[i][3], z: -120 };
      c.mesh.position.set(c.x, 0, c.z);
    });
    W.peds.slice(3, 9).forEach((pd, i) => {
      // Round 7 take 2: peds staged further north (was -50) — the
      // nearest one ended up right at the camera and covered the
      // speed readout in the first take.
      pd.x = i % 2 === 0 ? -47 : -33;
      pd.z = -70 - i * 14;
      pd.mesh.position.set(pd.x, 0, pd.z);
    });
    W.shotObjective = 'Cruise downtown — find your next job';
    W.camOverride = { yaw: Math.PI, pitch: 0.36, dist: 10.5 };
    W.shotSteps = 100;
    W.shotKind = 'drive';
    W.shotLane = -40;
    W.shotBaseHeading = Math.PI;
  } else if (name === 'foot') {
    // On foot: pistol standoff by a car, peds fleeing, wanted 1.
    // Round 6: Dario at a 3/4 FRONT angle — the camera sits on the
    // side he faces, looking back at him, so his orange jacket and
    // front read instead of a back silhouette (round 5 shot from
    // behind him). The car he is about to steal sits to his
    // front-left, far enough from the camera to read whole: in the
    // first round-6 take it was 3 units from the lens and filled a
    // corner as a black slab.
    p.x = 206; p.z = 30; p.heading = 0.8;
    p.mesh.position.set(p.x, 0, p.z);
    p.hasPistol = true;
    p.ammo = CFG.PISTOL_AMMO;
    const car = W.parked.find((c) => Math.abs(c.x - 216) < 2) || W.parked[0];
    car.x = 212; car.z = 26; car.heading = Math.PI / 2;
    car.mesh.position.set(car.x, 0, car.z);
    // A second parked car across the road, and a traffic car passing
    // on the road behind Dario, so the frame reads as a live street.
    // Round 7: the passer is picked bright — r6b's was black-on-black,
    // a black slab mid-frame.
    const car2 = W.parked.find((c) => c !== car) || null;
    if (car2) {
      car2.x = 196; car2.z = 26; car2.heading = Math.PI / 2;
      car2.mesh.position.set(car2.x, 0, car2.z);
    }
    const BRIGHT = [0xc0392b, 0x2e6f9e, 0xd8d8d8, 0xd8a13c, 0x3c8a4f, 0x7a4a9e, 0xb8b0a0];
    const passer = W.traffic.find((c) => BRIGHT.includes(c.color)) || W.traffic[0];
    // Round 7 take 2: stage the passer to END ~25 units north of
    // Dario (was (200,8) -> ends 7 units away, inside advanceShot's
    // 14-unit nudge, which shoved it 40 units off-frame and left a
    // random black car as the mid-frame slab). Also clear any other
    // traffic car near Dario out of the frame.
    passer.x = 200; passer.z = -12; passer.heading = 0; passer.cruise = 12;
    passer.route = { x: 200, z: 28 };
    passer.mesh.position.set(passer.x, 0, passer.z);
    for (const c of W.traffic) {
      if (c !== passer && Math.abs(c.x - 206) < 30 && Math.abs(c.z - 30) < 30) {
        c.x = 80 + W.rng() * 40;
        c.z = -160 + W.rng() * 40;
        c.route = { x: c.x, z: c.z - 40 };
        c.mesh.position.set(c.x, 0, c.z);
      }
    }
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
    // Camera in front of Dario (his heading + PI), offset 0.5 rad so
    // it is a 3/4 front view, not dead-on. Round 7: closer (was 7.5)
    // so Dario reads bigger.
    W.camOverride = { yaw: p.heading + Math.PI - 0.5, pitch: 0.32, dist: 6.5 };
    W.shotSteps = 90;
    W.shotKind = 'idle';
  } else if (name === 'mission') {
    // Mission start at the club: objective text, skyline + beach behind.
    // The escort van + both rival hunters are pulled up close to Dario
    // so the frame shows the whole beat: white van ahead, gold/red
    // rivals flanking it (round 6: bright rivals, were black-on-black).
    // Round 7: camera much closer (dist 12, was 17) — r6b's Dario, van
    // and rivals were tiny and the pink pillar a thin stripe. The pillar
    // itself is thicker/brighter now (missions.js), so the part rising
    // above the club roof into the sky reads. Fewer steps (45) so the
    // van hasn't driven halfway to the club before the shutter.
    startMission(W, scene, 3); // Solano's Cut, stage 0 — marker = club
    // Everyone stands ON the x=160 road (block centres are 20 mod 40,
    // so x=148 would put Dario inside a building's footprint).
    p.x = 160; p.z = 158; p.heading = Math.PI;
    p.mesh.position.set(p.x, 0, p.z);
    const van = W.missions.van;
    if (van) {
      van.x = 160; van.z = 144; van.heading = Math.PI;
      van.waypoints = [[160, 120]];
      van.wpIndex = 0;
      van.mesh.position.set(van.x, 0, van.z);
    }
    W.missions.rivals.forEach((r, i) => {
      r.x = i === 0 ? 154 : 166;
      r.z = i === 0 ? 137 : 139;
      r.heading = Math.PI;
      r.mesh.position.set(r.x, 0, r.z);
    });
    W.peds.slice(0, 3).forEach((pd, i) => {
      pd.x = [153, 167, 156][i];
      pd.z = [146, 148, 152][i];
      pd.mesh.position.set(pd.x, 0, pd.z);
    });
    // Look NORTH toward the club (camYaw is the look direction here),
    // slightly angled so the pillar stands off-centre against the sky.
    // Yaw offset kept small (0.12): a bigger offset pushed the camera
    // off the road against the (140,160) block's wall, which filled
    // the left of the frame. Round 7: dist 12 (was 17); pitch 0.12
    // (was 0.18) so less foreground road fills the frame and more of
    // the pink pillar shows above the club roof.
    W.camOverride = { yaw: Math.PI - 0.12, pitch: 0.12, dist: 12 };
    W.shotSteps = 45;
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
