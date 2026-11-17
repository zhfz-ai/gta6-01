// Render — one job: renderer, sunset lighting, chase camera, effects.
// Warm directional sun low in the west, pink haze fog, a sun disc on
// the horizon, ocean shimmer, and the muzzle-flash light.

import * as THREE from 'three';
import { clamp, lerp, angDiff } from './config.js';

export function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('game').appendChild(renderer.domElement);
  return renderer;
}

export function setupScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xff9e66);
  scene.fog = new THREE.Fog(0xff9a6a, 140, 560);

  // Sunset: warm sun low in the west (-x), long shadows east.
  const sun = new THREE.DirectionalLight(0xffb37a, 2.4);
  sun.position.set(-180, 90, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffc4a0, 0x5a4a3a, 1.1));

  // Sun disc on the western horizon.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  disc.position.set(-420, 55, 40);
  disc.lookAt(0, 55, 40);
  scene.add(disc);

  // Muzzle flash light (intensity driven by W.flash).
  const flash = new THREE.PointLight(0xffd27a, 0, 30);
  flash.position.set(0, 2, 0);
  scene.add(flash);
  scene.userData.flashLight = flash;
  return scene;
}

export function createCamera() {
  const cam = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  return cam;
}

// Chase camera. camYaw is the direction the camera looks; the camera
// sits behind the target. Shots may override W.camOverride {yaw,pitch,dist}.
export function updateCamera(W, camera, dt) {
  const p = W.player;
  const tx = p.car ? p.car.x : p.x;
  const tz = p.car ? p.car.z : p.z;
  const ty = p.car ? p.car.y : 0;

  // Desired yaw follows the player heading (with lag); shots override.
  const ov = W.camOverride;
  let wantYaw;
  let wantPitch = 0.32;
  let wantDist = p.car ? 13 : 9;
  if (ov) {
    wantYaw = ov.yaw;
    wantPitch = ov.pitch;
    wantDist = ov.dist;
  } else {
    wantYaw = W.cam.targetYaw ?? p.heading;
  }
  // Smooth yaw toward the target (shortest arc).
  const k = 1 - Math.exp(-(ov ? 8 : 3.2) * dt);
  W.cam.yaw += angDiff(W.cam.yaw, wantYaw) * k;
  W.cam.pitch = lerp(W.cam.pitch, wantPitch, 1 - Math.exp(-4 * dt));
  W.cam.dist = lerp(W.cam.dist, wantDist, 1 - Math.exp(-4 * dt));

  const cy = W.cam.yaw;
  const cp = W.cam.pitch;
  const cd = W.cam.dist;
  const cx = tx - Math.sin(cy) * Math.cos(cp) * cd;
  const cz = tz - Math.cos(cy) * Math.cos(cp) * cd;
  const cyPos = ty + 2 + Math.sin(cp) * cd;
  camera.position.set(cx, cyPos, cz);
  // Look slightly ahead of the target in the direction of travel.
  camera.lookAt(
    tx + Math.sin(cy) * 4,
    ty + 1.6,
    tz + Math.cos(cy) * 4,
  );
}

export function updateEffects(W, dt) {
  const scene = W.scene;
  // Ocean shimmer.
  const ocean = scene.getObjectByName('ocean');
  if (ocean) ocean.position.y = -0.4 + Math.sin(W.time * 0.7) * 0.15;
  // Muzzle flash.
  const flash = scene.userData.flashLight;
  if (flash) {
    if (W.flash > 0) {
      const p = W.player;
      flash.position.set(p.x, 2, p.z);
      flash.intensity = 60;
    } else {
      flash.intensity = 0;
    }
  }
  // Postcard spin + bob.
  for (const pc of W.postcards) {
    if (pc.taken) continue;
    pc.mesh.rotation.y += dt * 2;
    pc.mesh.position.y = 1.6 + Math.sin(W.time * 2 + pc.index) * 0.25;
  }
}
