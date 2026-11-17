/* global __DEV__ */
// ===== 업무 미니게임 =====
import { FISH } from './data.js';
import { audio } from './audio.js';
import { rand, randi, clamp } from './util.js';
import { itemSprite } from './sprites.js';

const LW = 320, LH = 200;
let active = null;
export const mgActive = () => !!active;

const TITLES = {
  catch: '🎣 수조 건지기', cut: '🔪 손질', pack: '📦 포장', repair: '🔧 기계 수리', reboot: '💻 재부팅', mop: '🧽 바닥 닦기',
};
const HINTS = {
  catch: '초록 칸에서 탭! (스페이스 / E / 클릭)',
  cut: '점선을 따라 한 번에 쭉 그어요',
  pack: '같은 색 단자끼리 전선을 이어요 · 단자를 탭하면 그 색이 지워져요',
  repair: '빠르게 연타! (스페이스 / E / 탭)',
  reboot: '버튼을 꾹 누르고 있어요 (스페이스 / E / 길게 누르기)',
  mop: '좌우로 문질러요! (A·D / ←→ / 좌우 스와이프)',
};

export function runMinigame(kind, tier = 0) {
  if (active) return Promise.resolve('cancel');
  return new Promise((resolve) => {
    const root = document.getElementById('mg');
    const cv = root.querySelector('canvas');
    root.querySelector('.mg-title').textContent = TITLES[kind] + (kind === 'catch' || kind === 'cut' || kind === 'pack' ? ` · ${FISH[tier].name}` : '');
    root.querySelector('.mg-hint').textContent = HINTS[kind];
    const bar = root.querySelector('.mg-time i');
    root.classList.add('show');
    root.classList.toggle('mg-big', kind === 'pack');
    document.body.classList.add('modal-open');
    const g = makeGame(kind, tier);
    if (__DEV__) window.__mg = g;
    const GW = g.lw || LW, GH = g.lh || LH;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const reserve = window.innerHeight < 520 ? (kind === 'pack' ? 62 : 104) : 130;
      const w = Math.min(window.innerWidth * 0.94, kind === 'pack' ? 720 : 640, (window.innerHeight - reserve) * (GW / GH));
      cv.style.width = w + 'px'; cv.style.height = w * GH / GW + 'px';
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * GH / GW * dpr);
    };
    fit();
    const ctx = cv.getContext('2d');
    let raf = 0, last = performance.now(), done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      audio.sfx(r === 'ok' ? 'ok' : r === 'fail' ? 'fail' : 'click');
      g.result = r;
      setTimeout(() => {
        cancelAnimationFrame(raf);
        root.classList.remove('show');
        if (!document.querySelector('#pc.show') && !document.querySelector('#mapov.show')) document.body.classList.remove('modal-open');
        cleanup();
        active = null;
        resolve(r);
      }, r === 'cancel' ? 0 : 380);
    };
    g.finish = finish;
    const toLocal = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * GW, y: (e.clientY - r.top) / r.height * GH };
    };
    const pd = (e) => { e.preventDefault(); cv.setPointerCapture && cv.setPointerCapture(e.pointerId); if (!done) g.down && g.down(toLocal(e)); };
    const pm = (e) => { e.preventDefault(); if (!done) g.move && g.move(toLocal(e)); };
    const pu = (e) => { e.preventDefault(); if (!done) g.up && g.up(toLocal(e)); };
    const kd = (e) => {
      if (e.repeat && kind !== 'reboot') return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { finish('cancel'); return; }
      if (done) return;
      if (k === ' ' || k === 'e' || k === 'enter') { e.preventDefault(); g.key && g.key('act', true); }
      if (k === 'a' || k === 'arrowleft') g.key && g.key('left', true);
      if (k === 'd' || k === 'arrowright') g.key && g.key('right', true);
      e.stopPropagation();
    };
    const ku = (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'e' || k === 'enter') g.key && g.key('act', false);
    };
    const closeBtn = root.querySelector('.mg-close');
    const onClose = () => finish('cancel');
    cv.addEventListener('pointerdown', pd);
    cv.addEventListener('pointermove', pm);
    cv.addEventListener('pointerup', pu);
    cv.addEventListener('pointercancel', pu);
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    window.addEventListener('resize', fit);
    closeBtn.addEventListener('click', onClose);
    const actBtn = root.querySelector('.mg-act');
    const showAct = kind === 'catch' || kind === 'repair' || kind === 'reboot';
    actBtn.style.display = showAct ? '' : 'none';
    actBtn.textContent = kind === 'reboot' ? '꾹 누르기' : kind === 'repair' ? '연타!' : '건지기!';
    const ad = (e) => { e.preventDefault(); g.key && g.key('act', true); };
    const au = (e) => { e.preventDefault(); g.key && g.key('act', false); };
    actBtn.addEventListener('pointerdown', ad);
    actBtn.addEventListener('pointerup', au);
    actBtn.addEventListener('pointerleave', au);
    function cleanup() {
      cv.removeEventListener('pointerdown', pd); cv.removeEventListener('pointermove', pm);
      cv.removeEventListener('pointerup', pu); cv.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true);
      window.removeEventListener('resize', fit); closeBtn.removeEventListener('click', onClose);
      actBtn.removeEventListener('pointerdown', ad); actBtn.removeEventListener('pointerup', au); actBtn.removeEventListener('pointerleave', au);
    }
    active = { cancel: () => finish('cancel') };
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!done) {
        g.t += dt;
        if (g.t >= g.limit) finish(g.timeoutOk ? 'ok' : 'fail');
        else g.update && g.update(dt);
      }
      bar.style.transform = `scaleX(${clamp(1 - g.t / g.limit, 0, 1)})`;
      ctx.setTransform(cv.width / GW, 0, 0, cv.height / GH, 0, 0);
      ctx.imageSmoothingEnabled = false;
      g.draw(ctx);
      if (g.result) {
        ctx.fillStyle = g.result === 'ok' ? 'rgba(60,200,110,0.35)' : 'rgba(230,60,60,0.35)';
        ctx.fillRect(0, 0, GW, GH);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Galmuri11, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(g.result === 'ok' ? '성공!' : g.result === 'fail' ? '실패…' : '', GW / 2, GH / 2 + 10);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}
