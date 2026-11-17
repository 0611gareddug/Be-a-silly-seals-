// ===== 픽셀아트 (모든 그림을 코드로 생성 → 외부 이미지 없음) =====
import { TILE, MAP_W, MAP_H, FISH, FUR, STATIONS, zoneX } from './data.js';

const OUT = '#232838';
const cache = new Map();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

// 패턴 문자열 → 픽셀 찍기
function stamp(ctx, ox, oy, rows, pal) {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// ---------- 물범 ----------
const S = 22; // 물범 캔버스 크기
const HATS = {
  1: { o: [9, 2], rows: ['..oooo..', '.oyyyyo.', 'oyywyyyo', 'oyyyyyyo', 'oooooooooo'], pal: { o: OUT, y: '#ffcc33', w: '#fff3b0' } },
  2: { o: [10, -1], rows: ['.oooo.', 'owwwwo', 'owwwwo', 'owwwwo', '.owwo.', 'oggggo'], pal: { o: OUT, w: '#ffffff', g: '#d8dde6' } },
  3: { o: [14, 3], rows: ['o.o', 'ppp', 'o.o'], pal: { o: '#c2185b', p: '#ff6fa8' } },
  4: { o: [8, 1], rows: ['...oooo...', '..obbbbo..', '.obbwbbbo.', 'oooooooooo'], pal: { o: OUT, b: '#2b2b33', w: '#f0f0f0' } },
  5: { o: [10, 1], rows: ['y.y.y', 'yyyyy', 'yryby', 'yyyyy'], pal: { y: '#ffd23f', r: '#e53950', b: '#3fa9f5' } },
};

function sealRaw(look, frame) {
  // frame: 'i0','i1','w0'..'w3','sleep'
  const [c, x] = makeCanvas(S, S);
  const fur = FUR[look.fur] || FUR[0];
  const g = new Array(S * S).fill(null);
  const walk = frame[0] === 'w' ? +frame[1] : -1;
  const sleep = frame === 'sleep';
  const bob = walk === 1 || walk === 3 ? -1 : frame === 'i1' ? 0.4 : 0;
  const by = 15 + bob, hy = 10.5 + bob;
  const rx = walk === 1 || walk === 3 ? 7.4 : 7, ry = walk === 1 || walk === 3 ? 4.2 : 4.6;
  const inE = (px, py, cx, cy, ax, ay) => ((px - cx) / ax) ** 2 + ((py - cy) / ay) ** 2 <= 1;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const X = px + 0.5, Y = py + 0.5;
    let col = null;
    // 꼬리지느러미
    const tailDy = walk >= 0 ? (walk % 2 ? -1 : 1) : 0;
    if (inE(X, Y, 3.2, 16.5 + tailDy * 0.5 + bob, 2.4, 1.3)) col = fur.shade;
    if (inE(X, Y, 10, by, rx, ry)) col = fur.body;
    if (inE(X, Y, 13.5, hy, 4.8, 4.2)) col = fur.body;
    if (col === fur.body) {
      if (Y > by + 0.5 && X > 4.5) col = fur.belly;
      if (inE(X, Y, 15.6, hy + 1.6, 2.4, 1.7)) col = fur.belly;
    }
    // 앞지느러미
    const fx = walk >= 0 ? 10.5 + (walk === 0 ? 1 : walk === 2 ? -1 : 0) : 10.5;
    if (inE(X, Y, fx, by + 3.3, 2.2, 1.1)) col = look.acc === 4 ? '#ffd23f' : fur.shade;
    g[py * S + px] = col;
  }
  if (fur.spots) for (const [sx, sy] of [[7, 12], [10, 11], [12, 7], [6, 15], [14, 13]]) if (g[(sy + Math.round(bob)) * S + sx] === fur.body) g[(sy + Math.round(bob)) * S + sx] = fur.spots;
  // 외곽선
  const out = g.slice();
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    if (g[py * S + px]) continue;
    const n = (a, b) => a >= 0 && b >= 0 && a < S && b < S && g[b * S + a];
    if (n(px + 1, py) || n(px - 1, py) || n(px, py + 1) || n(px, py - 1)) out[py * S + px] = OUT;
  }
  for (let i = 0; i < S * S; i++) if (out[i]) { x.fillStyle = out[i]; x.fillRect(i % S, (i / S) | 0, 1, 1); }
  const hyI = Math.round(hy);
  // 얼굴
  x.fillStyle = '#1a1a24';
  if (sleep) { x.fillRect(12, hyI - 1, 2, 1); x.fillRect(16, hyI - 1, 2, 1); }
  else {
    x.fillRect(12, hyI - 2, 1, 2); x.fillRect(16, hyI - 2, 1, 2);
    x.fillStyle = '#ffffff'; x.fillRect(12, hyI - 2, 1, 1); x.fillRect(16, hyI - 2, 1, 1);
  }
  x.fillStyle = '#3b2a2a'; x.fillRect(14, hyI, 2, 1);
  x.fillStyle = '#ff9db8'; x.fillRect(11, hyI, 1, 1); x.fillRect(18, hyI, 1, 1);
  // 액세서리
  if (look.acc === 1) { x.fillStyle = '#111'; x.fillRect(11, hyI - 2, 3, 2); x.fillRect(15, hyI - 2, 3, 2); x.fillRect(14, hyI - 2, 1, 1); }
  if (look.acc === 2) { x.fillStyle = '#d6303a'; const ty = Math.round(by) - 1; x.fillRect(13, ty, 2, 1); x.fillRect(13, ty + 1, 1, 3); x.fillRect(14, ty + 1, 1, 2); }
  if (look.acc === 3) { x.fillStyle = '#f4f4f4'; const ty = Math.round(by); x.fillRect(9, ty, 6, 4); x.fillStyle = '#9fc5e8'; x.fillRect(9, ty, 6, 1); }
  // 모자
  const h = HATS[look.hat];
  if (h) stamp(x, h.o[0], h.o[1] + Math.round(bob), h.rows, h.pal);
  return c;
}

