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
  pack: '조각을 끌어서 상자 칸을 빈틈없이 채워요',
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const w = Math.min(window.innerWidth * 0.94, 640, (window.innerHeight - 120) * (LW / LH));
      cv.style.width = w + 'px'; cv.style.height = w * LH / LW + 'px';
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * LH / LW * dpr);
    };
    fit();
    const ctx = cv.getContext('2d');
    const g = makeGame(kind, tier);
    let raf = 0, last = performance.now(), done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      audio.sfx(r === 'ok' ? 'ok' : r === 'fail' ? 'fail' : 'click');
      g.result = r;
      setTimeout(() => {
        cancelAnimationFrame(raf);
        root.classList.remove('show');
        cleanup();
        active = null;
        resolve(r);
      }, r === 'cancel' ? 0 : 380);
    };
    g.finish = finish;
    const toLocal = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * LW, y: (e.clientY - r.top) / r.height * LH };
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
      ctx.setTransform(cv.width / LW, 0, 0, cv.height / LH, 0, 0);
      ctx.imageSmoothingEnabled = false;
      g.draw(ctx);
      if (g.result) {
        ctx.fillStyle = g.result === 'ok' ? 'rgba(60,200,110,0.35)' : 'rgba(230,60,60,0.35)';
        ctx.fillRect(0, 0, LW, LH);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 28px Galmuri11, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(g.result === 'ok' ? '성공!' : g.result === 'fail' ? '실패…' : '', LW / 2, LH / 2 + 10);
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
    case 'pack': return gPack(tier);
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

// ---- 포장 ----
const PCOL = ['#ff8a80', '#80d8ff', '#ccff90', '#ffd180', '#ea80fc', '#a7ffeb', '#ffff8d', '#b388ff', '#ff9e80', '#84ffff'];
function gPack(tier) {
  const N = [3, 3, 4, 4, 4][tier], maxS = tier < 2 ? 3 : 4;
  const CS = N === 3 ? 40 : 32, GX = 20, GY = 30;
  const owner = new Array(N * N).fill(-1);
  const pieces = [];
  const order = [...Array(N * N).keys()].sort(() => Math.random() - 0.5);
  for (const start of order) {
    if (owner[start] !== -1) continue;
    const id = pieces.length, cells = [start]; owner[start] = id;
    const size = randi(1, maxS);
    while (cells.length < size) {
      const opts = [];
      for (const c of cells) {
        const cx = c % N, cy = (c / N) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && owner[ny * N + nx] === -1) opts.push(ny * N + nx);
        }
      }
      if (!opts.length) break;
      const n = opts[randi(0, opts.length - 1)]; owner[n] = id; cells.push(n);
    }
    const xs = cells.map((c) => c % N), ys = cells.map((c) => (c / N) | 0);
    const mx = Math.min(...xs), my = Math.min(...ys);
    pieces.push({ id, cells: cells.map((c) => ({ x: (c % N) - mx, y: ((c / N) | 0) - my })), w: Math.max(...xs) - mx + 1, h: Math.max(...ys) - my + 1, color: PCOL[id % PCOL.length], placed: null, tx: 0, ty: 0 });
  }
  // 트레이 배치
  const TS = 14, TX0 = GX + N * CS + 18;
  let tx = TX0, ty = 30, rowH = 0;
  for (const p of pieces.sort(() => Math.random() - 0.5)) {
    if (tx + p.w * TS > LW - 6) { tx = TX0; ty += rowH + 8; rowH = 0; }
    p.tx = tx; p.ty = ty; tx += p.w * TS + 8; rowH = Math.max(rowH, p.h * TS);
  }
  const grid = new Array(N * N).fill(-1);
  const g = {
    t: 0, limit: [16, 16, 20, 20, 22][tier], drag: null,
    down(pt) {
      // 상자 위 조각 다시 집기
      const gx = Math.floor((pt.x - GX) / CS), gy = Math.floor((pt.y - GY) / CS);
      if (gx >= 0 && gy >= 0 && gx < N && gy < N && grid[gy * N + gx] >= 0) {
        const p = pieces.find((q) => q.id === grid[gy * N + gx]);
        for (let i = 0; i < grid.length; i++) if (grid[i] === p.id) grid[i] = -1;
        g.drag = { p, ox: gx - p.placed.x, oy: gy - p.placed.y, x: pt.x, y: pt.y };
        p.placed = null;
        return;
      }
      for (const p of pieces) {
        if (p.placed) continue;
        for (const c of p.cells) {
          const x0 = p.tx + c.x * TS, y0 = p.ty + c.y * TS;
          if (pt.x >= x0 - 3 && pt.x < x0 + TS + 3 && pt.y >= y0 - 3 && pt.y < y0 + TS + 3) { g.drag = { p, ox: c.x, oy: c.y, x: pt.x, y: pt.y }; audio.sfx('click'); return; }
        }
      }
    },
    move(pt) { if (g.drag) { g.drag.x = pt.x; g.drag.y = pt.y; } },
    up(pt) {
      if (!g.drag) return;
      const { p, ox, oy } = g.drag;
      g.drag = null;
      const bx = Math.floor((pt.x - GX) / CS) - ox, by = Math.floor((pt.y - GY) / CS) - oy;
      const ok = p.cells.every((c) => { const x = bx + c.x, y = by + c.y; return x >= 0 && y >= 0 && x < N && y < N && grid[y * N + x] === -1; });
      if (ok) {
        for (const c of p.cells) grid[(by + c.y) * N + bx + c.x] = p.id;
        p.placed = { x: bx, y: by };
        audio.sfx('box');
        if (grid.every((v) => v >= 0)) g.finish('ok');
      }
    },
    draw(ctx) {
      bgPanel(ctx, '#3d4a35', '#262f22');
      ctx.fillStyle = '#2a1d10'; ctx.fillRect(GX - 4, GY - 4, N * CS + 8, N * CS + 8);
      ctx.fillStyle = '#c99858'; ctx.fillRect(GX - 2, GY - 2, N * CS + 4, N * CS + 4);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#a77a40' : '#b0844a'; ctx.fillRect(GX + x * CS + 1, GY + y * CS + 1, CS - 2, CS - 2);
      }
      const cell = (x, y, s, col) => {
        ctx.fillStyle = '#1b1b1b'; ctx.fillRect(x, y, s, s);
        ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 2, y + 2, s - 4, 2);
      };
      for (const p of pieces) {
        if (p.placed) for (const c of p.cells) cell(GX + (p.placed.x + c.x) * CS + 1, GY + (p.placed.y + c.y) * CS + 1, CS - 2, p.color);
        else if (!g.drag || g.drag.p !== p) for (const c of p.cells) cell(p.tx + c.x * TS, p.ty + c.y * TS, TS, p.color);
      }
      if (g.drag) {
        const { p, ox, oy, x, y } = g.drag;
        ctx.globalAlpha = 0.85;
        for (const c of p.cells) cell(x + (c.x - ox - 0.5) * CS, y + (c.y - oy - 0.5) * CS, CS - 2, p.color);
        ctx.globalAlpha = 1;
      }
      text(ctx, '조각', GX + N * CS + 18, 22, 11, '#dfe', 'left');
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
