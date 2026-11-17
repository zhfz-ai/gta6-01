// Traffic — one job: ambient cars driving the road grid.
// Each car follows road lines (multiples of 40), picks a new direction
// at every intersection, and keeps a cruise speed. Lane-keeping only:
// no wobble, so staged shots stay on their road.

import { CFG, clamp, angDiff, nearestRoad, dist2 } from './config.js';
import { createCar, stepCar, randomCarColor } from './vehicles.js';

export function spawnTraffic(W, scene, count) {
  const rng = W.rng;
  for (let i = 0; i < count; i++) {
    const along = Math.floor(rng() * 2) === 0; // drive along x or along z
    const road = (Math.floor(rng() * 12) - 6) * 40;
    const pos = (Math.floor(rng() * 12) - 6) * 40 + (rng() * 20 - 10);
    const heading = along ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const car = createCar(W, {
      kind: 'traffic',
      x: along ? pos : road + laneOffset(rng),
      z: along ? road + laneOffset(rng) : pos,
      heading,
      color: randomCarColor(rng),
    });
    car.cruise = 11 + rng() * 7;
    car.route = nextWaypoint(car, rng);
    W.traffic.push(car);
    scene.add(car.mesh);
  }
}

function laneOffset(rng) {
  return (rng() < 0.5 ? -1 : 1) * 2.6;
}

// Pick the next intersection ahead of the car on its current road.
function nextWaypoint(car, rng) {
  const step = 40;
  if (Math.abs(Math.sin(car.heading)) > 0.7) {
    // Moving along x.
    const dir = Math.sin(car.heading) > 0 ? 1 : -1;
    const nx = nearestRoad(car.x) + dir * step;
    return { x: nx, z: nearestRoad(car.z) };
  }
  const dir = Math.cos(car.heading) > 0 ? 1 : -1;
  const nz = nearestRoad(car.z) + dir * step;
  return { x: nearestRoad(car.x), z: nz };
}

export function updateTraffic(W, dt) {
  for (const car of W.traffic) {
    if (!car.active) continue;
    // Arrived at the waypoint: choose straight / left / right.
    const d = dist2(car.x, car.z, car.route.x, car.route.z);
    if (d < 4) {
      const r = W.rng();
      let nh = car.heading;
      if (r < 0.62) nh = car.heading; // straight
      else if (r < 0.81) nh = car.heading + Math.PI / 2; // left
      else nh = car.heading - Math.PI / 2; // right
      car.heading = nh;
      car.route = nextWaypoint(car, W.rng);
    }
    // Steer toward the waypoint: pure lane-keeping.
    const want = Math.atan2(car.route.x - car.x, car.route.z - car.z);
    const err = angDiff(car.heading, want);
    const steer = clamp(err * 1.4, -1, 1);
    // Slow for the car ahead on the same road.
    let throttle = 0.55;
    for (const other of W.traffic) {
      if (other === car || !other.active) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
      if (ahead > 0 && ahead < 12 && side < 4) { throttle = 0; break; }
    }
    // Keep cruise speed: ease off near it.
    if (Math.abs(car.speed) > car.cruise) throttle = Math.min(throttle, 0.15);
    stepCar(W, car, { throttle, steer, handbrake: false }, dt);
    // Traffic never leaves the road grid: snap lateral drift back.
    if (Math.abs(Math.sin(car.heading)) > 0.7) {
      car.z += (nearestRoad(car.z) + (car.z > nearestRoad(car.z) ? 2.6 : -2.6) - car.z) * 0.02;
    } else {
      car.x += (nearestRoad(car.x) + (car.x > nearestRoad(car.x) ? 2.6 : -2.6) - car.x) * 0.02;
    }
  }
}

// Move every traffic car out of a rectangle (used by shot staging so the
// drive shot's road is clear of background cars).
export function clearTrafficRect(W, x0, z0, x1, z1) {
  for (const car of W.traffic) {
    if (car.x > x0 && car.x < x1 && car.z > z0 && car.z < z1) {
      car.x = 80 + W.rng() * 40;
      car.z = -160 + W.rng() * 40;
      car.route = nextWaypoint(car, W.rng);
      car.mesh.position.set(car.x, 0, car.z);
    }
  }
}
