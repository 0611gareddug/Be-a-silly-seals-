// ===== 공장 월드 그래픽: 바닥 · 벽 · 구조물 · 인테리어 (원형 도넛 맵) =====
import {
  TILE, MAP_W, MAP_H, FISH, STATIONS, STATION_BY_ID, PROPS, CX, CY, R_HUB, R_WALK, R_BELT, GATES, SECTIONS,
  polar, tilePolar, sectionOf, MAX_LV,
} from './data.js';
import { makeCanvas, itemSprite } from './sprites.js';

const T = TILE;
const OUT = '#1c2130';
const cache = new Map();
const FLOOR = [
  ['#2c5068', '#294b61', '#244257'], // ① 수조 (젖은 푸른 타일)
  ['#35534c', '#314e47', '#2a443e'], // ② 손질 (청록 회색)
  ['#51483a', '#4c4436', '#423b2f'], // ③ 포장 (따뜻한 회갈색)
  ['#413b55', '#3c3750', '#342f46'], // ④ 사무·휴게 (보라 회색)
];
function noise(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
const WX = (tx) => tx * T;

// 공통: 입체 상자 (윗면 + 앞면 + 그림자)
function shadow(x, X, Y, W, H) { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(X + 3, Y + 4, W, H); }
function box3d(x, X, Y, W, H, top, front, frontH = 6, edge = OUT) {
  x.fillStyle = edge; x.fillRect(X, Y, W, H);
  x.fillStyle = top; x.fillRect(X + 1, Y + 1, W - 2, H - frontH - 1);
  x.fillStyle = front; x.fillRect(X + 1, Y + H - frontH, W - 2, frontH - 1);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(X + 1, Y + 1, W - 2, 1);
}
function rivets(x, X, Y, W, H, col = '#c9d3df') { x.fillStyle = col; [[X + 3, Y + 3], [X + W - 4, Y + 3], [X + 3, Y + H - 4], [X + W - 4, Y + H - 4]].forEach(([a, b]) => x.fillRect(a, b, 1, 1)); }
function text1x(x, s, X, Y, col, size = 11) {
  x.font = `${size}px Galmuri11, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(8,10,18,0.85)';
  for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) x.fillText(s, X + a, Y + b);
  x.fillStyle = col; x.fillText(s, X, Y);
}

// ---------- 정적 배경 (해금 상태별 캐시) ----------
export function background(unlocked) {
  const k = 'bg' + unlocked.map((u) => (u ? 1 : 0)).join('');
  let c = cache.get(k);
  if (c) return c;
  let x;
  [c, x] = makeCanvas(MAP_W * T, MAP_H * T);
  // 바깥 공간
  x.fillStyle = '#0a0d16'; x.fillRect(0, 0, MAP_W * T, MAP_H * T);
  // 바닥 + 벽
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const { r, a } = tilePolar(tx, ty);
    const X = tx * T, Y = ty * T;
    if (r > R_BELT + 2.2) {
      if (noise(tx, ty) > 0.93) { x.fillStyle = '#141a28'; x.fillRect(X + 4, Y + 4, 2, 2); }
      continue;
    }
    if (r > R_BELT) { // 바깥 벽 (벽돌)
      x.fillStyle = '#232b3e'; x.fillRect(X, Y, T, T);
      x.fillStyle = '#2f3a52'; x.fillRect(X, Y, T, 3);
      x.fillStyle = '#1a2030';
      x.fillRect(X, Y + 8, T, 1); x.fillRect(X + ((ty % 2) ? 4 : 11), Y + 3, 1, 5); x.fillRect(X + ((ty % 2) ? 11 : 4), Y + 9, 1, 7);
      continue;
    }
    let base, alt, line;
    if (r < R_HUB) { base = (tx + ty) % 2 ? '#4a4f58' : '#464b54'; line = '#3d4149'; }
    else {
      const f = FLOOR[sectionOf(a)];
      base = (tx + ty) % 2 ? f[0] : f[1]; line = f[2];
      if (r > R_WALK - 1.2) { base = f[2]; } // 벽 쪽 배수로
    }
    alt = base;
    x.fillStyle = alt; x.fillRect(X, Y, T, T);
    x.fillStyle = line; x.fillRect(X, Y + T - 1, T, 1); x.fillRect(X + T - 1, Y, 1, T);
    for (let i = 0; i < 3; i++) {
      const n = noise(tx * 3 + i, ty * 7 - i);
      x.fillStyle = 'rgba(255,255,255,0.05)';
      x.fillRect(X + Math.floor(n * 14) + 1, Y + Math.floor(noise(ty + i, tx) * 14) + 1, 1, 1);
    }
    if (r > R_WALK - 1.2 && (tx + ty) % 3 === 0) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(X + 3, Y + 7, 10, 2); }
  }
  // 허브 경계 (노랑-검정 링)
  ring(x, R_HUB, 3, (i) => (i % 2 ? '#e8c33a' : '#1d1d1d'), 72);
  // 장식 컨베이어 벨트 (정적 부분)
  const cxp = CX * T, cyp = CY * T;
  x.lineWidth = (R_BELT - R_WALK) * T; x.strokeStyle = '#26282e';
  x.beginPath(); x.arc(cxp, cyp, ((R_BELT + R_WALK) / 2) * T, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 2; x.strokeStyle = '#8a95a6';
  x.beginPath(); x.arc(cxp, cyp, R_WALK * T + 1, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(cxp, cyp, R_BELT * T - 1, 0, Math.PI * 2); x.stroke();
  // 벨트 배출구 (아래쪽 슈트)
  { const p = polar((R_BELT + R_WALK) / 2, 268); x.fillStyle = '#111'; x.fillRect(p.x * T - 12, p.y * T - 10, 24, 20); x.fillStyle = '#555'; for (let i = 0; i < 5; i++) x.fillRect(p.x * T - 10 + i * 5, p.y * T - 8, 2, 16); }
  // 게이트: 바닥 안전선
  for (const g of GATES) for (let r = R_HUB + 1.6; r < R_WALK - 0.8; r += 0.25) {
    const p = polar(r, g); x.fillStyle = Math.floor(r * 4) % 2 ? '#e8c33a' : '#222'; x.fillRect(Math.round(p.x * T) - 2, Math.round(p.y * T) - 2, 4, 4);
  }
  // 동선 (바닥 색깔 점선 화살표)
  flowArc(x, 16.2, 62, 152, '#4fb3ff'); // ① 수조 → ② 손질
  flowArc(x, 16.2, 208, 244, '#59d98a'); // ② 손질 → ③ 포장
  for (const a of [248, 270, 292]) flowRadial(x, a, 15.6, R_HUB + 1.2, '#ffab40'); // ③ 포장 → 트럭
  flowRadial(x, 90, R_HUB + 1.2, 17.6, 'rgba(230,240,255,0.55)'); // 트럭 → ① 수조 (복귀)
  // 구역 이름 (바닥 페인트)
  for (const s of SECTIONS) { const p = polar(12.6, s.a); text1x(x, s.n, p.x * T, p.y * T, s.col); }
  // 구역(수조) 바닥 패치
  for (let z = 0; z < 5; z++) {
    const s = STATION_BY_ID['tank' + z];
    x.fillStyle = FISH[z].color; x.globalAlpha = 0.18;
    x.fillRect(s.x * T - 6, s.y * T - 4, s.w * T + 12, s.h * T + 18);
    x.globalAlpha = 1;
  }
  // 바닥 파이프 (수조 구역 기계들을 잇는 배관)
  pipeArc(x, 27.6, 40, 140);
  // 벽 장식
  wallDeco(x);
  // 소품 (바닥형 먼저, 그다음 단단한 것)
  for (const p of PROPS) if (!p.solid) drawProp(x, p);
  for (const p of PROPS) if (p.solid) { shadow(x, p.x * T, p.y * T, p.w * T, p.h * T); drawProp(x, p); }
  // 구조물
  for (const s of STATIONS) {
    if (s.kind === 'mach') continue; // 기계는 레벨에 따라 동적으로 그림
    shadow(x, s.x * T, s.y * T, s.w * T, s.h * T);
    drawStation(x, s, unlocked);
  }
  // 수조 ↔ 기계 배관
  for (let z = 0; z < 5; z++) {
    const t = STATION_BY_ID['tank' + z], m = STATION_BY_ID['mach' + z];
    const ax = (t.x + t.w / 2) * T, ay = t.y * T, bx = (m.x + m.w / 2) * T, by = (m.y + m.h) * T;
    x.fillStyle = '#6f7b8a';
    x.fillRect(Math.min(ax, bx) - 2, by, Math.abs(ax - bx) + 4, 4);
    x.fillRect(ax - 2, Math.min(ay, by), 4, Math.abs(ay - by) + 2);
    x.fillStyle = '#9aa7b6'; x.fillRect(ax - 3, ay - 3, 6, 3);
  }
  cache.set(k, c);
  return c;
}

function ring(x, r, size, colFn, n) {
  for (let i = 0; i < n; i++) {
    const p = polar(r, (i / n) * 360);
    x.fillStyle = colFn(i); x.fillRect(Math.round(p.x * T) - size / 2, Math.round(p.y * T) - size / 2, size, size);
  }
}
function flowArc(x, r, a0, a1, col) {
  const step = 2.6;
  let i = 0;
  for (let a = a0; a <= a1; a += step, i++) {
    const p = polar(r, a);
    const X = Math.round(p.x * T), Y = Math.round(p.y * T);
    x.fillStyle = col; x.globalAlpha = 0.55;
    if (i % 5 === 4) { // 화살표 머리 (진행 방향)
      const q = polar(r, a + 1.5); const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
      chevron(x, X, Y, dx / l, dy / l, col);
    } else x.fillRect(X - 1, Y - 1, 3, 3);
    x.globalAlpha = 1;
  }
}
function flowRadial(x, a, r0, r1, col) {
  const dir = r1 > r0 ? 1 : -1;
  let i = 0;
  for (let r = r0; dir > 0 ? r <= r1 : r >= r1; r += dir * 0.7, i++) {
    const p = polar(r, a); const X = Math.round(p.x * T), Y = Math.round(p.y * T);
    x.fillStyle = col; x.globalAlpha = 0.55;
    if (i % 4 === 3) { const q = polar(r + dir, a); const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy); chevron(x, X, Y, dx / l, dy / l, col); }
    else x.fillRect(X - 1, Y - 1, 3, 3);
    x.globalAlpha = 1;
  }
}
function chevron(x, X, Y, dx, dy, col) {
  x.fillStyle = col;
  const px = -dy, py = dx;
  for (let k = 0; k < 5; k++) {
    x.fillRect(Math.round(X + dx * 2 - dx * k + px * k) - 1, Math.round(Y + dy * 2 - dy * k + py * k) - 1, 2, 2);
    x.fillRect(Math.round(X + dx * 2 - dx * k - px * k) - 1, Math.round(Y + dy * 2 - dy * k - py * k) - 1, 2, 2);
  }
}
function pipeArc(x, r, a0, a1) {
  for (let a = a0; a <= a1; a += 0.6) {
    const p = polar(r, a);
    x.fillStyle = '#56606e'; x.fillRect(Math.round(p.x * T) - 2, Math.round(p.y * T) - 2, 5, 5);
    x.fillStyle = '#7e8a99'; x.fillRect(Math.round(p.x * T) - 2, Math.round(p.y * T) - 2, 5, 1);
  }
  for (let a = a0; a <= a1; a += 9) { const p = polar(r, a); x.fillStyle = '#a7b3c2'; x.fillRect(Math.round(p.x * T) - 3, Math.round(p.y * T) - 3, 7, 7); x.fillStyle = '#56606e'; x.fillRect(Math.round(p.x * T) - 1, Math.round(p.y * T) - 1, 3, 3); }
}

// 벽 장식: 창문, 포스터, 시계 자리 (팬·시계바늘·갈매기는 동적)
export const WALL_DECO = [
  { k: 'window', a: 75 }, { k: 'window', a: 105 }, { k: 'window', a: 255 }, { k: 'window', a: 285 },
  { k: 'poster', a: 150, t: '물범도 헬멧!' }, { k: 'poster', a: 30, t: '오늘도 무사고' }, { k: 'poster', a: 210, t: '칼 조심' }, { k: 'poster', a: 320, t: '이달의 사원' },
  { k: 'clock', a: 90 }, { k: 'fan', a: 165 }, { k: 'fan', a: 15 }, { k: 'fan', a: 240 }, { k: 'fan', a: 340 },
];
function wallDeco(x) {
  for (const d of WALL_DECO) {
    const p = polar(R_BELT + 1.1, d.a);
    const X = Math.round(p.x * T), Y = Math.round(p.y * T);
    if (d.k === 'window') {
      x.fillStyle = OUT; x.fillRect(X - 14, Y - 10, 28, 20);
      const g = x.createLinearGradient(0, Y - 9, 0, Y + 9); g.addColorStop(0, '#7fb8e8'); g.addColorStop(0.55, '#a9d4f5'); g.addColorStop(0.56, '#2f6fa8'); g.addColorStop(1, '#1f5585');
      x.fillStyle = g; x.fillRect(X - 13, Y - 9, 26, 18);
      x.fillStyle = '#c9d3df'; x.fillRect(X - 1, Y - 9, 2, 18); x.fillRect(X - 13, Y - 1, 26, 2);
    } else if (d.k === 'poster') {
      x.fillStyle = OUT; x.fillRect(X - 10, Y - 12, 20, 24);
      x.fillStyle = '#f3ecd8'; x.fillRect(X - 9, Y - 11, 18, 22);
      x.fillStyle = d.a === 320 ? '#ffd23f' : '#d6303a'; x.fillRect(X - 9, Y - 11, 18, 5);
      x.fillStyle = '#8f9cb0'; x.fillRect(X - 5, Y - 3, 10, 7); x.fillStyle = '#222'; x.fillRect(X - 2, Y - 1, 1, 1); x.fillRect(X + 2, Y - 1, 1, 1);
      x.fillStyle = '#555'; x.fillRect(X - 7, Y + 7, 14, 1);
    } else if (d.k === 'clock') {
      x.fillStyle = OUT; x.fillRect(X - 9, Y - 9, 18, 18); x.fillStyle = '#f5f5f5'; x.fillRect(X - 8, Y - 8, 16, 16);
      x.fillStyle = '#333'; [[0, -7], [7, 0], [0, 6], [-7, 0]].forEach(([a, b]) => x.fillRect(X + a, Y + b, 1, 1));
    } else if (d.k === 'fan') {
      x.fillStyle = OUT; x.fillRect(X - 10, Y - 10, 20, 20); x.fillStyle = '#4b5562'; x.fillRect(X - 9, Y - 9, 18, 18);
    }
  }
}

// ---------- 구조물 ----------
function drawStation(x, s, unlocked) {
  const X = s.x * T, Y = s.y * T, W = s.w * T, H = s.h * T;
  switch (s.kind) {
    case 'tank': {
      // 금속 프레임
      box3d(x, X, Y, W, H, '#8fa3b8', '#5d6b7c', 8);
      rivets(x, X, Y, W, H);
      // 물 (유리)
      const g = x.createLinearGradient(0, Y + 8, 0, Y + H - 12);
      g.addColorStop(0, '#4fb0e8'); g.addColorStop(1, '#1d5f93');
      x.fillStyle = OUT; x.fillRect(X + 4, Y + 6, W - 8, H - 16);
      x.fillStyle = g; x.fillRect(X + 5, Y + 7, W - 10, H - 18);
      // 모래·돌·수초
      x.fillStyle = '#d9c38a'; x.fillRect(X + 5, Y + H - 16, W - 10, 5);
      x.fillStyle = '#a99467'; x.fillRect(X + 18, Y + H - 18, 6, 3); x.fillRect(X + 60, Y + H - 17, 8, 3);
      x.fillStyle = '#3aa25a'; x.fillRect(X + 10, Y + H - 28, 2, 12); x.fillRect(X + 13, Y + H - 24, 2, 8); x.fillRect(X + W - 16, Y + H - 30, 2, 14); x.fillRect(X + W - 13, Y + H - 25, 2, 9);
      x.fillStyle = '#2b8046'; x.fillRect(X + 11, Y + H - 22, 1, 4); x.fillRect(X + W - 15, Y + H - 22, 1, 4);
      // 유리 반사
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(X + 8, Y + 10, 2, 16); x.fillRect(X + 12, Y + 10, 1, 9);
      // 이름판
      x.fillStyle = OUT; x.fillRect(X + W / 2 - 16, Y + H - 9, 32, 7); x.fillStyle = FISH[s.z].color; x.fillRect(X + W / 2 - 15, Y + H - 8, 30, 5);
      if (!unlocked[s.z]) {
        // 공사 중: 비닐 커버 + 테이프
        x.fillStyle = 'rgba(225,232,240,0.82)'; x.fillRect(X - 2, Y - 2, W + 4, H + 4);
        x.fillStyle = 'rgba(160,175,190,0.6)'; for (let i = 6; i < W; i += 13) x.fillRect(X + i, Y, 1, H);
        tape(x, X, Y + 6, X + W, Y + H - 6); tape(x, X, Y + H - 6, X + W, Y + 6);
        x.fillStyle = OUT; x.fillRect(X + W / 2 - 18, Y + H / 2 - 7, 36, 14); x.fillStyle = '#ffd23f'; x.fillRect(X + W / 2 - 17, Y + H / 2 - 6, 34, 12);
        x.fillStyle = '#1d1d1d'; for (let i = 0; i < 34; i += 6) x.fillRect(X + W / 2 - 17 + i, Y + H / 2 - 6, 3, 2);
      }
      break;
    }
    case 'cut': {
      box3d(x, X, Y + 2, W, H - 2, '#c9d1da', '#7d8794', 9);
      x.fillStyle = '#e6ebf0'; x.fillRect(X + 2, Y + 3, W - 4, 2);
      // 도마
      x.fillStyle = OUT; x.fillRect(X + 13, Y + 8, 32, 22); x.fillStyle = '#e0bb84'; x.fillRect(X + 14, Y + 9, 30, 20);
      x.fillStyle = '#c99a5c'; for (let i = 0; i < 4; i++) x.fillRect(X + 16 + i * 7, Y + 11 + (i % 2) * 7, 4, 1);
      // 칼꽂이
      x.fillStyle = '#5a3a28'; x.fillRect(X + W - 13, Y + 6, 9, 12);
      x.fillStyle = '#dfe6ee'; x.fillRect(X + W - 12, Y + 3, 1, 4); x.fillRect(X + W - 9, Y + 2, 1, 5); x.fillRect(X + W - 6, Y + 4, 1, 3);
      // 얼음 트레이
      x.fillStyle = '#7fc4e8'; x.fillRect(X + 3, Y + 8, 8, 18);
      x.fillStyle = '#e8f8ff'; for (let i = 0; i < 4; i++) x.fillRect(X + 4 + (i % 2) * 3, Y + 10 + i * 4, 3, 3);
      // 비늘 양동이
      x.fillStyle = '#3f8fd8'; x.fillRect(X + W - 13, Y + 21, 9, 8); x.fillStyle = '#c9e7ff'; x.fillRect(X + W - 12, Y + 21, 7, 2);
      break;
    }
    case 'pack': {
      box3d(x, X, Y + 2, W, H - 2, '#a58459', '#6f5636', 9);
      // 배선 제어판
      x.fillStyle = OUT; x.fillRect(X + 22, Y + 5, 24, 22); x.fillStyle = '#39424f'; x.fillRect(X + 23, Y + 6, 22, 20);
      const wc = ['#ff5b5b', '#4fb3ff', '#59d98a', '#ffd23f'];
      wc.forEach((c, i) => { x.fillStyle = c; x.fillRect(X + 25 + i * 5, Y + 9, 3, 3); x.fillRect(X + 26 + i * 5, Y + 12, 1, 8 + (i % 2) * 3); });
      x.fillStyle = '#222'; x.fillRect(X + 24, Y + 22, 20, 3);
      // 납작한 상자 더미
      x.fillStyle = OUT; x.fillRect(X + 3, Y + 6, 16, 18);
      for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#c99858' : '#b8874a'; x.fillRect(X + 4, Y + 7 + i * 4, 14, 4); }
      // 테이프
      x.fillStyle = '#ddd'; x.fillRect(X + W - 13, Y + 8, 9, 9); x.fillStyle = '#9a7b55'; x.fillRect(X + W - 10, Y + 11, 3, 3);
      break;
    }
    case 'pc': {
      box3d(x, X, Y + 6, W, H - 8, '#7a5a40', '#4f3a29', 8);
      for (const ox of [4, 25]) { x.fillStyle = OUT; x.fillRect(X + ox, Y, 19, 15); x.fillStyle = '#10161f'; x.fillRect(X + ox + 1, Y + 1, 17, 12); x.fillStyle = '#4b5562'; x.fillRect(X + ox + 7, Y + 15, 5, 3); }
      x.fillStyle = '#c8ccd4'; x.fillRect(X + 10, Y + 21, 22, 5); x.fillStyle = '#9aa0aa'; for (let i = 0; i < 5; i++) x.fillRect(X + 11 + i * 4, Y + 22, 3, 1);
      x.fillStyle = '#f5f5f5'; x.fillRect(X + 36, Y + 20, 6, 6); x.fillStyle = '#6b3f1f'; x.fillRect(X + 37, Y + 21, 4, 2); // 커피잔
      x.fillStyle = '#f0f0e0'; x.fillRect(X + 2, Y + 21, 7, 9); x.fillStyle = '#bbb'; x.fillRect(X + 3, Y + 23, 5, 1); x.fillRect(X + 3, Y + 25, 4, 1);
      // 의자
      x.fillStyle = OUT; x.fillRect(X + 16, Y + H - 2, 14, 8); x.fillStyle = '#334'; x.fillRect(X + 17, Y + H - 1, 12, 6);
      break;
    }
    case 'board': {
      x.fillStyle = OUT; x.fillRect(X, Y, W, H); x.fillStyle = '#7a5532'; x.fillRect(X + 1, Y + 1, W - 2, H - 2);
      x.fillStyle = '#c9965e'; x.fillRect(X + 3, Y + 3, W - 6, H - 8);
      x.fillStyle = '#5a3c22'; x.fillRect(X + 4, Y + H - 4, 4, 4); x.fillRect(X + W - 8, Y + H - 4, 4, 4);
      break;
    }
    case 'sofa': {
      box3d(x, X, Y, W, H, '#b0463e', '#7e2e29', 7);
      x.fillStyle = '#c95a51'; x.fillRect(X + 6, Y + 8, 24, 12); x.fillRect(X + 34, Y + 8, 24, 12);
      x.fillStyle = '#8c332d'; x.fillRect(X + 3, Y + 3, W - 6, 4); x.fillRect(X + 3, Y + 3, 3, H - 10); x.fillRect(X + W - 6, Y + 3, 3, H - 10);
      x.fillStyle = '#ffe066'; x.fillRect(X + 10, Y + 9, 7, 7); x.fillStyle = '#7fd1ff'; x.fillRect(X + 46, Y + 10, 6, 6);
      break;
    }
    case 'mop': {
      box3d(x, X, Y, W, H, '#6b7889', '#46505d', 6);
      x.fillStyle = '#3f8fd8'; x.fillRect(X + 4, Y + 14, 11, 9); x.fillStyle = '#8fd0ff'; x.fillRect(X + 5, Y + 14, 9, 2);
      x.fillStyle = '#c9a26b'; x.fillRect(X + 21, Y + 2, 2, 20); x.fillStyle = '#eee'; x.fillRect(X + 17, Y + 20, 10, 5);
      x.fillStyle = '#ffd23f'; x.fillRect(X + 4, Y + 3, 9, 8); x.fillStyle = '#222'; x.fillRect(X + 8, Y + 4, 1, 4); x.fillRect(X + 8, Y + 9, 1, 1);
      break;
    }
    case 'truck': {
      // 탑뷰 트럭: 왼쪽 짐칸(열린 위), 오른쪽 운전석
      const cw = 40;
      box3d(x, X, Y, W - cw + 2, H, '#e9edf2', '#b9c2cc', 8);
      x.fillStyle = '#3a8fd8'; x.fillRect(X + 1, Y + H - 14, W - cw, 4);
      x.fillStyle = '#2b2f38'; x.fillRect(X + 5, Y + 5, W - cw - 8, H - 22); // 짐칸 내부
      x.fillStyle = '#3a3f4a'; for (let i = 0; i < W - cw - 8; i += 10) x.fillRect(X + 5 + i, Y + 5, 1, H - 22);
      box3d(x, X + W - cw, Y + 6, cw, H - 12, '#3a8fd8', '#24609a', 8);
      x.fillStyle = '#bfe6ff'; x.fillRect(X + W - 16, Y + 10, 12, H - 32); x.fillStyle = '#e9f6ff'; x.fillRect(X + W - 15, Y + 11, 3, 8);
      x.fillStyle = '#ffe066'; x.fillRect(X + W - 3, Y + 9, 2, 5); x.fillRect(X + W - 3, Y + H - 20, 2, 5);
      x.fillStyle = OUT; for (const wx of [X + 12, X + 52, X + W - 26]) { x.fillRect(wx, Y - 3, 12, 4); x.fillRect(wx, Y + H - 2, 12, 4); }
      break;
    }
  }
}
function tape(x, x0, y0, x1, y1) {
  const n = Math.hypot(x1 - x0, y1 - y0) / 2;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    x.fillStyle = Math.floor(i / 3) % 2 ? '#1d1d1d' : '#ffd23f';
    x.fillRect(Math.round(x0 + (x1 - x0) * k) - 2, Math.round(y0 + (y1 - y0) * k) - 2, 4, 4);
  }
}

// ---------- 소품 ----------
function drawProp(x, p) {
  const X = p.x * T, Y = p.y * T, W = p.w * T, H = p.h * T;
  switch (p.k) {
    case 'pillar':
      x.fillStyle = OUT; x.fillRect(X + 2, Y - 10, 12, 26);
      x.fillStyle = '#8a95a6'; x.fillRect(X + 3, Y - 9, 10, 24);
      for (let i = 0; i < 24; i += 6) { x.fillStyle = '#e8c33a'; x.fillRect(X + 3, Y - 9 + i, 10, 3); }
      x.fillStyle = '#c9d3df'; x.fillRect(X + 3, Y - 9, 2, 24);
      break;
    case 'gauge':
      x.fillStyle = '#56606e'; x.fillRect(X + 7, Y + 8, 2, 8);
      x.fillStyle = OUT; x.fillRect(X + 2, Y, 12, 12); x.fillStyle = '#f5f5f5'; x.fillRect(X + 3, Y + 1, 10, 10);
      x.fillStyle = '#ff5b5b'; x.fillRect(X + 10, Y + 3, 2, 2);
      break;
    case 'valve':
      x.fillStyle = '#56606e'; x.fillRect(X, Y + 6, 16, 5);
      x.fillStyle = '#d6303a'; x.fillRect(X + 3, Y + 1, 10, 3); x.fillRect(X + 3, Y + 12, 10, 3); x.fillRect(X + 3, Y + 1, 3, 14); x.fillRect(X + 10, Y + 1, 3, 14);
      x.fillStyle = '#aaa'; x.fillRect(X + 7, Y + 7, 2, 2);
      break;
    case 'panel':
      box3d(x, X, Y, W, H, '#9aa4b2', '#6d7785', 5);
      x.fillStyle = '#ffd23f'; x.fillRect(X + 4, Y + 5, 8, 7); x.fillStyle = '#222'; x.fillRect(X + 7, Y + 6, 2, 3); x.fillRect(X + 7, Y + 10, 2, 1);
      x.fillStyle = '#4cd964'; x.fillRect(X + 4, Y + 17, 2, 2); x.fillStyle = '#ff5b5b'; x.fillRect(X + 8, Y + 17, 2, 2);
      break;
    case 'steam':
      x.fillStyle = '#22262e'; x.fillRect(X + 1, Y + 1, 14, 14); x.fillStyle = '#5a6270'; for (let i = 0; i < 4; i++) x.fillRect(X + 3, Y + 3 + i * 3, 10, 1);
      break;
    case 'puddle':
      x.fillStyle = 'rgba(140,200,240,0.28)'; x.fillRect(X + 3, Y + 5, W - 6, 7); x.fillRect(X + 7, Y + 3, W - 16, 11);
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(X + 9, Y + 6, 5, 1);
      break;
    case 'cable':
      ['#ff5b5b', '#ffd23f', '#4fb3ff'].forEach((c, i) => { x.fillStyle = OUT; x.fillRect(X, Y + 4 + i * 3, W, 3); x.fillStyle = c; x.fillRect(X, Y + 5 + i * 3, W, 1); });
      x.fillStyle = '#3a3f4a'; x.fillRect(X + W / 2 - 3, Y + 2, 6, 12);
      break;
    case 'ice':
      for (let i = 0; i < 2; i++) { const bx = X + i * 16; x.fillStyle = OUT; x.fillRect(bx, Y - 4, 16, 20); x.fillStyle = '#f2f6fa'; x.fillRect(bx + 1, Y - 3, 14, 18); x.fillStyle = '#3a8fd8'; x.fillRect(bx + 1, Y + 6, 14, 3); x.fillStyle = '#cfe8ff'; x.fillRect(bx + 3, Y - 2, 4, 3); x.fillRect(bx + 9, Y - 1, 3, 3); }
      break;
    case 'basket':
      x.fillStyle = OUT; x.fillRect(X, Y + 2, 16, 13); x.fillStyle = '#35b36a'; x.fillRect(X + 1, Y + 3, 14, 11);
      x.fillStyle = '#278a50'; for (let i = 0; i < 14; i += 3) x.fillRect(X + 1 + i, Y + 3, 1, 11);
      x.fillStyle = '#b8c8dc'; x.fillRect(X + 3, Y + 2, 6, 3); x.fillStyle = '#f2906e'; x.fillRect(X + 8, Y + 1, 6, 3);
      break;
    case 'boots':
      for (let i = 0; i < 4; i++) { x.fillStyle = OUT; x.fillRect(X + 1 + i * 8, Y + 1, 6, 14); x.fillStyle = '#ffd23f'; x.fillRect(X + 2 + i * 8, Y + 2, 4, 12); x.fillStyle = '#e0a800'; x.fillRect(X + 2 + i * 8, Y + 11, 5, 3); }
      break;
    case 'hose':
      x.fillStyle = OUT; x.fillRect(X, Y, 16, 16); x.fillStyle = '#c62f3a'; x.fillRect(X + 1, Y + 1, 14, 14);
      x.fillStyle = '#8c1f28'; x.fillRect(X + 4, Y + 4, 8, 8); x.fillStyle = '#ccc'; x.fillRect(X + 7, Y + 7, 2, 2);
      break;
    case 'net':
      x.fillStyle = 'rgba(60,140,90,0.75)';
      for (let i = 0; i < W; i += 4) x.fillRect(X + i, Y + 2, 1, H - 4);
      for (let j = 2; j < H - 2; j += 4) x.fillRect(X + 2, Y + j, W - 4, 1);
      x.fillStyle = '#ff8a3d'; x.fillRect(X + 6, Y + 6, 3, 3); x.fillRect(X + 20, Y + 18, 3, 3);
      break;
    case 'boxes':
      box3d(x, X, Y + 8, 18, 22, '#c99858', '#94693a', 6); box3d(x, X + 14, Y + 2, 18, 22, '#d6a868', '#a1743f', 6); box3d(x, X + 6, Y - 6, 18, 18, '#c99858', '#94693a', 5);
      x.fillStyle = '#e6c88c'; x.fillRect(X + 14, Y - 5, 2, 12); x.fillRect(X + 22, Y + 3, 2, 14);
      break;
    case 'tape':
      x.fillStyle = OUT; x.fillRect(X + 1, Y + 4, 14, 11); x.fillStyle = '#d9d9d9'; x.fillRect(X + 2, Y + 5, 12, 9); x.fillStyle = '#b8874a'; x.fillRect(X + 5, Y + 7, 6, 5);
      break;
    case 'pallet':
      x.fillStyle = '#8a6a3a'; x.fillRect(X, Y + H - 8, W, 8); x.fillStyle = '#6b4f28'; for (let i = 0; i < W; i += 8) x.fillRect(X + i, Y + H - 8, 2, 8);
      box3d(x, X + 3, Y + 2, W - 6, H - 10, '#c99858', '#94693a', 6);
      x.fillStyle = '#3a8fd8'; x.fillRect(X + 8, Y + 8, 8, 5);
      break;
    case 'vend':
      box3d(x, X, Y - 6, W, H + 6, '#d6303a', '#9c1f28', 6);
      x.fillStyle = '#10161f'; x.fillRect(X + 4, Y - 2, W - 14, H - 6);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { x.fillStyle = ['#ffd23f', '#4fb3ff', '#59d98a', '#ff8fa3'][(r + c) % 4]; x.fillRect(X + 6 + c * 6, Y + r * 6, 3, 4); }
      x.fillStyle = '#e0e0e0'; x.fillRect(X + W - 8, Y + 6, 4, 8);
      break;
    case 'plant':
      x.fillStyle = OUT; x.fillRect(X + 3, Y + 8, 10, 8); x.fillStyle = '#b5652f'; x.fillRect(X + 4, Y + 9, 8, 6);
      x.fillStyle = '#3aa25a'; x.fillRect(X + 2, Y - 4, 4, 12); x.fillRect(X + 7, Y - 8, 3, 16); x.fillRect(X + 11, Y - 3, 4, 11);
      x.fillStyle = '#5fd07a'; x.fillRect(X + 8, Y - 7, 1, 6);
      break;
    case 'tv':
      box3d(x, X, Y - 8, W, H + 8, '#3a3f4a', '#23272f', 5);
      x.fillStyle = '#0d1118'; x.fillRect(X + 4, Y - 5, W - 8, 13);
      break;
    case 'water':
      x.fillStyle = OUT; x.fillRect(X + 2, Y - 6, 12, H + 6); x.fillStyle = '#e9edf2'; x.fillRect(X + 3, Y + 8, 10, H - 9);
      x.fillStyle = 'rgba(120,200,255,0.85)'; x.fillRect(X + 4, Y - 5, 8, 12); x.fillStyle = '#c62f3a'; x.fillRect(X + 4, Y + 12, 2, 2); x.fillStyle = '#3a8fd8'; x.fillRect(X + 10, Y + 12, 2, 2);
      break;
    case 'locker':
      box3d(x, X, Y - 8, W, H + 8, '#7c8da3', '#56657a', 5);
      for (let i = 0; i < 3; i++) { x.fillStyle = '#56657a'; x.fillRect(X + 2 + i * 10, Y - 6, 1, H); x.fillStyle = '#c9d3df'; x.fillRect(X + 7 + i * 10, Y + 6, 2, 1); x.fillRect(X + 4 + i * 10, Y - 4, 4, 1); x.fillRect(X + 4 + i * 10, Y - 2, 4, 1); }
      break;
    case 'rug':
      x.fillStyle = 'rgba(140,70,95,0.55)'; x.fillRect(X, Y, W, H);
      x.fillStyle = 'rgba(230,180,90,0.45)'; x.fillRect(X + 3, Y + 3, W - 6, 2); x.fillRect(X + 3, Y + H - 5, W - 6, 2); x.fillRect(X + 3, Y + 3, 2, H - 6); x.fillRect(X + W - 5, Y + 3, 2, H - 6);
      break;
    case 'forklift':
      box3d(x, X + 6, Y, W - 6, H - 4, '#f2b632', '#b78415', 6);
      x.fillStyle = '#333'; x.fillRect(X + 12, Y + 4, 12, 10); x.fillStyle = '#7fd1ff'; x.fillRect(X + 13, Y + 5, 10, 4);
      x.fillStyle = '#9aa0aa'; x.fillRect(X, Y + 8, 7, 2); x.fillRect(X, Y + 18, 7, 2); x.fillRect(X + 5, Y + 2, 2, 22);
      x.fillStyle = OUT; x.fillRect(X + 8, Y + H - 5, 6, 5); x.fillRect(X + W - 8, Y + H - 5, 6, 5);
      break;
    case 'cone':
      x.fillStyle = OUT; x.fillRect(X + 3, Y + 12, 10, 4); x.fillStyle = '#ff7a1a'; x.fillRect(X + 4, Y + 12, 8, 3); x.fillRect(X + 5, Y + 6, 6, 6); x.fillRect(X + 6, Y + 1, 4, 5);
      x.fillStyle = '#fff'; x.fillRect(X + 5, Y + 7, 6, 2);
      break;
  }
}

// ---------- 동적 그리기 ----------
const BELT_ITEMS = [];
let beltT = 0;
// 벨트 위 물건(무작위 생선·상자) 갱신
export function updateBelt(dt, unlocked) {
  beltT -= dt;
  if (beltT <= 0) {
    beltT = 0.5 + Math.random() * 0.8;
    const zs = unlocked.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
    const z = zs[Math.floor(Math.random() * zs.length)] || 0;
    const a = [128, 109, 90, 71, 52][z] + (Math.random() - 0.5) * 6;
    BELT_ITEMS.push({ a, tier: Math.floor(Math.random() * 5) <= z ? z : Math.floor(Math.random() * (z + 1)), stage: Math.random() < 0.45 ? 0 : 2 });
  }
  for (let i = BELT_ITEMS.length - 1; i >= 0; i--) {
    const it = BELT_ITEMS[i];
    it.a += dt * 6;
    if (it.a >= 266 && it.a < 280) BELT_ITEMS.splice(i, 1);
  }
  if (BELT_ITEMS.length > 60) BELT_ITEMS.splice(0, BELT_ITEMS.length - 60);
}

export function drawWorldDynamic(ctx, st, t, view) {
  const inView = (X, Y, m = 40) => X > view.x - m && X < view.x + view.w + m && Y > view.y - m && Y < view.y + view.h + m;
  const cxp = CX * T, cyp = CY * T;
  // 벨트 줄무늬 (보이는 부분만 근사로 전체 원을 대시로)
  ctx.save();
  ctx.lineWidth = (R_BELT - R_WALK) * T - 6;
  ctx.strokeStyle = '#3a3d45';
  ctx.setLineDash([3, 9]);
  ctx.lineDashOffset = -t * 6 * Math.PI / 180 * ((R_BELT + R_WALK) / 2) * T;
  ctx.beginPath(); ctx.arc(cxp, cyp, ((R_BELT + R_WALK) / 2) * T, 0, Math.PI * 2, true); ctx.stroke();
  ctx.restore();
  for (const it of BELT_ITEMS) {
    const p = polar((R_BELT + R_WALK) / 2, it.a);
    const X = p.x * T, Y = p.y * T;
    if (!inView(X, Y)) continue;
    const sp = itemSprite(it.tier, it.stage);
    ctx.drawImage(sp, Math.round(X - sp.width / 2), Math.round(Y - sp.height / 2));
  }
  // 벽: 팬, 시계 바늘, 창밖 갈매기
  for (const d of WALL_DECO) {
    const p = polar(R_BELT + 1.1, d.a);
    const X = Math.round(p.x * T), Y = Math.round(p.y * T);
    if (!inView(X, Y)) continue;
    if (d.k === 'fan') {
      const k = Math.floor(t * 12) % 2;
      ctx.fillStyle = '#9aa7b6';
      if (k) { ctx.fillRect(X - 7, Y - 1, 14, 3); ctx.fillRect(X - 1, Y - 7, 3, 14); }
      else for (let i = -6; i <= 6; i++) { ctx.fillRect(X + i, Y + i, 2, 2); ctx.fillRect(X + i, Y - i, 2, 2); }
      ctx.fillStyle = '#333'; ctx.fillRect(X - 1, Y - 1, 3, 3);
    } else if (d.k === 'clock') {
      const m = (t / 60) * Math.PI * 2, h = m / 12;
      ctx.fillStyle = '#222';
      for (let i = 1; i <= 6; i++) ctx.fillRect(Math.round(X + Math.sin(m) * i), Math.round(Y - Math.cos(m) * i), 1, 1);
      for (let i = 1; i <= 4; i++) ctx.fillRect(Math.round(X + Math.sin(h) * i), Math.round(Y - Math.cos(h) * i), 1, 1);
    } else if (d.k === 'window') {
      const k = ((t * 0.18 + d.a * 0.37) % 6);
      if (k < 1) { const gx = X - 13 + k * 26, gy = Y - 5 + Math.sin(k * 20) * 1.5; ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(gx) - 2, Math.round(gy), 2, 1); ctx.fillRect(Math.round(gx), Math.round(gy) + 1, 1, 1); ctx.fillRect(Math.round(gx) + 1, Math.round(gy), 2, 1); }
    }
  }
  // 소품 애니메이션
  for (const p of PROPS) {
    const X = p.x * T, Y = p.y * T;
    if (!inView(X, Y)) continue;
    if (p.k === 'gauge') { const a = Math.sin(t * 3 + p.a) * 0.8 - 0.4; ctx.fillStyle = '#d6303a'; for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(X + 8 + Math.sin(a) * i), Math.round(Y + 6 - Math.cos(a) * i), 1, 1); }
    if (p.k === 'steam') for (let i = 0; i < 3; i++) { const k = (t * 0.7 + i / 3 + p.a) % 1; ctx.fillStyle = `rgba(230,236,245,${0.45 - k * 0.45})`; ctx.fillRect(Math.round(X + 5 + Math.sin(k * 6 + i) * 3), Math.round(Y + 4 - k * 22), 6 + k * 5, 5 + k * 4); }
    if (p.k === 'puddle' && Math.floor(t * 1.5 + p.a) % 4 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(X + 12, Y + 6, 3, 1); }
    if (p.k === 'tv') { for (let i = 0; i < 6; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#9aa4b2' : '#3a4250'; ctx.fillRect(X + 4 + Math.floor(Math.random() * 24), Y - 5 + Math.floor(Math.random() * 12), 3, 1); } }
    if (p.k === 'vend' && Math.floor(t * 2) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(X + p.w * T - 7, Y + 2, 2, 2); }
    if (p.k === 'panel' && Math.floor(t * 3 + p.a) % 3 === 0) { ctx.fillStyle = '#7dff8a'; ctx.fillRect(X + 4, Y + 17, 2, 2); }
  }
}

// 수조 물고기 · 기포 · 기계 (레벨 외형) · 작업대 반응 · 트럭
export function drawStationsDynamic(ctx, st, t, view) {
  const f = st.f;
  for (let z = 0; z < 5; z++) {
    const zz = f.z[z], tank = STATION_BY_ID['tank' + z], m = STATION_BY_ID['mach' + z];
    if (zz[0]) {
      const X = tank.x * T, Y = tank.y * T, W = tank.w * T;
      const sp = itemSprite(z, 0);
      for (let i = 0; i < 4; i++) {
        const ph = t * (0.5 + i * 0.17) + i * 2 + z;
        const fx = X + 8 + (Math.sin(ph) * 0.5 + 0.5) * (W - 16 - sp.width);
        const fy = Y + 12 + i * 8 + Math.sin(ph * 2) * 1.5;
        ctx.save(); ctx.translate(Math.round(fx), Math.round(fy));
        if (Math.cos(ph) < 0) { ctx.scale(-1, 1); ctx.drawImage(sp, -sp.width, 0); } else ctx.drawImage(sp, 0, 0);
        ctx.restore();
      }
      for (let i = 0; i < 4; i++) { const k = (t * 0.6 + i * 0.27 + z * 0.1) % 1; ctx.fillStyle = 'rgba(220,245,255,0.75)'; ctx.fillRect(Math.round(X + 14 + i * 20 + Math.sin(k * 9) * 2), Math.round(Y + 46 - k * 38), 2, 2); }
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(X + 6 + ((t * 14 + z * 9) % (W - 16)), Y + 8, 6, 1);
      if (zz[3]) { ctx.fillStyle = 'rgba(255,90,90,0.25)'; ctx.fillRect(X, Y, W, tank.h * T); }
    }
    drawMachine(ctx, m, zz, t);
  }
  // 작업대 사용 반응 (누군가 작업 중이면)
  const busy = st.busy || {};
  for (const s of STATIONS) {
    const X = s.x * T, Y = s.y * T;
    if (s.kind === 'cut' && busy[s.id]) { const k = Math.abs(Math.sin(t * 14)); ctx.fillStyle = '#dfe6ee'; ctx.fillRect(X + 22, Y + 8 + k * 6, 14, 3); ctx.fillStyle = '#3a2a22'; ctx.fillRect(X + 36, Y + 8 + k * 6, 6, 3); }
    if (s.kind === 'pack') { ctx.fillStyle = busy[s.id] ? (Math.floor(t * 6) % 2 ? '#7dff8a' : '#2f8f4a') : '#4a2020'; ctx.fillRect(X + 40, Y + 22, 4, 3); }
    if (s.kind === 'pc') {
      const hk = st.me.hk > 0;
      for (const ox of [5, 26]) {
        ctx.fillStyle = hk ? (Math.floor(t * 8) % 2 ? '#ff3b30' : '#220808') : '#0f2a1c'; ctx.fillRect(X + ox, Y + 1, 17, 12);
        if (!hk) {
          ctx.fillStyle = '#4cd964';
          if (ox === 5) for (let i = 0; i < 4; i++) ctx.fillRect(X + ox + 2, Y + 3 + i * 3, 4 + ((Math.floor(t * 3) + i * 3) % 9), 1);
          else for (let i = 0; i < 15; i++) ctx.fillRect(X + ox + 1 + i, Y + 10 - Math.round((Math.sin(i * 0.7 + t * 2) * 0.5 + 0.5) * 7), 1, 1);
        }
      }
    }
    if (s.kind === 'board') {
      const n = Math.min(4, f.o.length);
      for (let i = 0; i < n; i++) { const o = f.o[i]; ctx.fillStyle = FISH[o[1]].color; ctx.fillRect(X + 6 + i * 14, Y + 5, 11, 13); ctx.fillStyle = '#fff'; ctx.fillRect(X + 7 + i * 14, Y + 8, 9, 1); ctx.fillRect(X + 7 + i * 14, Y + 11, 6, 1); ctx.fillStyle = '#d33'; ctx.fillRect(X + 10 + i * 14, Y + 4, 3, 2); }
    }
    if (s.kind === 'truck') {
      // 짐칸 상자 쌓임
      const n = Math.min(24, st.shipped || 0);
      for (let i = 0; i < n; i++) {
        const c = i % 8, r = Math.floor(i / 8);
        const sp = itemSprite(i % 5 === 4 ? 4 : i % 3, 2);
        ctx.drawImage(sp, X + 6 + c * 10 - (r % 2) * 2, Y + 6 + (2 - r) * 12 - r * 2);
      }
      // 뒷문 (출하 순간 열림)
      const open = (st.shipFlash || 0) > 0;
      ctx.fillStyle = OUT; ctx.fillRect(X - (open ? 10 : 2), Y + 2, open ? 10 : 4, s.h * T - 6);
      ctx.fillStyle = '#c9d1da'; ctx.fillRect(X - (open ? 9 : 1), Y + 3, open ? 8 : 2, s.h * T - 8);
      // 배기가스
      for (let i = 0; i < 3; i++) { const k = (t * 0.9 + i / 3) % 1; ctx.fillStyle = `rgba(180,180,190,${0.4 - k * 0.4})`; ctx.fillRect(Math.round(X + s.w * T + 2 + k * 12), Math.round(Y + s.h * T - 8 - k * 10), 4 + k * 5, 4 + k * 4); }
    }
  }
}

function drawMachine(ctx, m, zz, t) {
  const X = m.x * T, Y = m.y * T, W = m.w * T, H = m.h * T;
  const lv = zz[1], on = zz[0], broken = zz[2];
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(X + 3, Y + 4, W, H);
  const body = !on ? '#4a5260' : lv >= MAX_LV ? '#d9b44a' : lv >= 7 ? '#8fa1b8' : '#6f7d8e';
  const front = !on ? '#333944' : lv >= MAX_LV ? '#9c7a22' : '#4b5562';
  box3d(ctx, X, Y, W, H, body, front, 7);
  // 톱니바퀴
  const gx = X + 10, gy = Y + 11, a = on && !broken ? t * 4 : 0;
  ctx.fillStyle = '#2b3240'; ctx.fillRect(gx - 6, gy - 6, 12, 12);
  ctx.fillStyle = '#c9d3df';
  for (let i = 0; i < 4; i++) { const q = a + i * Math.PI / 2; ctx.fillRect(Math.round(gx + Math.cos(q) * 4) - 1, Math.round(gy + Math.sin(q) * 4) - 1, 3, 3); }
  ctx.fillRect(gx - 1, gy - 1, 3, 3);
  // 계기 램프
  ctx.fillStyle = !on ? '#222' : broken ? (Math.floor(t * 4) % 2 ? '#ff3b30' : '#661111') : zz[3] ? '#ffcc00' : (Math.floor(t * 2) % 2 ? '#4cd964' : '#1f7a33');
  ctx.fillRect(X + W - 14, Y + 6, 8, 5);
  // 레벨 눈금
  for (let l = 0; l < lv && on; l++) { ctx.fillStyle = l < 5 ? '#ffd23f' : '#ff8f3f'; ctx.fillRect(X + 22 + (l % 5) * 4, Y + 15 + Math.floor(l / 5) * 3, 3, 2); }
  // 레벨 외형: 4+ 굴뚝, 7+ 경광등, 10 금빛 반짝
  if (on && lv >= 4) {
    ctx.fillStyle = OUT; ctx.fillRect(X + W - 10, Y - 14, 8, 15); ctx.fillStyle = '#5d6b7c'; ctx.fillRect(X + W - 9, Y - 13, 6, 14);
    if (!broken) for (let i = 0; i < 2; i++) { const k = (t * 0.8 + i / 2) % 1; ctx.fillStyle = `rgba(230,236,245,${0.5 - k * 0.5})`; const sx = X + W - 8 + k * 6, sy = Y - 18 - k * 16; ctx.fillRect(Math.round(sx), Math.round(sy), 6, 3); ctx.fillRect(Math.round(sx) - 2, Math.round(sy) - 1, 2, 5); }
  }
  if (on && lv >= 7) { ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ff8f3f' : '#ffd23f'; ctx.fillRect(X + 3, Y - 4, 6, 4); }
  if (on && lv >= MAX_LV && Math.floor(t * 5) % 3 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(X + 4 + Math.floor(Math.random() * (W - 8)), Y + 2 + Math.floor(Math.random() * 10), 2, 2); }
  if (broken) for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; ctx.fillStyle = `rgba(70,70,70,${0.75 - k * 0.75})`; ctx.fillRect(Math.round(X + 12 + Math.sin(k * 6 + i) * 5), Math.round(Y - k * 22), 7 + k * 5, 7 + k * 5); }
}

// 게이트 위 매달린 간판 (플레이어 위에 그림)
export function drawOverhead(ctx, t, view) {
  for (const g of GATES) {
    const p = polar((R_HUB + R_WALK) / 2, g);
    const X = Math.round(p.x * T), Y = Math.round(p.y * T) - 22;
    if (X < view.x - 60 || X > view.x + view.w + 60 || Y < view.y - 60 || Y > view.y + view.h + 60) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X - 26, Y + 26, 52, 6);
    ctx.fillStyle = '#56606e'; ctx.fillRect(X - 20, Y - 10, 1, 10); ctx.fillRect(X + 19, Y - 10, 1, 10);
    ctx.fillStyle = OUT; ctx.fillRect(X - 26, Y - 1, 52, 16);
    ctx.fillStyle = '#20603a'; ctx.fillRect(X - 25, Y, 50, 14);
    ctx.fillStyle = '#e8f5ec'; ctx.fillRect(X - 25, Y, 50, 1);
  }
}
export function gateSignText(g) {
  // 반시계 방향 동선 기준 다음 구역 안내
  return { 45: '④ → ① 수조', 135: '① → ② 손질', 225: '② → ③ 포장', 315: '③ → ④ 사무' }[g];
}
