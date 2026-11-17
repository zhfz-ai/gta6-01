// Audio — one job: all sound is synthesized with WebAudio in code.
// No audio files. Engine hum, siren, gunshot, punch, pickup, jingles.
// Everything guards on the context existing (created on first gesture).

let ctx = null;
let master = null;
let engineOsc = null;
let engineOsc2 = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = 0;
let muted = false;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Engine: two detuned saws through a lowpass, gain follows speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filt);
    engineOsc2.connect(filt);
    filt.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
    // Siren: one sine whose frequency we wobble in update().
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  } catch {
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function isMuted() { return muted; }

// Called every frame: engine pitch from speed, siren wail while wanted.
export function updateAudio(W, dt) {
  if (!ctx) return;
  const p = W.player;
  const speed = p.car ? Math.abs(p.car.speed) : 0;
  const driving = !!p.car && speed > 0.5;
  const target = driving ? 0.05 + Math.min(0.12, speed * 0.0025) : 0.0;
  engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
  const f = 50 + speed * 2.2;
  engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
  engineOsc2.frequency.setTargetAtTime(f * 1.5 + 3, ctx.currentTime, 0.08);
  // Two-tone siren while any cop is actively chasing.
  const wailing = W.player.wanted > 0 && W.police.some((c) => c.active);
  sirenTimer += dt;
  const tone = Math.sin(sirenTimer * 2.4) > 0 ? 720 : 540;
  sirenOsc.frequency.setTargetAtTime(tone, ctx.currentTime, 0.05);
  sirenGain.gain.setTargetAtTime(wailing ? 0.035 : 0, ctx.currentTime, 0.2);
}

function blip(freq, dur, type, vol, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, lowpass) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

export function sfxShot() { noiseBurst(0.16, 0.5, 2600); blip(160, 0.08, 'square', 0.18); }
export function sfxPunch() { noiseBurst(0.09, 0.35, 900); }
export function sfxPickup() { blip(660, 0.1, 'sine', 0.25); blip(990, 0.16, 'sine', 0.25, 0.09); }
export function sfxCash() { blip(880, 0.1, 'sine', 0.22); blip(1174, 0.12, 'sine', 0.22, 0.08); blip(1568, 0.2, 'sine', 0.22, 0.16); }
export function sfxMissionDone() {
  [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.28, i * 0.11));
}
export function sfxFail() { blip(220, 0.3, 'sawtooth', 0.2); blip(174, 0.45, 'sawtooth', 0.2, 0.25); }
export function sfxCrash() { noiseBurst(0.25, 0.4, 500); }
export function sfxClick() { blip(440, 0.06, 'sine', 0.15); }
export function sfxSirenBlip() { blip(880, 0.12, 'square', 0.12); blip(660, 0.12, 'square', 0.12, 0.14); }