export function cancelMinigame() { if (active) active.cancel(); }

function makeGame(kind, tier) {
  switch (kind) {
    case 'catch': return gCatch(tier);
    case 'cut': return gCut(tier);
    case 'pack': return gWire(tier);
    case 'repair': return gMash();
    case 'reboot': return gHold();
    case 'mop': return gMop();
  }
}

function bgPanel(ctx, top = '#17324a', bot = '#0f2133') {
  const gr = ctx.createLinearGradient(0, 0, 0, LH);
  gr.addColorStop(0, top); gr.addColorStop(1, bot);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, LW, LH);
}
function text(ctx, s, x, y, size = 12, col = '#fff', align = 'center') {
  ctx.font = `${size}px Galmuri11, sans-serif`; ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(s, x, y);
}

// ---- 수조 건지기 ----
function gCatch(tier) {
  const W = [0.3, 0.24, 0.18, 0.14, 0.1][tier], SP = [0.85, 1.05, 1.3, 1.55, 1.85][tier], NEED = [1, 1, 2, 2, 3][tier];
  const fish = Array.from({ length: 6 }, () => ({ x: rand(30, 290), y: rand(40, 120), v: rand(20, 50) * (Math.random() < 0.5 ? -1 : 1) }));
  const g = {
    t: 0, limit: 9, pos: 0, dir: 1, zc: rand(0.25, 0.75), hits: 0, flash: 0,
    update(dt) {
      g.pos += g.dir * SP * dt;
      if (g.pos > 1) { g.pos = 1; g.dir = -1; } if (g.pos < 0) { g.pos = 0; g.dir = 1; }
      for (const f of fish) { f.x += f.v * dt; if (f.x < 20 || f.x > 300) f.v *= -1; }
      g.flash = Math.max(0, g.flash - dt);
    },
    key(k, on) { if (k === 'act' && on) g.press(); },
    down() { g.press(); },
    press() {
      if (Math.abs(g.pos - g.zc) <= W / 2) {
        g.hits++; g.flash = 0.3; audio.sfx('splash');
        if (g.hits >= NEED) g.finish('ok');
        else { g.zc = rand(0.2, 0.8); }
      } else g.finish('fail');
    },
    draw(ctx) {
      bgPanel(ctx, '#1f6fa8', '#0e3a5c');
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 6; i++) ctx.fillRect(((g.t * 30 + i * 60) % 340) - 20, 20 + i * 4, 30, 2);
      const sp = itemSprite(tier, 0);
      for (const f of fish) {
        ctx.save(); ctx.translate(f.x, f.y); if (f.v < 0) ctx.scale(-1, 1);
        ctx.drawImage(sp, -sp.width, -sp.height, sp.width * 2, sp.height * 2); ctx.restore();
      }
      ctx.fillStyle = '#d9c38a'; ctx.fillRect(0, 140, LW, 8);
      const bx = 20, bw = 280, by = 158, bh = 22;
      ctx.fillStyle = '#0b1622'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#34465a'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = g.flash > 0 ? '#b6ffb0' : '#3ccf5a'; ctx.fillRect(bx + (g.zc - W / 2) * bw, by, W * bw, bh);
      const cx = bx + g.pos * bw;
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 2, by - 6, 4, bh + 12);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx - 6, by - 10, 12, 5);
      text(ctx, `${g.hits} / ${NEED}`, LW - 12, 18, 12, '#fff', 'right');
    },
  };
  return g;
}

