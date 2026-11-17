// Minimap — one job: the circular minimap canvas.
// Draws the road grid, beach, ocean edge, mission marker, postcards,
// traffic (yellow), police (flashing blue), player (white arrow) and N.
// The canvas is a sibling of #hud, never a child of it.

import { CFG } from './config.js';

let ctx = null;
let canvas = null;

export function initMinimap() {
  canvas = document.getElementById('minimap');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
}

function toMap(v, size) {
  // World -280..300 maps onto the canvas with a small margin.
  const span = 580;
  return ((v + 280) / span) * size;
}

export function drawMinimap(W) {
  if (!ctx) return;
  const S = canvas.width;
  const R = S / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  // Circular clip.
  ctx.beginPath();
  ctx.arc(R, R, R - 2, 0, Math.PI * 2);
  ctx.clip();
  // Background: city green-grey.
  ctx.fillStyle = '#5d7050';
  ctx.fillRect(0, 0, S, S);
  // Ocean + sand on the east edge.
  ctx.fillStyle = '#1f6f8b';
  ctx.fillRect(toMap(280, S), 0, S, S);
  ctx.fillStyle = '#e8cf9a';
  ctx.fillRect(toMap(240, S), 0, toMap(280, S) - toMap(240, S), S);
  // Roads.
  ctx.strokeStyle = '#3a3a40';
  ctx.lineWidth = 3;
  for (let v = -240; v <= 240; v += 40) {
    ctx.beginPath();
    ctx.moveTo(toMap(v, S), 0);
    ctx.lineTo(toMap(v, S), S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, toMap(v, S));
    ctx.lineTo(S, toMap(v, S));
    ctx.stroke();
  }
  // Marina docks.
  ctx.fillStyle = '#8a6b48';
  ctx.fillRect(toMap(186, S), toMap(160, S), 8, 24);
  // Postcards.
  ctx.fillStyle = '#ffd54a';
  for (const pc of W.postcards) {
    if (pc.taken) continue;
    ctx.beginPath();
    ctx.arc(toMap(pc.x, S), toMap(pc.z, S), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission marker: pulsing pink diamond.
  if (W.marker.visible) {
    const mx = toMap(W.marker.position.x, S);
    const my = toMap(W.marker.position.z, S);
    const pr = 5 + Math.sin(W.time * 4) * 1.5;
    ctx.fillStyle = '#ff4fa3';
    ctx.beginPath();
    ctx.moveTo(mx, my - pr);
    ctx.lineTo(mx + pr, my);
    ctx.lineTo(mx, my + pr);
    ctx.lineTo(mx - pr, my);
    ctx.closePath();
    ctx.fill();
  }
  // Traffic: yellow dots. Police: flashing blue.
  ctx.fillStyle = '#ffe14a';
  for (const c of W.traffic) {
    if (!c.active) continue;
    ctx.fillRect(toMap(c.x, S) - 1.5, toMap(c.z, S) - 1.5, 3, 3);
  }
  ctx.fillStyle = Math.sin(W.time * 10) > 0 ? '#4488ff' : '#ff2222';
  for (const c of W.police) {
    if (!c.active) continue;
    ctx.beginPath();
    ctx.arc(toMap(c.x, S), toMap(c.z, S), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player: white arrow, rotated to heading.
  const p = W.player;
  const px = toMap(p.car ? p.car.x : p.x, S);
  const py = toMap(p.car ? p.car.z : p.z, S);
  const heading = p.car ? p.car.heading : p.heading;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // Rim + N.
  ctx.strokeStyle = '#ffffffcc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(R, R, R - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', R, 14);
}
