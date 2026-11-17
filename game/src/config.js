// Solmara: Sunset Heist — shared constants, tuning and the seeded RNG.
// One job: every number the rest of the game agrees on lives here.

export const CFG = {
  // City grid: roads run on lines x,z = 0 (mod 40); block centres sit at
  // 20 (mod 40). City spans -240..240; the beach boulevard is the open
  // column at x = 220 (no buildings there); sand 240..280, ocean past 280.
  CITY: 240,
  ROAD_STEP: 40,
  ROAD_W: 10,
  BEACH_X: 220,
  SAND_X: 240,
  OCEAN_X: 280,

  // Player car handling (arcade): steer rate, lateral grip, drift grip.
  CAR: {
    accel: 24,
    brake: 34,
    maxSpeed: 42,
    maxReverse: 13,
    steer: 1.1,
    grip: 2.2,
    driftGrip: 1.2,
    drag: 0.35,
  },
  TRAFFIC_SPEED: 14,
  PED_SPEED: 1.6,
  PED_RUN: 5.2,
  WALK_SPEED: 5.5,
  RUN_SPEED: 9.5,

  // Wanted / police.
  WANTED_MAX: 5,
  COP_MAX_ACTIVE: 4,
  COP_SPEED: 38, // slightly slower than the player's 42: a flat-out escape works, but cops cut corners and ram
  LOSE_DIST: 130,
  LOSE_TIME: 6,

  // Combat / health.
  PLAYER_HP: 100,
  PISTOL_DAMAGE: 34,
  PISTOL_RANGE: 46,
  PISTOL_AMMO: 12,
  FIST_DAMAGE: 20,
  FIST_RANGE: 2.6,

  // Economy.
  START_CASH: 50,
  TAXI_FARE: 120,
  POSTCARD_VALUE: 50,
  STUNT_VALUE: 150,

  // Missions.
  MISSION_PAYOUTS: [300, 500, 800, 1200, 2000],
  MISSION_NAMES: [
    'Welcome Back',
    'Courier Run',
    'The Marina Job',
    "Solano's Cut",
    'Sunset Run',
  ],

  // Postcard spots (10) scattered across the districts.
  POSTCARDS: [
    [222, -200], [222, 120], [-40, -200], [120, -40], [-200, 40],
    [40, 200], [-160, -160], [200, 200], [-220, -200], [80, 80],
  ],
  // Stunt ramps (x, z, heading).
  RAMPS: [
    [100, -100, 0],
    [-100, 100, Math.PI / 2],
    [180, -180, Math.PI],
  ],
  // Taxi stands: peds waiting for a fare.
  TAXI_STANDS: [[-40, 60], [80, -120], [160, 40], [-120, -80]],
};

// Deterministic RNG (mulberry32) so ?seed= stages identical worlds.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Shortest signed angle from a to b.
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function fwd(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
// Nearest road line (multiple of 40) to a coordinate.
export function nearestRoad(v) {
  return Math.round(v / CFG.ROAD_STEP) * CFG.ROAD_STEP;
}