// ---- 손질 ----
function gCut(tier) {
  const segs = [1, 2, 2, 3, 4][tier];
  const mk = () => {
    const pts = [{ x: 50, y: rand(80, 120) }];
    for (let i = 1; i <= segs; i++) pts.push({ x: 50 + (220 * i) / segs, y: segs === 1 ? rand(80, 120) : rand(60, 140) });
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 5);
      for (let k = 0; k < n; k++) samples.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, c: false });
    }
    samples.push({ ...pts[pts.length - 1], c: false });
    return { pts, samples };
  };
  let P = mk();
  const F = FISH[tier];
  const g = {
    t: 0, limit: 8, drawing: false, trail: [], off: 0, moves: 0, tries: 0, msg: '',
    down(p) { g.drawing = true; g.trail = [p]; g.mark(p); },
    move(p) { if (!g.drawing) return; g.trail.push(p); if (g.trail.length > 40) g.trail.shift(); g.mark(p); },
    mark(p) {
      g.moves++;
      let near = 1e9;
      for (const s of P.samples) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < 16) s.c = true; if (d < near) near = d; }
      if (near > 28) g.off++;
      if (g.moves % 3 === 0) audio.sfx('chop');
    },
    up() {
      if (!g.drawing) return;
      g.drawing = false;
      const cov = P.samples.filter((s) => s.c).length / P.samples.length;
      const offR = g.off / Math.max(1, g.moves);
      if (cov >= 0.7 && offR < 0.45) return g.finish('ok');
      g.tries++;
      if (g.tries >= 2) return g.finish('fail');
      g.msg = '다시 한 번! 선을 따라가요'; P = mk(); g.off = 0; g.moves = 0; g.trail = [];
      audio.sfx('fail');
    },
    draw(ctx) {
      bgPanel(ctx, '#5a3a28', '#3a2418');
      ctx.fillStyle = '#e0bb84'; ctx.fillRect(20, 30, 280, 150);
      ctx.fillStyle = '#c99a5c'; ctx.fillRect(20, 172, 280, 8);
      // 생선
      ctx.fillStyle = F.dark;
      ctx.beginPath(); ctx.ellipse(160, 100, 125, 48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = F.color;
      ctx.beginPath(); ctx.ellipse(160, 106, 118, 40, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(40, 100); ctx.lineTo(18, 70); ctx.lineTo(18, 130); ctx.closePath(); ctx.fillStyle = F.dark; ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(255, 90, 6, 6);
      // 점선
      for (const s of P.samples) { ctx.fillStyle = s.c ? '#ffffff' : 'rgba(30,30,30,0.75)'; ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); }
      ctx.fillStyle = '#ff5252'; ctx.fillRect(P.pts[0].x - 4, P.pts[0].y - 4, 8, 8);
      // 칼 궤적
      if (g.trail.length > 1) {
        ctx.strokeStyle = 'rgba(220,240,255,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(g.trail[0].x, g.trail[0].y); for (const q of g.trail) ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      if (g.msg) text(ctx, g.msg, LW / 2, 22, 12, '#ffe066');
      else text(ctx, '빨간 점에서 시작!', LW / 2, 22, 12, '#fff');
    },
  };
  return g;
}

