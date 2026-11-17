// Save — one job: localStorage persistence of progression.
// Stores cash, missions completed, postcards found, best wanted level.

const KEY = 'solmara-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || !s) return null;
    return {
      cash: Number(s.cash) || 0,
      missionsDone: Number(s.missionsDone) || 0,
      postcards: Array.isArray(s.postcards) ? s.postcards.map(Number) : [],
      bestWanted: Number(s.bestWanted) || 0,
      totalEarned: Number(s.totalEarned) || 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(W) {
  try {
    const s = {
      cash: Math.round(W.player.cash),
      missionsDone: W.missions.done,
      postcards: W.postcards.filter((p) => p.taken).map((p) => p.index),
      bestWanted: W.stats.bestWanted,
      totalEarned: Math.round(W.stats.totalEarned),
    };
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full / blocked: the game keeps running without a save.
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