export function sealSprite(look, frame) {
  const k = `s${look.fur}${look.hat}${look.acc}${frame}`;
  let c = cache.get(k);
  if (!c) { c = sealRaw(look, frame); cache.set(k, c); }
  return c;
}
export const SEAL_SIZE = S;

// ---------- 물고기 / 손질 / 상자 ----------
export function itemSprite(tier, stage) {
  const k = `i${tier}${stage}`;
  let c = cache.get(k);
  if (c) return c;
  const F = FISH[tier];
  if (stage === 0) {
    const L = F.len + 4;
    let x;
    [c, x] = makeCanvas(L + 2, 8);
    for (let py = 0; py < 8; py++) for (let px = 0; px < L + 2; px++) {
      const X = px + 0.5, Y = py + 0.5;
      const body = ((X - (L / 2 + 2)) / (L / 2)) ** 2 + ((Y - 4) / 2.6) ** 2 <= 1;
      const tail = X < 3.5 && Math.abs(Y - 4) < (3.5 - X) * 1.1 + 0.5;
      if (body || tail) { x.fillStyle = Y < 4 ? F.dark : F.color; x.fillRect(px, py, 1, 1); }
    }
    x.fillStyle = '#111'; x.fillRect(L - 1, 3, 1, 1);
    if (tier === 1) { x.fillStyle = '#1d2f55'; for (let i = 5; i < L - 2; i += 2) x.fillRect(i, 2, 1, 2); }
    if (tier === 4) { x.fillStyle = '#fff6c2'; x.fillRect(6, 3, 1, 1); x.fillRect(9, 2, 1, 1); }
  } else if (stage === 1) {
    let x;
    [c, x] = makeCanvas(11, 7);
    x.fillStyle = OUT; x.fillRect(0, 1, 11, 5); x.fillRect(1, 0, 9, 7);
    x.fillStyle = tier === 2 ? '#ff9f80' : tier === 3 ? '#c8455a' : tier === 4 ? '#ffd23f' : '#e8e1d9';
    x.fillRect(1, 1, 9, 5);
    x.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 2; i < 10; i += 3) x.fillRect(i, 2, 1, 3);
  } else {
    let x;
    [c, x] = makeCanvas(12, 11);
    x.fillStyle = OUT; x.fillRect(0, 0, 12, 11);
    x.fillStyle = '#c99858'; x.fillRect(1, 1, 10, 9);
    x.fillStyle = '#a77a40'; x.fillRect(1, 1, 10, 2);
    x.fillStyle = '#e6c88c'; x.fillRect(5, 1, 2, 9);
    x.fillStyle = FISH[tier].color; x.fillRect(2, 6, 3, 3);
    x.fillStyle = OUT; x.fillRect(2, 6, 3, 1);
  }
  cache.set(k, c);
  return c;
}

