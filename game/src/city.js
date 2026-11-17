// City — one job: build Solmara's static world.
// Ground + road grid texture, instanced buildings (block centres sit at
// 20 mod 40, roads at 0 mod 40 — buildings never get a +20 shift),
// beach + ocean, marina docks, Club Solano, palms, ramps, postcards.
// Exports the building AABBs the physics uses for collision.

import * as THREE from 'three';
import { CFG, mulberry32 } from './config.js';

// Canvas texture: asphalt with a dashed centre line, tiled along a road.
function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3a40';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#2f2f35';
  g.fillRect(0, 0, 6, 256);
  g.fillRect(58, 0, 6, 256);
  g.fillStyle = '#d8b13c';
  g.fillRect(30, 20, 4, 60);
  g.fillRect(30, 148, 4, 60);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ground texture: grass/concrete base with the road grid painted on it,
// sand strip on the east edge. World maps x -280..300, z -260..260.
function groundTexture() {
  const W = 1160, H = 1040; // 2 px per unit
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (x) => (x + 280) * 2;
  const pz = (z) => (z + 260) * 2;
  g.fillStyle = '#7d9b6a';
  g.fillRect(0, 0, W, H);
  // Downtown concrete.
  g.fillStyle = '#8a8d90';
  g.fillRect(px(-120), pz(-120), 240 * 2, 240 * 2);
  // Hillside (west) stays green; marina (south-east) concrete.
  g.fillStyle = '#9aa0a3';
  g.fillRect(px(120), pz(120), 160 * 2, 140 * 2);
  // Sand strip east of x=240.
  g.fillStyle = '#e8cf9a';
  g.fillRect(px(240), 0, (300 - 240) * 2, H);
  // Roads: dark strips on every 0-mod-40 line.
  g.fillStyle = '#333338';
  for (let v = -240; v <= 240; v += 40) {
    g.fillRect(px(v) - 10, 0, 20, H); // north-south road
    g.fillRect(0, pz(v) - 10, W, 20); // east-west road
  }
  // Boulevard at x=220: lighter, palm-lined avenue.
  g.fillStyle = '#4a4640';
  g.fillRect(px(220) - 14, 0, 28, H);
  // Lane dashes.
  g.fillStyle = '#c9a227';
  for (let v = -240; v <= 240; v += 40) {
    for (let u = -240; u <= 240; u += 16) {
      g.fillRect(px(v) - 1, pz(u), 2, 8);
      g.fillRect(px(u), pz(v) - 1, 8, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Window texture for building sides: lit windows on a facade.
function facadeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  const rng = mulberry32(7);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < 0.45;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#20242e';
      g.fillRect(x, y, 10, 10);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity(W, scene) {
  const rng = mulberry32(W.seed);
  const group = new THREE.Group();
  group.name = 'city';

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(580, 520),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(10, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Ocean: big blue plane east of the sand, gently animated in render.js.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 520),
    new THREE.MeshLambertMaterial({ color: 0x1f6f8b }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(280 + 160, -0.4, 0);
  ocean.name = 'ocean';
  group.add(ocean);

  // --- Buildings (one InstancedMesh). Block centres bx,bz at 20 mod 40.
  const facade = facadeTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0); // origin at base
  const boxMat = new THREE.MeshLambertMaterial({ map: facade });
  const spots = [];
  for (let bx = -220; bx <= 220; bx += 40) {
    for (let bz = -220; bz <= 220; bz += 40) {
      if (bx === CFG.BEACH_X) continue; // open beach boulevard
      if (bx >= 160 && bz >= 160) continue; // marina quarter stays open
      if (bx === 160 && bz === 120) continue; // Club Solano plot
      const downtown = Math.abs(bx) <= 80 && Math.abs(bz) <= 80;
      const hillside = bx <= -160;
      const h = downtown
        ? 34 + rng() * 62
        : hillside
          ? 6 + rng() * 8
          : 9 + rng() * 20;
      const w = 20 + rng() * 6;
      const d = 20 + rng() * 6;
      spots.push({ x: bx, z: bz, w, d, h, downtown });
    }
  }
  const inst = new THREE.InstancedMesh(boxGeo, boxMat, spots.length);
  inst.castShadow = true;
  inst.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  const palette = downtownPalette();
  spots.forEach((b, i) => {
    p.set(b.x, 0, b.z);
    s.set(b.w, b.h, b.d);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
    const base = palette[Math.floor(rng() * palette.length)];
    col.setHex(base);
    // Sunset warmth: tint taller towers warmer.
    if (b.h > 50) col.lerp(new THREE.Color(0xff9a5c), 0.25);
    inst.setColorAt(i, col);
    W.colliders.push({ x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, h: b.h });
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);
  W.buildings = spots;

  // Club Solano: a distinct low wide building with a pink neon sign box.
  const club = new THREE.Mesh(
    new THREE.BoxGeometry(30, 14, 24),
    new THREE.MeshLambertMaterial({ color: 0x7a2e5d, map: facade }),
  );
  club.position.set(160, 7, 120);
  club.castShadow = true;
  group.add(club);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(26, 3, 1),
    new THREE.MeshBasicMaterial({ color: 0xff4fa3 }),
  );
  sign.position.set(160, 13.5, 107.5);
  group.add(sign);
  W.clubPos = { x: 160, z: 120 };
  W.colliders.push({ x: 160, z: 120, hw: 15, hd: 12, h: 14 });

  // Marina: wooden dock strips + moored boats (simple hull boxes) SE corner.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  for (let i = 0; i < 3; i++) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 60), dockMat);
    dock.position.set(190 + i * 22, 0.5, 190);
    group.add(dock);
    const boat = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3, 16),
      new THREE.MeshLambertMaterial({ color: i === 1 ? 0xf2f2f2 : 0x2e6f8e }),
    );
    boat.position.set(190 + i * 22 + 9, 1.2, 180 + i * 8);
    boat.castShadow = true;
    group.add(boat);
  }

  // Palms: instanced trunks + instanced crowns along the boulevard & avenues.
  const palmSpots = [];
  for (let z = -220; z <= 220; z += 40) {
    palmSpots.push([214, z + 10], [228, z - 10]);
  }
  for (let x = -200; x <= 200; x += 80) {
    palmSpots.push([x + 8, -118], [x - 8, 118]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 9, 6);
  trunkGeo.translate(0, 4.5, 0);
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshLambertMaterial({ color: 0x7a5a38 }),
    palmSpots.length,
  );
  const crownGeo = new THREE.ConeGeometry(3.4, 4.5, 7);
  crownGeo.translate(0, 10.5, 0);
  const crowns = new THREE.InstancedMesh(
    crownGeo,
    new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
    palmSpots.length,
  );
  palmSpots.forEach(([x, z], i) => {
    p.set(x, 0, z);
    s.set(1, 0.9 + rng() * 0.3, 1);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  group.add(trunks);
  group.add(crowns);

  // Stunt ramps: angled wedges.
  W.ramps = CFG.RAMPS.map(([x, z, heading]) => {
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(8, 1.2, 12),
      new THREE.MeshLambertMaterial({ color: 0xd86a1e }),
    );
    ramp.position.set(x, 0.9, z);
    ramp.rotation.y = heading;
    ramp.rotation.x = -0.42;
    ramp.castShadow = true;
    group.add(ramp);
    return { x, z, heading, mesh: ramp };
  });

  // Sun postcards: floating gold discs.
  const cardGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.25, 20);
  const cardMat = new THREE.MeshBasicMaterial({ color: 0xffd54a });
  W.postcards = CFG.POSTCARDS.map(([x, z], i) => {
    const mesh = new THREE.Mesh(cardGeo, cardMat);
    mesh.position.set(x, 1.6, z);
    group.add(mesh);
    return { x, z, index: i, taken: false, mesh };
  });

  scene.add(group);
  W.cityGroup = group;
  return group;
}

function downtownPalette() {
  return [
    0x9aa3ad, 0x7d8a99, 0xb0a08a, 0x8a7f70, 0x6b7c8a,
    0xc2b49a, 0x5d6b7a, 0xa8907a, 0x8a94a0, 0x746a5e,
  ];
}
