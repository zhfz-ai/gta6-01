// Pedestrians — one job: people walking the sidewalks.
// They stroll along sidewalk lines (road line ± 7), turn at
// intersections, and flee from gunfire, crashes and speeding cars.
// A few wait at taxi stands; those can be hailed with T.

import * as THREE from 'three';
import { CFG, nearestRoad, dist2 } from './config.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0x9a4ad8, 0xd87a4a, 0x4ad8c8, 0xe8e8e8];

export function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({
    color: SHIRTS[Math.floor(rng() * SHIRTS.length)],
  });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 3, 8), shirt);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), pants);
  legL.position.set(-0.14, 0.28, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  g.userData.legs = [legL, legR];
  return g;
}

export function spawnPeds(W, scene, count) {
  for (let i = 0; i < count; i++) {
    const alongX = W.rng() < 0.5;
    const road = (Math.floor(W.rng() * 12) - 6) * 40;
    const pos = (Math.floor(W.rng() * 12) - 6) * 40 + (W.rng() * 30 - 15);
    const side = W.rng() < 0.5 ? -7 : 7;
    const ped = {
      x: alongX ? pos : road + side,
      z: alongX ? road + side : pos,
      heading: alongX ? (W.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (W.rng() < 0.5 ? 0 : Math.PI),
      speed: CFG.PED_SPEED * (0.7 + W.rng() * 0.6),
      flee: 0,
      fleeX: 0,
      fleeZ: 0,
      taxi: false,
      hp: 100,
      alive: true,
      mesh: makePedMesh(W.rng),
      walkPhase: W.rng() * 6,
    };
    ped.mesh.position.set(ped.x, 0, ped.z);
    W.peds.push(ped);
    scene.add(ped.mesh);
  }
  // Taxi-stand peds wait in place with a fare available.
  for (const [x, z] of CFG.TAXI_STANDS) {
    const ped = {
      x, z, heading: W.rng() * Math.PI * 2,
      speed: 0, flee: 0, fleeX: 0, fleeZ: 0,
      taxi: true, hp: 100, alive: true,
      mesh: makePedMesh(W.rng), walkPhase: 0,
    };
    ped.mesh.position.set(x, 0, z);
    W.peds.push(ped);
    scene.add(ped.mesh);
  }
}

export function scarePeds(W, x, z, radius) {
  for (const p of W.peds) {
    if (!p.alive) continue;
    if (dist2(p.x, p.z, x, z) < radius) {
      p.flee = 3 + W.rng() * 2;
      p.fleeX = x;
      p.fleeZ = z;
    }
  }
}

export function updatePeds(W, dt) {
  for (const p of W.peds) {
    if (!p.alive) continue;
    if (p.taxi && W.taxi && W.taxi.ped === p) {
      // Riding in the player's car: hidden until drop-off.
      p.mesh.visible = false;
      continue;
    }
    p.mesh.visible = true;
    let speed = p.speed;
    if (p.flee > 0) {
      p.flee -= dt;
      speed = CFG.PED_RUN;
      // Run directly away from the scare source.
      p.heading = Math.atan2(p.x - p.fleeX, p.z - p.fleeZ);
    } else if (!p.taxi) {
      // Stroll: at an intersection, sometimes turn.
      const onXRoad = Math.abs(p.z - nearestRoad(p.z)) < 1.2;
      const onZRoad = Math.abs(p.x - nearestRoad(p.x)) < 1.2;
      if ((onXRoad || onZRoad) && W.rng() < dt * 0.25) {
        p.heading += (W.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
    }
    if (speed > 0) {
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      // Keep inside the city; bounce off the edge.
      if (Math.abs(p.x) > 250 || Math.abs(p.z) > 250) p.heading += Math.PI;
      // Push out of building faces (sidewalks run close to them).
      for (const b of W.colliders) {
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const ox = b.hw + 0.5 - Math.abs(dx);
        const oz = b.hd + 0.5 - Math.abs(dz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) p.x += Math.sign(dx || 1) * ox;
          else p.z += Math.sign(dz || 1) * oz;
        }
      }
      p.walkPhase += dt * speed * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.45;
      p.mesh.userData.legs[0].rotation.x = swing;
      p.mesh.userData.legs[1].rotation.x = -swing;
    }
    // A speeding car nearby makes peds flee too.
    const pc = W.player.car;
    if (pc && Math.abs(pc.speed) > 20 && dist2(p.x, p.z, pc.x, pc.z) < 9) {
      p.flee = 2;
      p.fleeX = pc.x;
      p.fleeZ = pc.z;
    }
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
  }
}