// ---------- 고양이 ----------
export function catSprite(frame) {
  const k = 'cat' + frame;
  let c = cache.get(k);
  if (c) return c;
  let x;
  [c, x] = makeCanvas(16, 13);
  const rows = frame === 0 ? [
    '..o...o.........',
    '.oko.oko........',
    '.okkkkko........',
    '.okekeko.....oo.',
    '.okkpkko....oko.',
    '..okkkkooooooko.',
    '..okkkkkkkkkko..',
    '..okkwwkkkkkko..',
    '..okkwwkkkkkko..',
    '..okkkkkkkkkko..',
    '..okko.okko.oko.',
    '..oo...oo....oo.',
  ] : [
    '..o...o.........',
    '.oko.oko........',
    '.okkkkko........',
    '.okekeko.....oo.',
    '.okkpkko....oko.',
    '..okkkkooooooko.',
    '..okkkkkkkkkko..',
    '..okkwwkkkkkko..',
    '..okkwwkkkkkko..',
    '..okkkkkkkkkko..',
    '...oko.oko..oko.',
    '...oo..oo...oo..',
  ];
  stamp(x, 0, 0, rows, { o: OUT, k: '#f39a3c', e: '#1a1a1a', p: '#ff8fa3', w: '#ffe2c2' });
  cache.set(k, c);
  return c;
}

// ---------- 사장 초상화 (32x32) ----------
export function bossPortrait(face) {
  const k = 'boss' + face;
  let c = cache.get(k);
  if (c) return c;
  let x;
  [c, x] = makeCanvas(32, 32);
  x.fillStyle = '#1b2a44'; x.fillRect(0, 0, 32, 32);
  const inE = (px, py, cx, cy, ax, ay) => ((px - cx) / ax) ** 2 + ((py - cy) / ay) ** 2 <= 1;
  for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) {
    const X = px + 0.5, Y = py + 0.5;
    let col = null;
    if (inE(X, Y, 16, 32, 13, 9)) col = '#3a3f55';
    if (inE(X, Y, 16, 16, 11, 10)) col = '#7d8796';
    if (inE(X, Y, 16, 20, 6, 4)) col = '#b9c1cc';
    if (col) { x.fillStyle = col; x.fillRect(px, py, 1, 1); }
  }
  // 넥타이
  x.fillStyle = '#c62f3a'; x.fillRect(15, 25, 3, 2); x.fillRect(14, 27, 5, 5);
  x.fillStyle = '#ffffff'; x.fillRect(12, 25, 3, 2); x.fillRect(18, 25, 3, 2);
  // 눈썹/눈
  x.fillStyle = '#eeeeee';
  if (face === 1) { x.fillRect(9, 10, 5, 1); x.fillRect(10, 11, 3, 1); x.fillRect(19, 10, 5, 1); x.fillRect(19, 11, 3, 1); }
  else { x.fillRect(9, 11, 5, 1); x.fillRect(19, 11, 5, 1); }
  x.fillStyle = '#16161c';
  if (face === 2) { x.fillRect(10, 14, 3, 1); x.fillRect(20, 14, 3, 1); x.fillRect(9, 13, 1, 1); x.fillRect(13, 13, 1, 1); x.fillRect(19, 13, 1, 1); x.fillRect(23, 13, 1, 1); }
  else if (face === 3) { x.fillRect(10, 12, 3, 3); x.fillRect(20, 12, 3, 3); x.fillStyle = '#fff'; x.fillRect(11, 13, 1, 1); x.fillRect(21, 13, 1, 1); }
  else { x.fillRect(11, 13, 2, 2); x.fillRect(20, 13, 2, 2); }
  // 안경
  x.fillStyle = '#d7b46a';
  x.strokeStyle = '#d7b46a';
  for (const ox of [8, 18]) { x.fillRect(ox, 11, 7, 1); x.fillRect(ox, 16, 7, 1); x.fillRect(ox, 11, 1, 6); x.fillRect(ox + 6, 11, 1, 6); }
  x.fillRect(15, 13, 3, 1);
  // 코 + 콧수염
  x.fillStyle = '#2a1d1d'; x.fillRect(14, 18, 4, 2);
  x.fillStyle = '#f5f5f5';
  x.fillRect(8, 20, 7, 2); x.fillRect(17, 20, 7, 2); x.fillRect(6, 22, 3, 1); x.fillRect(23, 22, 3, 1);
  if (face === 1 || face === 3) { x.fillStyle = '#5a1f2a'; x.fillRect(14, 23, 4, 2); }
  return cache.set(k, c), c;
}

