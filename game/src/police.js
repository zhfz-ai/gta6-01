// Police — one job: the wanted system.
// Wanted 0–5 stars. Crimes raise it; police cars spawn and chase, ram
// (speed cost once per 0.5s), and set roadblocks at 3+ stars. Break line
// of sight (far + no cop near) to cool down; get busted if a cop sits
// on a slow player, or wasted if health hits 0.

import { CFG, clamp, dist2, angDiff } from './config.js';
import { createCar, stepCar, bumpCars } from './vehicles.js';
import { sfxSirenBlip } from './audio.js';

export function addWanted(W, n, reason) {
  if (W.player.wanted >= CFG.WANTED_MAX) return;
  W.player.wanted = Math.min(CFG.WANTED_MAX, W.player.wanted + n);
  W.stats.bestWanted = Math.max(W.stats.bestWanted, W.player.wanted);
  W.player.heatTimer = 0;
  W.events.push({ type: 'wanted', level: W.player.wanted, reason });
  if (W.player.wanted >= 1) sfxSirenBlip();
}

// Raise the wanted level to at least n (a floor, not an addition):
// mission heat should not stack on top of a theft the player already did.
export function ensureWanted(W, n, reason) {
  if (W.player.wanted < n) addWanted(W, n - W.player.wanted, reason);
}

export function spawnCop(W, scene, x, z) {
  // Round 6: lighter navy so police cars read at small size (was
  // 0x1a2a4a — a black blob against dark asphalt). White stripe stays.
  // Round 7: lighter again — r6b cops still read dark.
  const cop = createCar(W, { kind: 'police', x, z, heading: 0, color: 0x35579e });
  cop.active = true;
  W.police.push(cop);
  scene.add(cop.mesh);
  return cop;
}

function desiredCops(wanted) {
  return Math.min(CFG.COP_MAX_ACTIVE, wanted + 1);
}

export function updatePolice(W, dt, scene) {
  const p = W.player;
  const want = desiredCops(p.wanted);
  // Spawn / despawn to match the wanted level. In shot mode the staged
  // cops are the whole cast — no extra spawns wandering into frame.
  let active = W.police.filter((c) => c.active).length;
  while (active < want && !W.shotMode) {
    const ang = W.rng() * Math.PI * 2;
    const d = 70 + W.rng() * 40;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    spawnCop(W, scene, px + Math.sin(ang) * d, pz + Math.cos(ang) * d);
    active++;
  }
  for (const cop of W.police) {
    if (!cop.active) continue;
    if (p.wanted === 0) {
      cop.active = false;
      cop.mesh.visible = false;
      continue;
    }
    cop.mesh.visible = true;
    const tx = p.car ? p.car.x : p.x;
    const tz = p.car ? p.car.z : p.z;
    const d = dist2(cop.x, cop.z, tx, tz);
    // Chase: steer toward the player, full throttle, slight intercept.
    const pSpeed = p.car ? Math.abs(p.car.speed) : 0;
    const lead = Math.min(12, pSpeed * 0.5);
    const lx = p.car ? p.car.vx * 0.02 * lead : 0;
    const lz = p.car ? p.car.vz * 0.02 * lead : 0;
    const wantHeading = Math.atan2(tx + lx - cop.x, tz + lz - cop.z);
    const err = angDiff(cop.heading, wantHeading);
    const steer = clamp(err * 1.6, -1, 1);
    const throttle = d > 6 ? 1 : 0.4;
    stepCar(W, cop, { throttle, steer, handbrake: false }, dt);
    // Ram: contact costs the player speed once per 0.5s.
    cop.ramCooldown -= dt;
    if (d < 4.2 && p.car && cop.ramCooldown <= 0) {
      cop.ramCooldown = 0.5;
      p.car.speed *= 0.55;
      W.events.push({ type: 'rammed' });
    }
    if (d < 3.4 && !p.car && cop.ramCooldown <= 0) {
      cop.ramCooldown = 0.5;
      p.hp -= 12;
      W.events.push({ type: 'busted-hit' });
    }
    // Flash the light bar.
    const bar = cop.mesh.getObjectByName('lightbar');
    if (bar) bar.material.color.setHex(Math.sin(W.time * 10) > 0 ? 0xff2222 : 0x2244ff);
  }

  // Roadblocks at 3+ stars: two parked cop cars across the road ahead.
  // Not in shot mode (the staged frame is already composed).
  if (p.wanted >= 3 && !W.shotMode && !W.roadblock.active && W.time - W.roadblock.last > 20) {
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    const heading = p.car ? p.car.heading : p.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const bx = px + fx * 55, bz = pz + fz * 55;
    W.roadblock.active = true;
    W.roadblock.last = W.time;
    W.roadblock.cars = [];
    for (const side of [-4, 4]) {
      const cop = createCar(W, {
        kind: 'police',
        x: bx - fz * side,
        z: bz + fx * side,
        heading: heading + Math.PI / 2,
        color: 0x35579e,
      });
      cop.active = true;
      W.roadblock.cars.push(cop);
      scene.add(cop.mesh);
    }
    W.events.push({ type: 'roadblock' });
  }
  if (W.roadblock.active) {
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    const d = dist2(px, pz, W.roadblock.cars[0].x, W.roadblock.cars[0].z);
    if (d > 90 || p.wanted < 3) {
      for (const c of W.roadblock.cars) {
        c.active = false;
        c.mesh.visible = false;
      }
      W.roadblock.active = false;
    }
  }

  // Heat cooldown: no cop within 60 and player far from the last crime.
  const nearestCop = Math.min(
    ...W.police.filter((c) => c.active).map((c) => dist2(c.x, c.z, p.car ? p.car.x : p.x, p.car ? p.car.z : p.z)),
    999,
  );
  const playerSpeed = p.car ? Math.abs(p.car.speed) : 0;
  if (p.wanted > 0 && nearestCop > 60) {
    p.heatTimer += dt;
    if (p.heatTimer > CFG.LOSE_TIME) {
      p.wanted -= 1;
      p.heatTimer = 0;
      W.events.push({ type: 'cooled', level: p.wanted });
    }
  } else {
    p.heatTimer = 0;
  }

  // Busted: a cop parked on a slow, on-foot-or-stopped player.
  if (p.wanted > 0 && nearestCop < 3.5 && playerSpeed < 2 && !p.car) {
    p.bustedTimer += dt;
    if (p.bustedTimer > 2) {
      W.events.push({ type: 'busted' });
      p.bustedTimer = 0;
    }
  } else {
    p.bustedTimer = 0;
  }
}
