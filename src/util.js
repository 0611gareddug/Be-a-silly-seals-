import { TILE, MAP_W, MAP_H } from './data.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
export const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

// 플레이어(발 위치)와 스테이션 사각형 사이 거리(px)
export function distToStation(px, py, s) {
  const x0 = s.x * TILE, y0 = s.y * TILE, x1 = x0 + s.w * TILE, y1 = y0 + s.h * TILE;
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.hypot(dx, dy);
}

// 원 vs 타일 충돌 이동 (축 분리)
const HB_W = 5, HB_H = 3; // 반폭, 반높이
export function solidAt(solid, px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return solid[ty * MAP_W + tx] === 1;
}
function boxHit(solid, x, y) {
  return solidAt(solid, x - HB_W, y - HB_H) || solidAt(solid, x + HB_W, y - HB_H) ||
    solidAt(solid, x - HB_W, y + HB_H) || solidAt(solid, x + HB_W, y + HB_H);
}
export function moveWithCollision(solid, e, dx, dy) {
  let hitX = false, hitY = false;
  if (dx) { const nx = e.x + dx; if (!boxHit(solid, nx, e.y)) e.x = nx; else hitX = true; }
  if (dy) { const ny = e.y + dy; if (!boxHit(solid, e.x, ny)) e.y = ny; else hitY = true; }
  // 끼임 탈출
  if (boxHit(solid, e.x, e.y)) unstick(solid, e);
  return { hitX, hitY };
}
export function unstick(solid, e) {
  for (let r = 2; r < 64; r += 2) {
    for (let a = 0; a < 8; a++) {
      const nx = e.x + Math.cos(a * Math.PI / 4) * r, ny = e.y + Math.sin(a * Math.PI / 4) * r;
      if (!boxHit(solid, nx, ny)) { e.x = nx; e.y = ny; return; }
    }
  }
}

// BFS 길찾기 (타일) → 월드 좌표 웨이포인트 배열
export function findPath(solid, sx, sy, tx, ty) {
  const s = Math.floor(sy / TILE) * MAP_W + Math.floor(sx / TILE);
  const gx = Math.floor(tx / TILE), gy = Math.floor(ty / TILE);
  const goal = gy * MAP_W + gx;
  if (s === goal) return [{ x: tx, y: ty }];
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  prev[s] = s;
  const q = [s];
  let head = 0, found = false;
  while (head < q.length) {
    const c = q[head++];
    if (c === goal) { found = true; break; }
    const cx = c % MAP_W, cy = (c / MAP_W) | 0;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [ox, oy] of nb) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const n = ny * MAP_W + nx;
      if (prev[n] !== -1 || (solid[n] && n !== goal)) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (!found) return null;
  const path = [];
  let c = goal;
  while (c !== s) { path.push({ x: (c % MAP_W) * TILE + TILE / 2, y: ((c / MAP_W) | 0) * TILE + TILE / 2 }); c = prev[c]; }
  path.reverse();
  path[path.length - 1] = { x: tx, y: ty };
  return path;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem('ssff_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ssff_' + k, JSON.stringify(v)); } catch { /* 무시 */ } },
};

export const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeRoomCode = () => Array.from({ length: 6 }, () => pick(ROOM_CHARS)).join('');