// ---------- 배경 (구역 해금 상태별 캐시) ----------
function noise(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

export function background(unlocked) {
  const k = 'bg' + unlocked.map((u) => (u ? 1 : 0)).join('');
  let c = cache.get(k);
  if (c) return c;
  let x;
  [c, x] = makeCanvas(MAP_W * TILE, MAP_H * TILE);
  const T = TILE;
  // 바닥
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const X = tx * T, Y = ty * T;
    let base = (tx + ty) % 2 ? '#3b4759' : '#384354', line = '#2f3949';
    const zi = ty >= 1 && ty <= 9 ? [0, 1, 2, 3, 4].find((z) => tx >= zoneX(z) && tx < zoneX(z) + 8) : undefined;
    if (zi !== undefined && ty <= 8) { base = (tx + ty) % 2 ? '#2d5a76' : '#2a536d'; line = '#23465c'; }
    if (tx >= 2 && tx <= 12 && ty >= 21 && ty <= 28) { base = '#6d4357'; line = '#5c3749'; }
    if (tx >= 25 && tx <= 33 && ty >= 20 && ty <= 28) { base = (tx + ty) % 2 ? '#454a52' : '#41464e'; line = '#373b42'; }
    x.fillStyle = base; x.fillRect(X, Y, T, T);
    x.fillStyle = line; x.fillRect(X, Y + T - 1, T, 1); x.fillRect(X + T - 1, Y, 1, T);
    for (let i = 0; i < 3; i++) {
      const n = noise(tx * 3 + i, ty * 7 - i);
      x.fillStyle = 'rgba(255,255,255,0.05)';
      x.fillRect(X + Math.floor(n * 14) + 1, Y + Math.floor(noise(ty + i, tx) * 14) + 1, 1, 1);
    }
  }
  // 휴게실 러그 테두리
  x.fillStyle = '#8e5a72'; x.strokeStyle = '#8e5a72';
  x.fillRect(2 * T, 21 * T, 11 * T, 2); x.fillRect(2 * T, 29 * T - 2, 11 * T, 2); x.fillRect(2 * T, 21 * T, 2, 8 * T); x.fillRect(13 * T - 2, 21 * T, 2, 8 * T);
  // 출하 도크 줄무늬
  for (let tx = 25; tx < 34; tx++) {
    for (let i = 0; i < T; i += 4) { x.fillStyle = (tx * 4 + i) % 8 < 4 ? '#e8c33a' : '#222'; x.fillRect(tx * T + i, 20 * T, 4, 3); }
  }
  // 바닥 안내선 (노란 선)
  x.fillStyle = 'rgba(232,195,58,0.35)';
  x.fillRect(2 * T, 11 * T, 44 * T, 2); x.fillRect(2 * T, 19 * T, 44 * T, 2);
  // 벽
  const wall = (tx, ty) => {
    const X = tx * T, Y = ty * T;
    x.fillStyle = '#1b2232'; x.fillRect(X, Y, T, T);
    x.fillStyle = '#2b3650'; x.fillRect(X, Y, T, 4);
    x.fillStyle = '#222b3f'; x.fillRect(X + 2, Y + 7, 5, 1); x.fillRect(X + 9, Y + 11, 5, 1);
  };
  for (let tx = 0; tx < MAP_W; tx++) { wall(tx, 0); wall(tx, MAP_H - 1); }
  for (let ty = 0; ty < MAP_H; ty++) { wall(0, ty); wall(MAP_W - 1, ty); }
  for (let z = 0; z <= 5; z++) { const wx = z === 0 ? 1 : zoneX(z) - 1; for (let ty = 1; ty <= 8; ty++) wall(wx, ty); }
  for (let ty = 1; ty <= 9; ty++) wall(46, ty);
  for (let z = 0; z < 5; z++) {
    const x0 = zoneX(z);
    for (let tx = x0 - 1; tx < x0 + 9; tx++) {
      const door = tx >= x0 + 2 && tx <= x0 + 5;
      if (!door) wall(tx, 9);
      else if (!unlocked[z]) {
        // 공사 중 바리케이드
        const X = tx * T, Y = 9 * T;
        x.fillStyle = '#384354'; x.fillRect(X, Y, T, T);
        for (let i = 0; i < T; i += 4) { x.fillStyle = (tx * 4 + i) % 8 < 4 ? '#f2c230' : '#1d1d1d'; x.fillRect(X + i, Y + 5, 4, 5); }
        x.fillStyle = '#7a5a2a'; x.fillRect(X + 2, Y + 10, 2, 6); x.fillRect(X + 12, Y + 10, 2, 6);
      }
    }
  }
  // 잠긴 구역 어둡게
  for (let z = 0; z < 5; z++) if (!unlocked[z]) { x.fillStyle = 'rgba(8,10,20,0.55)'; x.fillRect(zoneX(z) * T, T, 8 * T, 8 * T); }
  // 스테이션
  for (const s of STATIONS) drawStation(x, s, unlocked);
  cache.set(k, c);
  return c;
}

