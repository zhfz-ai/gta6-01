// Vehicles — one job: car meshes and arcade driving physics.
// A car is a box-built body + cabin + 4 wheels; physics is a scalar
// forward speed plus a laterally-damped slide velocity (grip 2.2,
// drift grip 1.2 on handbrake, steer 1.1). Collisions with buildings
// push out and scrape speed; car-car contact is position-only.

import * as THREE from 'three';
import { CFG, clamp, fwd } from './config.js';

const CAR_COLORS = [
  0xc0392b, 0x2e6f9e, 0xd8d8d8, 0x2c2c30, 0xd8a13c,
  0x3c8a4f, 0x7a4a9e, 0xb8b0a0, 0x4a7a8a, 0x8a2f4f,
];

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}

export function makeCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), dark);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  // Headlights + taillights.
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), hl);
    h.position.set(sx, 0.55, 2.21);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tl);
    t.position.set(sx, 0.55, -2.21);
    g.add(t);
  }
  if (isPolice) {
    // Round 7: bar wider and taller so it reads as a lightbar at
    // screenshot distance (was 1.2 x 0.18 — a blue smudge).
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.24, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    bar.position.set(0, 1.48, -0.2);
    bar.name = 'lightbar';
    g.add(bar);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    stripe.position.y = 0.72;
    g.add(stripe);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function createCar(W, opts) {
  const car = {
    kind: opts.kind || 'traffic', // 'player' | 'traffic' | 'police' | 'parked' | 'target'
    x: opts.x || 0,
    z: opts.z || 0,
    y: 0,
    vy: 0,
    heading: opts.heading || 0,
    speed: 0,
    vx: 0,
    vz: 0,
    airTime: 0,
    airborne: false,
    ramCooldown: 0,
    mesh: makeCarMesh(opts.color ?? 0xc0392b, opts.kind === 'police'),
    // Round 7: keep the paint colour on the object so staging can pick
    // a bright car for a passing role instead of a black slab.
    color: opts.color ?? 0xc0392b,
    active: true,
    route: null,
    cruise: CFG.TRAFFIC_SPEED,
  };
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  return car;
}

// One physics step for any car. input: { throttle -1..1, steer -1..1,
// handbrake bool }. Position-only car separation happens in world.js.
export function stepCar(W, car, input, dt) {
  const C = CFG.CAR;
  const f = fwd(car.heading);
  // Engine / brake.
  if (input.throttle > 0) car.speed += C.accel * input.throttle * dt;
  else if (input.throttle < 0) {
    if (car.speed > 0.5) car.speed -= C.brake * dt;
    else car.speed -= C.accel * 0.5 * dt; // reverse
  }
  car.speed -= car.speed * C.drag * dt * 0.4;
  if (input.handbrake) car.speed -= car.speed * 0.6 * dt;
  car.speed = clamp(car.speed, -C.maxReverse, car.kind === 'police' ? CFG.COP_SPEED : C.maxSpeed);
  if (Math.abs(car.speed) < 0.05 && input.throttle === 0) car.speed = 0;

  // Steering: rate scales with speed so parked cars don't spin.
  const spd = Math.abs(car.speed) / C.maxSpeed;
  const steerAuthority = clamp(spd * 1.6, 0, 1);
  const drift = input.handbrake ? 1.6 : 1;
  car.heading += input.steer * C.steer * drift * steerAuthority * dt * Math.sign(car.speed || 1);

  // Velocity: forward speed along heading + lateral slide damped by grip.
  const nf = fwd(car.heading);
  const fSpeed = car.vx * nf.x + car.vz * nf.z;
  let lx = car.vx - nf.x * fSpeed;
  let lz = car.vz - nf.z * fSpeed;
  const grip = input.handbrake ? C.driftGrip : C.grip;
  const damp = Math.exp(-grip * dt);
  lx *= damp; lz *= damp;
  // Blend actual forward speed toward the scalar speed (engine authority).
  const blend = 1 - Math.exp(-6 * dt);
  const newFSpeed = fSpeed + (car.speed - fSpeed) * blend;
  car.vx = nf.x * newFSpeed + lx;
  car.vz = nf.z * newFSpeed + lz;

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Ramps: crossing one fast launches the car.
  if (!car.airborne) {
    for (const r of W.ramps) {
      const dx = car.x - r.x, dz = car.z - r.z;
      if (dx * dx + dz * dz < 30 && Math.abs(car.speed) > 22) {
        car.vy = 9;
        car.airborne = true;
        car.airTime = 0;
      }
    }
  }
  if (car.airborne) {
    car.vy -= 22 * dt;
    car.y += car.vy * dt;
    car.airTime += dt;
    if (car.y <= 0) {
      car.y = 0;
      car.vy = 0;
      car.airborne = false;
      if (car.kind === 'player' && car.airTime > 0.6) {
        W.events.push({ type: 'stunt', airTime: car.airTime });
      }
      car.airTime = 0;
    }
  }

  // City bounds: soft wall at the map edge / ocean.
  const B = CFG.CITY + 38;
  car.x = clamp(car.x, -B, B);
  car.z = clamp(car.z, -B, B);

  // Building collision: push out of the AABB, scrape speed on a hard push.
  for (const b of W.colliders) {
    const dx = car.x - b.x;
    const dz = car.z - b.z;
    const ox = b.hw + 1.4 - Math.abs(dx);
    const oz = b.hd + 2.6 - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) {
        car.x += Math.sign(dx || 1) * ox;
        if (Math.abs(car.vx) > 0.05) car.speed *= 0.85;
      } else {
        car.z += Math.sign(dz || 1) * oz;
        if (Math.abs(car.vz) > 0.05) car.speed *= 0.85;
      }
      // Kill the velocity component into the wall.
      const nf2 = fwd(car.heading);
      const fs = car.vx * nf2.x + car.vz * nf2.z;
      car.vx = nf2.x * fs * 0.5;
      car.vz = nf2.z * fs * 0.5;
      if (car.kind === 'player' && Math.abs(car.speed) > 8) {
        W.events.push({ type: 'crash', speed: Math.abs(car.speed) });
      }
    }
  }

  car.mesh.position.set(car.x, car.y, car.z);
  car.mesh.rotation.y = car.heading;
  // Wheel spin + front-wheel steer visual.
  const spin = car.speed * dt * 2.2;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
}

// Position-only separation between two cars (no velocity coupling:
// the old speed-loss version ground cars to 0 on long contact).
export function bumpCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 0.001;
  const min = 3.4;
  if (d >= min) return;
  const push = (min - d) / 2;
  const nx = dx / d, nz = dz / d;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
}