// ---- 포장: 포장 기계 배선 퍼즐 (같은 색 단자 잇기) ----
const WCOL = [
  { c: '#ff4d4d', d: '#a82424' }, { c: '#3fa9ff', d: '#1d5f9e' }, { c: '#4fdc6a', d: '#24823a' },
  { c: '#ffd23f', d: '#a8821a' }, { c: '#c26bff', d: '#6f2fa8' },
];
// 격자를 빈틈없이 덮는 무작위 해밀턴 경로 (backbite 알고리즘)
function hamPath(N) {
  let path = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) path.push([y % 2 ? N - 1 - x : x, y]);
  const idx = (c) => path.findIndex((q) => q[0] === c[0] && q[1] === c[1]);
  for (let it = 0; it < N * N * 30; it++) {
    if (Math.random() < 0.5) path.reverse();
    const e = path[path.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [e[0] + dx, e[1] + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N);
    const n = nb[Math.floor(Math.random() * nb.length)];
    const i = idx(n);
    if (i === path.length - 2) continue;
    path = path.slice(0, i + 1).concat(path.slice(i + 1).reverse());
  }
  return path;
}
function makeWirePuzzle(N, K) {
  for (let tries = 0; tries < 60; tries++) {
    const path = hamPath(N);
    const total = N * N;
    // K개 구간으로 자르기 (각 3칸 이상)
    const cuts = [];
    let ok = true;
    let start = 0;
    for (let k = 0; k < K - 1; k++) {
      const remain = total - start, left = K - k;
      const avg = remain / left;
      const len = Math.max(3, Math.min(remain - 3 * (left - 1), Math.round(avg + (Math.random() - 0.5) * avg * 0.6)));
      cuts.push([start, start + len - 1]);
      start += len;
    }
    cuts.push([start, total - 1]);
    if (total - start < 3) ok = false;
    const pairs = cuts.map(([a, b]) => [path[a], path[b]]);
    pairs.sol = cuts.map(([a, b]) => path.slice(a, b + 1));
    // 양 끝이 바로 붙어 있는 너무 쉬운 선은 다시 만들기
    if (pairs.some(([a, b]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 1)) ok = false;
    if (ok) return pairs;
  }
  return null;
}
function gWire(tier) {
  const N = [4, 4, 5, 5, 6][tier], K = [3, 3, 4, 4, 5][tier];
  const pairs = makeWirePuzzle(N, K) || makeWirePuzzle(N, K);
  const GX = 12, GY = 12, GS = 200, CS = GS / N;
  const dots = new Map(); // 칸 번호 → 색
  pairs.forEach(([a, b], c) => { dots.set(a[1] * N + a[0], c); dots.set(b[1] * N + b[0], c); });
  const paths = pairs.map(() => []);
  const owner = new Int8Array(N * N).fill(-1);
  const done = new Array(K).fill(false);
  let drag = null, downCell = -1, moved = false, winT = -1, lastSnd = 0;
  const cx = (i) => GX + (i % N) * CS + CS / 2, cy = (i) => GY + Math.floor(i / N) * CS + CS / 2;
  const setPath = (c, arr) => {
    for (const i of paths[c]) if (owner[i] === c) owner[i] = -1;
    paths[c] = arr;
    for (const i of arr) owner[i] = c;
    const p = arr; done[c] = p.length > 1 && dots.get(p[p.length - 1]) === c && p[p.length - 1] !== p[0];
  };
  // 포인터 근처 칸 (보정: 칸 크기 70% 이내면 잡힘)
  const cellNear = (pt, tol = 0.7) => {
    const gx = (pt.x - GX) / CS, gy = (pt.y - GY) / CS;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    let best = -1, bd = 1e9;
    for (let y = iy - 1; y <= iy + 1; y++) for (let x = ix - 1; x <= ix + 1; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const d = Math.hypot(gx - (x + 0.5), gy - (y + 0.5));
      if (d < bd) { bd = d; best = y * N + x; }
    }
    return bd <= tol + 0.5 ? best : -1;
  };
  const step = (c, next) => {
    const p = paths[c];
    const last = p[p.length - 1];
    const lx = last % N, ly = Math.floor(last / N), nx = next % N, ny = Math.floor(next / N);
    if (Math.abs(lx - nx) + Math.abs(ly - ny) !== 1) return false;
    if (p.length >= 2 && next === p[p.length - 2]) { setPath(c, p.slice(0, -1)); return true; } // 되돌아가기
    const own = p.indexOf(next);
    if (own >= 0) { setPath(c, p.slice(0, own + 1)); return true; }
    if (done[c]) return false;
    const dc = dots.get(next);
    if (dc !== undefined && dc !== c) return false;
    if (dc === c && next === p[0]) return false;
    const o = owner[next];
    if (o >= 0 && o !== c) { // 다른 선을 지나가면 그 선이 끊김
      const q = paths[o]; const k = q.indexOf(next);
      setPath(o, q.slice(0, Math.max(1, k)));
      audio.sfx('fail');
    }
    setPath(c, p.concat([next]));
    if (done[c]) audio.sfx('ok');
    else if (g.t - lastSnd > 0.05) { lastSnd = g.t; audio.sfx('click'); }
    return true;
  };
  const g = {
    t: 0, limit: [20, 20, 25, 25, 30][tier], lw: 300, lh: 224, sol: pairs.sol, geo: { GX, GY, CS, N },
    down(pt) {
      if (winT >= 0) return;
      const cell = cellNear(pt);
      if (cell < 0) return;
      downCell = cell; moved = false;
      const dc = dots.get(cell);
      if (dc !== undefined) { setPath(dc, [cell]); drag = { c: dc }; audio.sfx('click'); return; }
      const o = owner[cell];
      if (o >= 0) { const k = paths[o].indexOf(cell); setPath(o, paths[o].slice(0, k + 1)); drag = { c: o }; }
    },
    move(pt) {
      if (!drag) return;
      const c = drag.c;
      // 칸 경계 흔들림 방지 + 빠른 드래그 보간
      for (let guard = 0; guard < N * 2; guard++) {
        const p = paths[c]; const cur = p[p.length - 1];
        const fx = (pt.x - GX) / CS - ((cur % N) + 0.5), fy = (pt.y - GY) / CS - (Math.floor(cur / N) + 0.5);
        if (Math.abs(fx) < 0.62 && Math.abs(fy) < 0.62) break;
        let nx = cur % N, ny = Math.floor(cur / N);
        if (Math.abs(fx) >= Math.abs(fy)) nx += Math.sign(fx); else ny += Math.sign(fy);
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) break;
        moved = true;
        if (!step(c, ny * N + nx)) break;
      }
    },
    up() {
      if (!drag) return;
      drag = null;
      if (done.every(Boolean)) { winT = 0; audio.sfx('upgrade'); }
    },
    update(dt) {
      if (winT >= 0) { winT += dt; if (winT > 1.1) g.finish('ok'); }
    },
    draw(ctx) {
      // 제어판 배경 (픽셀 금속판)
      ctx.fillStyle = '#2a313d'; ctx.fillRect(0, 0, g.lw, g.lh);
      ctx.fillStyle = '#323a48'; for (let y = 0; y < g.lh; y += 8) ctx.fillRect(0, y, g.lw, 1);
      ctx.fillStyle = '#596476'; [[4, 4], [g.lw - 7, 4], [4, g.lh - 7], [g.lw - 7, g.lh - 7]].forEach(([a, b]) => ctx.fillRect(a, b, 3, 3));
      // 격자 슬롯
      ctx.fillStyle = '#10141c'; ctx.fillRect(GX - 4, GY - 4, GS + 8, GS + 8);
      for (let i = 0; i < N * N; i++) {
        const x = GX + (i % N) * CS, y = GY + Math.floor(i / N) * CS;
        ctx.fillStyle = '#1b2230'; ctx.fillRect(x + 1, y + 1, CS - 2, CS - 2);
        ctx.fillStyle = '#232c3c'; ctx.fillRect(x + 1, y + 1, CS - 2, 1);
        if (owner[i] >= 0) { ctx.fillStyle = WCOL[owner[i]].c; ctx.globalAlpha = done[owner[i]] ? 0.22 : 0.12; ctx.fillRect(x + 1, y + 1, CS - 2, CS - 2); ctx.globalAlpha = 1; }
      }
      // 전선
      const ww = Math.max(4, Math.round(CS * 0.32));
      paths.forEach((p, c) => {
        for (let k = 0; k < p.length; k++) {
          const a = p[k], b = p[k + 1] !== undefined ? p[k + 1] : a;
          const x0 = Math.min(cx(a), cx(b)) - ww / 2, y0 = Math.min(cy(a), cy(b)) - ww / 2;
          const w = Math.abs(cx(a) - cx(b)) + ww, h = Math.abs(cy(a) - cy(b)) + ww;
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(Math.round(x0) + 2, Math.round(y0) + 2, Math.round(w), Math.round(h));
          ctx.fillStyle = WCOL[c].d; ctx.fillRect(Math.round(x0), Math.round(y0), Math.round(w), Math.round(h));
          ctx.fillStyle = WCOL[c].c; ctx.fillRect(Math.round(x0) + 1, Math.round(y0) + 1, Math.round(w) - 2, Math.round(h) - 2);
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(Math.round(x0) + 1, Math.round(y0) + 1, Math.round(w) - 2, 1);
        }
      });
      // 단자 (숫자 = 색맹 보조)
      const ds = Math.round(CS * 0.6);
      for (const [i, c] of dots) {
        const x = Math.round(cx(i) - ds / 2), y = Math.round(cy(i) - ds / 2);
        const glow = done[c] && Math.floor(g.t * 4) % 2;
        ctx.fillStyle = '#0b0e14'; ctx.fillRect(x - 2, y - 2, ds + 4, ds + 4);
        ctx.fillStyle = '#9aa7b6'; ctx.fillRect(x - 1, y - 1, ds + 2, ds + 2);
        ctx.fillStyle = WCOL[c].d; ctx.fillRect(x, y, ds, ds);
        ctx.fillStyle = glow ? '#ffffff' : WCOL[c].c; ctx.fillRect(x + 2, y + 2, ds - 4, ds - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 2, y + 2, ds - 4, 2);
        ctx.font = `bold ${Math.round(ds * 0.62)}px Galmuri11, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111'; ctx.fillText(String(c + 1), cx(i) + 1, cy(i) + 2);
        ctx.fillStyle = '#fff'; ctx.fillText(String(c + 1), cx(i), cy(i) + 1);
      }
      ctx.textBaseline = 'alphabetic';
      // 오른쪽: 포장 기계 상태
      const PX = GX + GS + 14, PW = g.lw - PX - 8;
      ctx.fillStyle = '#1b2230'; ctx.fillRect(PX, GY - 4, PW, GS + 8);
      text(ctx, '포장 기계', PX + PW / 2, GY + 12, 11, '#ffe066');
      for (let c = 0; c < K; c++) {
        const ly = GY + 26 + c * 18, on = done[c];
        ctx.fillStyle = '#0b0e14'; ctx.fillRect(PX + 10, ly, 14, 12);
        ctx.fillStyle = on ? WCOL[c].c : '#3a2020'; ctx.fillRect(PX + 11, ly + 1, 12, 10);
        if (on) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(PX + 12, ly + 2, 4, 2); }
        text(ctx, String(c + 1), PX + 36, ly + 10, 10, on ? '#fff' : '#667', 'left');
      }
      // 상자 (성공하면 접히고 테이프)
      const bx = PX + PW / 2 - 18, by = GY + GS - 46;
      const k = winT >= 0 ? Math.min(1, winT / 0.7) : 0;
      ctx.fillStyle = '#5a3c1e'; ctx.fillRect(bx - 1, by - 1, 38, 32);
      ctx.fillStyle = '#c99858'; ctx.fillRect(bx, by, 36, 30);
      ctx.fillStyle = '#a77a40'; ctx.fillRect(bx, by, 36, 6);
      if (k > 0) {
        ctx.fillStyle = '#d6a868'; ctx.fillRect(bx, by - 10 + k * 10, 18, 8 * (1 - k) + 6); ctx.fillRect(bx + 18, by - 10 + k * 10, 18, 8 * (1 - k) + 6);
        if (k >= 1) { ctx.fillStyle = '#e6c88c'; ctx.fillRect(bx + 15, by, 6, 30); }
      }
      if (winT >= 0) { const sh = Math.sin(g.t * 40) * 1.5; ctx.fillStyle = 'rgba(255,224,102,0.25)'; ctx.fillRect(PX + sh, GY - 4, PW, GS + 8); }
      text(ctx, `${done.filter(Boolean).length} / ${K}`, PX + PW / 2, by - 16, 12, '#fff');
    },
  };
  return g;
}

// ---- 기계 수리 (연타) ----
function gMash() {
  const NEED = 14;
  const g = {
    t: 0, limit: 4.5, n: 0, rot: 0,
    key(k, on) { if (k === 'act' && on) g.hit(); },
    down() { g.hit(); },
    hit() { g.n++; g.rot += 0.6; audio.sfx('chop'); if (g.n >= NEED) g.finish('ok'); },
    draw(ctx) {
      bgPanel(ctx, '#3a3f4a', '#22252c');
      ctx.fillStyle = '#6f7d8e'; ctx.fillRect(110, 40, 100, 90);
      ctx.fillStyle = '#2b3240'; ctx.fillRect(122, 52, 76, 40);
      ctx.fillStyle = g.n >= NEED ? '#3ccf5a' : '#ff5252'; ctx.fillRect(150, 100, 20, 10);
      ctx.save(); ctx.translate(160, 72); ctx.rotate(Math.sin(g.rot) * 0.8);
      ctx.fillStyle = '#c8ccd4'; ctx.fillRect(-4, -26, 8, 40); ctx.fillRect(-12, -32, 24, 10); ctx.restore();
      ctx.fillStyle = '#0b1622'; ctx.fillRect(40, 160, 240, 18);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(42, 162, 236 * Math.min(1, g.n / NEED), 14);
      text(ctx, `${g.n} / ${NEED}`, 160, 154, 12);
    },
  };
  return g;
}

// ---- 재부팅 (길게 누르기) ----
function gHold() {
  const g = {
    t: 0, limit: 6, holding: false, p: 0,
    key(k, on) { if (k === 'act') g.holding = on; },
    down() { g.holding = true; }, up() { g.holding = false; },
    update(dt) {
      g.p = clamp(g.p + (g.holding ? dt / 1.5 : -dt / 3), 0, 1);
      if (g.holding && Math.random() < 0.3) audio.sfx('tick');
      if (g.p >= 1) g.finish('ok');
    },
    draw(ctx) {
      bgPanel(ctx, '#101820', '#05090d');
      ctx.fillStyle = '#2a2f3a'; ctx.fillRect(80, 30, 160, 100);
      ctx.fillStyle = '#081018'; ctx.fillRect(88, 38, 144, 84);
      for (let i = 0; i < 10; i++) { ctx.fillStyle = `hsl(${(i * 47 + g.t * 300) % 360},80%,50%)`; ctx.fillRect(88 + ((i * 37 + g.t * 90) % 140), 40 + i * 8, rand(10, 40), 3); }
      text(ctx, 'SYSTEM ERROR', 160, 84, 14, g.p > 0.5 ? '#3fd0ff' : '#ff5252');
      ctx.fillStyle = '#0b1622'; ctx.fillRect(40, 160, 240, 18);
      ctx.fillStyle = '#3fd0ff'; ctx.fillRect(42, 162, 236 * g.p, 14);
      text(ctx, '재부팅 중…', 160, 154, 12);
    },
  };
  return g;
}

// ---- 바닥 닦기 ----
function gMop() {
  const NEED = 8;
  const g = {
    t: 0, limit: 6, n: 0, lastDir: 0, ax: null, mx: 160,
    key(k, on) { if (!on) return; if (k === 'left') g.swipe(-1); if (k === 'right') g.swipe(1); },
    down(p) { g.ax = p.x; },
    move(p) { if (g.ax == null) return; g.mx = p.x; const d = p.x - g.ax; if (Math.abs(d) > 30) { g.swipe(Math.sign(d)); g.ax = p.x; } },
    up() { g.ax = null; },
    swipe(d) {
      if (d === g.lastDir) return;
      g.lastDir = d; g.n++; g.mx = 160 + d * 60; audio.sfx('splash');
      if (g.n >= NEED) g.finish('ok');
    },
    draw(ctx) {
      bgPanel(ctx, '#3b4759', '#2a3342');
      ctx.globalAlpha = 1 - g.n / NEED;
      for (let i = 0; i < 18; i++) { ctx.fillStyle = 'rgba(200,240,255,0.6)'; ctx.beginPath(); ctx.arc(30 + (i * 53) % 260, 40 + (i * 29) % 110, 6 + (i % 3) * 3, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#c9a26b'; ctx.fillRect(g.mx - 2, 40, 4, 90);
      ctx.fillStyle = '#eee'; ctx.fillRect(g.mx - 20, 126, 40, 14);
      ctx.fillStyle = '#0b1622'; ctx.fillRect(40, 160, 240, 18);
      ctx.fillStyle = '#7cf'; ctx.fillRect(42, 162, 236 * (g.n / NEED), 14);
      text(ctx, `${g.n} / ${NEED}`, 160, 154, 12);
    },
  };
  return g;
}
