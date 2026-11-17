// Combat — one job: fists and the pistol.
// F: punch when on foot and close, or fire the pistol (raycast forward
// from the player). Hits damage peds, rivals and cops; gunfire scares
// nearby peds and raises the wanted level. Muzzle flash is a short
// point light the renderer owns.

import * as THREE from 'three';
import { CFG, dist2, angDiff } from './config.js';
import { addWanted } from './police.js';
import { scarePeds } from './pedestrians.js';
import { sfxShot, sfxPunch } from './audio.js';

export function tryAttack(W) {
  const p = W.player;
  if (p.car) return; // no drive-by shooting in this build
  if (p.attackCooldown > 0) return;
  if (p.hasPistol && p.ammo > 0) {
    shoot(W);
  } else {
    punch(W);
  }
}

function punch(W) {
  const p = W.player;
  p.attackCooldown = 0.45;
  sfxPunch();
  // Nearest living ped / cop / rival in front within fist range.
  const targets = [];
  for (const ped of W.peds) if (ped.alive) targets.push({ x: ped.x, z: ped.z, ref: ped, kind: 'ped' });
  for (const cop of W.police) if (cop.active) targets.push({ x: cop.x, z: cop.z, ref: cop, kind: 'cop' });
  for (const r of W.missions.rivals) if (r.active) targets.push({ x: r.x, z: r.z, ref: r, kind: 'rival' });
  let best = null;
  let bestD = CFG.FIST_RANGE;
  for (const t of targets) {
    const d = dist2(p.x, p.z, t.x, t.z);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (best) damageTarget(W, best, CFG.FIST_DAMAGE);
}

function shoot(W) {
  const p = W.player;
  p.ammo--;
  p.attackCooldown = 0.28;
  sfxShot();
  W.events.push({ type: 'shot', x: p.x, z: p.z, heading: p.heading });
  scarePeds(W, p.x, p.z, 40);
  addWanted(W, 1, 'shots fired');
  // Raycast: nearest target roughly in front within pistol range.
  const targets = [];
  for (const ped of W.peds) if (ped.alive) targets.push({ x: ped.x, z: ped.z, ref: ped, kind: 'ped' });
  for (const cop of W.police) if (cop.active) targets.push({ x: cop.x, z: cop.z, ref: cop, kind: 'cop' });
  for (const r of W.missions.rivals) if (r.active) targets.push({ x: r.x, z: r.z, ref: r, kind: 'rival' });
  const van = W.missions.van;
  if (van && van.active) targets.push({ x: van.x, z: van.z, ref: van, kind: 'van' });
  let best = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const dx = t.x - p.x, dz = t.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > CFG.PISTOL_RANGE) continue;
    const ang = Math.atan2(dx, dz);
    const err = Math.abs(angDiff(p.heading, ang));
    if (err > 0.22) continue;
    const score = d + err * 30;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  if (best) damageTarget(W, best, CFG.PISTOL_DAMAGE);
}

function damageTarget(W, t, dmg) {
  if (t.kind === 'ped') {
    t.ref.hp -= dmg;
    if (t.ref.hp <= 0) {
      t.ref.alive = false;
      t.ref.mesh.visible = false;
      addWanted(W, 1, 'ped down');
      W.events.push({ type: 'ped-down' });
    } else {
      t.ref.flee = 4;
      t.ref.fleeX = W.player.x;
      t.ref.fleeZ = W.player.z;
    }
  } else if (t.kind === 'cop') {
    // Cops are tough: a hit slows them and drops their chase briefly.
    t.ref.speed *= 0.3;
    t.ref.ramCooldown = 1.2;
    addWanted(W, 1, 'cop shot');
  } else if (t.kind === 'rival') {
    t.ref.hp -= dmg;
    if (t.ref.hp <= 0) {
      t.ref.active = false;
      t.ref.mesh.visible = false;
      W.events.push({ type: 'rival-down' });
    }
  } else if (t.kind === 'van') {
    // Friendly fire hurts the job.
    t.ref.hp -= dmg;
  }
}

export function reload(W) {
  const p = W.player;
  if (!p.hasPistol) return;
  if (p.ammo >= CFG.PISTOL_AMMO) return;
  if (p.cash < 10) {
    W.events.push({ type: 'message', text: 'Not enough cash for ammo ($10)' });
    return;
  }
  p.cash -= 10;
  p.ammo = CFG.PISTOL_AMMO;
  W.events.push({ type: 'message', text: 'Pistol reloaded — $10' });
}