function drawStation(x, s, unlocked) {
  const T = TILE, X = s.x * T, Y = s.y * T, W = s.w * T, H = s.h * T;
  const box = (bx, by, bw, bh, fill, edge = OUT) => { x.fillStyle = edge; x.fillRect(bx, by, bw, bh); x.fillStyle = fill; x.fillRect(bx + 1, by + 1, bw - 2, bh - 2); };
  const dim = s.z !== undefined && !unlocked[s.z];
  switch (s.kind) {
    case 'tank':
      box(X, Y, W, H, '#9fb3c8');
      x.fillStyle = '#2f86c4'; x.fillRect(X + 3, Y + 5, W - 6, H - 8);
      x.fillStyle = '#4fb0e8'; x.fillRect(X + 3, Y + 5, W - 6, 3);
      x.fillStyle = '#d9c38a'; x.fillRect(X + 3, Y + H - 6, W - 6, 3);
      x.fillStyle = '#3aa25a'; x.fillRect(X + 6, Y + H - 12, 2, 6); x.fillRect(X + W - 10, Y + H - 14, 2, 8);
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(X + 4, Y + 9, 2, 10);
      break;
    case 'mach':
      box(X, Y, W, H, '#6f7d8e');
      x.fillStyle = '#56626f'; x.fillRect(X + 3, Y + 4, W - 6, 10);
      x.fillStyle = '#2b3240'; x.fillRect(X + 5, Y + 6, W - 10, 6);
      x.fillStyle = '#9aa7b6'; x.fillRect(X - 6, Y + 18, 7, 4);
      x.fillStyle = '#4b5562'; x.fillRect(X + 3, Y + H - 8, W - 6, 5);
      break;
    case 'cut':
      box(X, Y + 4, W, H - 4, '#8a5a3c');
      x.fillStyle = '#e0bb84'; x.fillRect(X + 5, Y + 7, W - 10, H - 16);
      x.fillStyle = '#c99a5c'; x.fillRect(X + 5, Y + H - 10, W - 10, 2);
      x.fillStyle = '#dfe6ee'; x.fillRect(X + W - 12, Y + 9, 8, 2);
      x.fillStyle = '#3a2a22'; x.fillRect(X + W - 15, Y + 9, 3, 2);
      x.fillStyle = '#5a3a28'; x.fillRect(X + 2, Y + H - 2, 3, 2); x.fillRect(X + W - 5, Y + H - 2, 3, 2);
      break;
    case 'pack':
      box(X, Y + 4, W, H - 4, '#6b7a5a');
      x.fillStyle = '#c99858'; x.fillRect(X + 5, Y + 1, 14, 12); x.fillStyle = OUT; x.fillRect(X + 5, Y + 1, 14, 1);
      x.fillStyle = '#e6c88c'; x.fillRect(X + 11, Y + 1, 2, 12);
      x.fillStyle = '#b8874a'; x.fillRect(X + 24, Y + 6, 16, 9); x.fillStyle = '#d7b076'; x.fillRect(X + 24, Y + 6, 16, 2);
      x.fillStyle = '#ddd'; x.fillRect(X + 8, Y + 20, 6, 4);
      break;
    case 'pc':
      box(X, Y + 8, W, H - 8, '#5a4636');
      box(X + 5, Y - 2, W - 10, 18, '#2a2f3a');
      x.fillStyle = '#3fd0ff'; x.fillRect(X + 7, Y, W - 14, 12);
      x.fillStyle = '#9ff0ff'; x.fillRect(X + 9, Y + 2, 8, 1); x.fillRect(X + 9, Y + 5, 12, 1); x.fillRect(X + 9, Y + 8, 6, 1);
      x.fillStyle = '#c8ccd4'; x.fillRect(X + 8, Y + 20, W - 16, 3);
      break;
    case 'board':
      box(X, Y - 6, W, H + 6, '#b98a55');
      [['#fff3a8', 4], ['#ffc7d9', 18], ['#c9f2ff', 32], ['#fff3a8', 46]].forEach(([c, o]) => { x.fillStyle = c; x.fillRect(X + o, Y - 3, 11, 13); x.fillStyle = '#d33'; x.fillRect(X + o + 5, Y - 3, 2, 2); });
      break;
    case 'sofa':
      box(X, Y - 6, W, H + 6, '#b0463e');
      x.fillStyle = '#d0625a'; x.fillRect(X + 4, Y - 2, W - 8, 10);
      x.fillStyle = '#8c332d'; x.fillRect(X + W / 2, Y - 2, 1, 10);
      x.fillStyle = '#ffe066'; x.fillRect(X + 10, Y + 1, 6, 6);
      break;
    case 'mop':
      box(X, Y, W, H, '#5d6b7c');
      x.fillStyle = '#4a5664'; x.fillRect(X + 4, Y + 4, W - 8, H - 8);
      x.fillStyle = '#ffd23f'; x.fillRect(X + W - 9, Y + 6, 2, 2);
      x.fillStyle = '#3f8fd8'; x.fillRect(X + 6, Y + H - 12, 10, 8);
      x.fillStyle = '#c9a26b'; x.fillRect(X + 18, Y + 3, 2, H - 8);
      x.fillStyle = '#eee'; x.fillRect(X + 15, Y + H - 7, 8, 4);
      break;
    case 'truck':
      // 짐칸
      box(X + 22, Y - 10, W - 22, H + 8, '#f1f3f6');
      x.fillStyle = '#3a8fd8'; x.fillRect(X + 26, Y + 6, W - 30, 8);
      x.fillStyle = '#ffffff'; x.fillRect(X + 30, Y + 8, 30, 4);
      // 운전석
      box(X, Y + 4, 24, H - 6, '#3a8fd8');
      x.fillStyle = '#bfe6ff'; x.fillRect(X + 3, Y + 8, 12, 9);
      x.fillStyle = '#ffe066'; x.fillRect(X + 1, Y + H - 12, 3, 3);
      // 바퀴
      x.fillStyle = OUT; x.fillRect(X + 6, Y + H - 4, 10, 6); x.fillRect(X + W - 18, Y + H - 4, 10, 6);
      x.fillStyle = '#777'; x.fillRect(X + 9, Y + H - 2, 4, 2); x.fillRect(X + W - 15, Y + H - 2, 4, 2);
      break;
  }
  if (dim) { x.fillStyle = 'rgba(8,10,20,0.4)'; x.fillRect(X, Y - 6, W, H + 6); }
}
