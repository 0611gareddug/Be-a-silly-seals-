/* global __DEV__ */
// ===== 업무 미니게임 (여러 단계 · 타격감 · 판정 등급) =====
import { FISH, GRADE_NAME } from './data.js';
import { audio } from './audio.js';
import { rand, clamp } from './util.js';
import { itemSprite } from './sprites.js';

const LW = 320, LH = 200;
let active = null;
export const mgActive = () => !!active;

const TITLES = { catch: '🎣 건지기', cut: '🔪 손질', pack: '📦 포장 · 출하', repair: '🔧 기계 수리', reboot: '💻 재부팅', mop: '🧽 바닥 닦기' };
const GCOL = ['#c9d2e0', '#7fd1ff', '#ffe066'];

// 결과: { r: 'ok' | 'fail' | 'cancel', g: 0~2 (판정) }
export function runMinigame(kind, tier = 0, combo = 0) {
  if (active) return Promise.resolve({ r: 'cancel', g: 0 });
  return new Promise((resolve) => {
    const root = document.getElementById('mg');
    const cv = root.querySelector('canvas');
    root.querySelector('.mg-title').textContent = TITLES[kind] + (['catch', 'cut', 'pack'].includes(kind) ? ` · ${FISH[tier].name}` : '');
    const hint = root.querySelector('.mg-hint');
    const bar = root.querySelector('.mg-time i');
    root.classList.add('show');
    document.body.classList.add('modal-open');
    const J = juice();
    const g = makeGame(kind, tier, J);
    g.combo = combo;
    if (__DEV__) window.__mg = g;
    const GW = g.lw || LW, GH = g.lh || LH;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const reserve = window.innerHeight < 520 ? 70 : 120;
      const w = Math.min(window.innerWidth * 0.94, 680, (window.innerHeight - reserve) * (GW / GH));
      cv.style.width = w + 'px'; cv.style.height = w * GH / GW + 'px';
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * GH / GW * dpr);
    };
    fit();
    const ctx = cv.getContext('2d');
    let raf = 0, last = performance.now(), done = false, endT = 0;
    const finish = (r, grade = 0) => {
      if (done) return;
      done = true;
      g.result = r; g.grade = grade;
      if (r === 'ok') { audio.sfx(grade === 2 ? 'perfect' : 'ok'); J.pop(GRADE_NAME[grade], GCOL[grade], 1.6); J.burst(GW / 2, GH / 2, GCOL[grade], 26); J.shake(grade === 2 ? 5 : 3); }
      else if (r === 'fail') { audio.sfx('fail'); J.pop('실패…', '#ff6b6b', 1.4); J.shake(4); }
      setTimeout(() => {
        cancelAnimationFrame(raf);
        root.classList.remove('show');
        if (!document.querySelector('#pc.show') && !document.querySelector('#mapov.show') && !document.querySelector('#buy.show')) document.body.classList.remove('modal-open');
        cleanup();
        active = null;
        resolve({ r, g: grade });
      }, r === 'cancel' ? 0 : 650);
    };
    g.finish = finish;
    g.setHint = (s) => { hint.textContent = s; };
    g.setHint(g.hint || '');
    const toLocal = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * GW, y: (e.clientY - r.top) / r.height * GH, t: performance.now() };
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
      if (k === 'w' || k === 'arrowup') g.key && g.key('up', true);
      e.stopPropagation();
    };
    const ku = (e) => { const k = e.key.toLowerCase(); if (k === ' ' || k === 'e' || k === 'enter') g.key && g.key('act', false); };
    const closeBtn = root.querySelector('.mg-close');
    const onClose = () => finish('cancel');
    cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm);
    cv.addEventListener('pointerup', pu); cv.addEventListener('pointercancel', pu);
    window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true);
    window.addEventListener('resize', fit);
    closeBtn.addEventListener('click', onClose);
    const actBtn = root.querySelector('.mg-act');
    const ad = (e) => { e.preventDefault(); g.key && g.key('act', true); };
    const au = (e) => { e.preventDefault(); g.key && g.key('act', false); };
    actBtn.addEventListener('pointerdown', ad); actBtn.addEventListener('pointerup', au); actBtn.addEventListener('pointerleave', au);
    const syncAct = () => { const l = g.actLabel ? g.actLabel() : null; actBtn.style.display = l ? '' : 'none'; if (l && actBtn.textContent !== l) actBtn.textContent = l; };
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
        if (g.t >= g.limit) finish('fail');
        else g.update && g.update(dt);
      } else endT += dt;
      J.update(dt);
      syncAct();
      bar.style.transform = `scaleX(${clamp(1 - g.t / g.limit, 0, 1)})`;
      ctx.setTransform(cv.width / GW, 0, 0, cv.height / GH, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      if (J.sh > 0) ctx.translate(rand(-J.sh, J.sh), rand(-J.sh, J.sh));
      g.draw(ctx);
      ctx.restore();
      J.draw(ctx, GW, GH);
      // 단계 표시 + 콤보
      if (g.steps) {
        const n = g.steps.length;
        for (let i = 0; i < n; i++) {
          const x = GW / 2 - (n - 1) * 9 + i * 18;
          ctx.fillStyle = i < g.step ? '#4cd964' : i === g.step ? '#ffe066' : 'rgba(255,255,255,0.25)';
          ctx.fillRect(x - 6, 4, 12, 4);
        }
        text(ctx, g.steps[Math.min(g.step, n - 1)], GW / 2, 20, 11, '#fff');
      }
      if (g.combo > 0) text(ctx, `🔥 콤보 ${g.combo}`, GW - 6, 14, 10, '#ffb84a', 'right');
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}
export function cancelMinigame() { if (active) active.cancel(); }

// ---------- 타격감: 파티클 · 화면 흔들림 · 글자 팝 ----------
function juice() {
  const J = {
    parts: [], pops: [], sh: 0,
    burst(x, y, col, n = 12, sp = 90, grav = 160, size = 2) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.8); J.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.4, life: 0.5 + Math.random() * 0.4, t: 0, col, grav, size }); }
    },
    pop(txt, col, scale = 1) { J.pops.push({ txt, col, t: 0, scale }); },
    shake(v) { J.sh = Math.max(J.sh, v); },
    update(dt) {
      J.sh = Math.max(0, J.sh - dt * 18);
      for (const p of J.parts) { p.t += dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      J.parts = J.parts.filter((p) => p.t < p.life);
      for (const p of J.pops) p.t += dt;
      J.pops = J.pops.filter((p) => p.t < 0.9);
    },
    draw(ctx, W, H) {
      for (const p of J.parts) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
      ctx.globalAlpha = 1;
      for (const p of J.pops) {
        const k = Math.min(1, p.t / 0.12), s = (1.4 - 0.4 * k) * p.scale;
        ctx.globalAlpha = p.t > 0.6 ? 1 - (p.t - 0.6) / 0.3 : 1;
        ctx.font = `bold ${Math.round(18 * s)}px Galmuri11, sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#111'; ctx.strokeText(p.txt, W / 2, H / 2 - 4 - p.t * 14);
        ctx.fillStyle = p.col; ctx.fillText(p.txt, W / 2, H / 2 - 4 - p.t * 14);
        ctx.globalAlpha = 1;
      }
    },
  };
  return J;
}

function makeGame(kind, tier, J) {
  switch (kind) {
    case 'catch': return gCatch(tier, J);
    case 'cut': return gCut(tier, J);
    case 'pack': return gPack(tier, J);
    case 'repair': return gMash(J);
    case 'reboot': return gHold(J);
    case 'mop': return gMop(J);
  }
}

function bgPanel(ctx, top = '#17324a', bot = '#0f2133', W = LW, H = LH) {
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top); gr.addColorStop(1, bot);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
}
function text(ctx, s, x, y, size = 12, col = '#fff', align = 'center') {
  ctx.font = `${size}px Galmuri11, sans-serif`; ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
const gradeOf = (err, perfect, good, ok) => (err <= perfect ? 2 : err <= good ? 1 : err <= ok ? 0 : -1);

// ===== 🎣 건지기: ① 그림자에 맞춰 뜰채 넣기 → ② 연타로 끌어올리기 =====
function gCatch(tier, J) {
  const SP = [55, 70, 88, 105, 125][tier];
  const NEED = [8, 9, 10, 12, 14][tier];
  const net = { x: 160, y: 96, r: 20 };
  const fish = { x: 30, y: 96, dir: 1, ph: 0 };
  const deco = Array.from({ length: 5 }, () => ({ x: rand(20, 300), y: rand(40, 150), v: rand(15, 35) * (Math.random() < 0.5 ? -1 : 1) }));
  const g = {
    t: 0, limit: 11, step: 0, steps: ['① 그림자가 뜰채 안에 오면 누르기!', '② 연타! 끌어올려요!'], hint: '스페이스 / E / 화면 탭',
    pull: 0, grade: 0, dip: 0, tries: 2, splash: 0, fish, net,
    actLabel() { return g.step === 0 ? '뜰채 넣기!' : '끌어올리기!'; },
    key(k, on) { if (k === 'act' && on) g.press(); },
    down() { g.press(); },
    press() {
      if (g.step === 0) {
        const err = Math.abs(fish.x - net.x);
        const gr = gradeOf(err, 6, 14, 24);
        g.dip = 0.35;
        audio.sfx('splash');
        J.burst(net.x, net.y, '#bfe6ff', 18, 110);
        if (gr < 0) {
          g.tries--;
          J.pop('놓쳤다!', '#ff6b6b'); J.shake(3);
          if (g.tries <= 0) return g.finish('fail');
          fish.x = fish.dir > 0 ? 10 : 310; return;
        }
        g.grade = gr; g.step = 1;
        J.pop(GRADE_NAME[gr], GCOL[gr]); J.shake(gr === 2 ? 4 : 2);
        if (gr === 2) audio.sfx('perfect');
      } else {
        g.pull = Math.min(NEED, g.pull + 1);
        J.burst(net.x + rand(-8, 8), net.y - 10, '#e8f8ff', 6, 80); J.shake(1.5);
        audio.sfx('tick');
        if (g.pull >= NEED) g.finish('ok', g.grade);
      }
    },
    update(dt) {
      if (g.step === 0) {
        fish.ph += dt; fish.x += fish.dir * SP * dt;
        fish.y = 96 + Math.sin(fish.ph * 3) * 10;
        if (fish.x > 310) fish.dir = -1; if (fish.x < 10) fish.dir = 1;
      } else g.pull = Math.max(0, g.pull - dt * (1.8 + tier * 0.4));
      g.dip = Math.max(0, g.dip - dt);
      for (const d of deco) { d.x += d.v * dt; if (d.x < 10 || d.x > 310) d.v *= -1; }
    },
    draw(ctx) {
      bgPanel(ctx, '#1f6fa8', '#0b3150');
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      for (let i = 0; i < 7; i++) ctx.fillRect(((g.t * 25 + i * 53) % 340) - 20, 30 + i * 22, 26, 2);
      const sp = itemSprite(tier, 0);
      for (const d of deco) { ctx.globalAlpha = 0.35; ctx.save(); ctx.translate(Math.round(d.x), Math.round(d.y)); if (d.v < 0) ctx.scale(-1, 1); ctx.drawImage(sp, -sp.width, -sp.height, sp.width * 2, sp.height * 2); ctx.restore(); }
      ctx.globalAlpha = 1;
      if (g.step === 0) {
        // 목표 물고기 그림자
        ctx.fillStyle = 'rgba(5,20,35,0.55)'; ctx.beginPath(); ctx.ellipse(fish.x, fish.y + 4, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(Math.round(fish.x), Math.round(fish.y)); if (fish.dir < 0) ctx.scale(-1, 1); ctx.drawImage(sp, -sp.width * 1.5, -sp.height * 1.5, sp.width * 3, sp.height * 3); ctx.restore();
        // 뜰채
        const near = Math.abs(fish.x - net.x) < 14;
        ctx.strokeStyle = near ? '#7dff8a' : '#ffe066'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(net.x, net.y, net.r + (g.dip > 0 ? -4 : 0), 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(net.x + i * 7, net.y - net.r + 3); ctx.lineTo(net.x + i * 7, net.y + net.r - 3); ctx.stroke(); }
        ctx.fillStyle = '#c9a26b'; ctx.fillRect(net.x - 2, 4, 4, net.y - net.r - 4);
        text(ctx, `기회 ${g.tries}`, 8, 192, 10, '#cde', 'left');
      } else {
        // 끌어올리기: 버둥대는 물고기 + 게이지
        const k = g.pull / NEED;
        const fy = 150 - k * 90 + Math.sin(g.t * 30) * 3;
        ctx.save(); ctx.translate(net.x, fy); ctx.rotate(Math.sin(g.t * 25) * 0.4);
        ctx.drawImage(sp, -sp.width * 2, -sp.height * 2, sp.width * 4, sp.height * 4); ctx.restore();
        ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(net.x, fy + 8, 22, 0, Math.PI); ctx.stroke();
        ctx.fillStyle = '#c9a26b'; ctx.fillRect(net.x - 2, 0, 4, fy - 14);
        ctx.fillStyle = '#0b1622'; ctx.fillRect(282, 30, 18, 140);
        ctx.fillStyle = k > 0.75 ? '#7dff8a' : '#ffd23f'; ctx.fillRect(284, 168 - 136 * k, 14, 136 * k);
        text(ctx, '연타!', 291, 186, 11, '#ffe066');
      }
    },
  };
  return g;
}

// ===== 🔪 손질: ① 비늘 긁기 (좌우 문지르기) → ② 점선 따라 칼질 =====
function gCut(tier, J) {
  const F = FISH[tier];
  const SCRAPE = 5 + tier;
  const segs = [1, 2, 2, 3, 4][tier];
  const mk = () => {
    const pts = [{ x: 50, y: rand(85, 115) }];
    for (let i = 1; i <= segs; i++) pts.push({ x: 50 + (220 * i) / segs, y: segs === 1 ? rand(85, 115) : rand(65, 135) });
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 5);
      for (let k = 0; k < n; k++) samples.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, c: false });
    }
    samples.push({ ...pts[pts.length - 1], c: false });
    return { pts, samples };
  };
  let P = mk();
  const scales = Array.from({ length: 40 }, () => ({ x: rand(60, 255), y: rand(70, 130), on: true }));
  const g = {
    t: 0, limit: 13, step: 0, steps: ['① 비늘 긁기: 생선 위를 좌우로 문질러요', '② 칼질: 빨간 점부터 점선을 따라 쭉!'], hint: '드래그 / 스와이프 (PC는 A·D로 긁기 가능)',
    scr: 0, lastDir: 0, ax: null, drawing: false, trail: [], off: 0, moves: 0, tries: 2,
    get path() { return P; },
    key(k, on) { if (!on || g.step !== 0) return; if (k === 'left') g.scrape(-1, 160); if (k === 'right') g.scrape(1, 160); },
    scrape(d, x) {
      if (d === g.lastDir) return;
      g.lastDir = d; g.scr++;
      audio.sfx('scale');
      let n = 0; for (const s of scales) if (s.on && Math.abs(s.x - x) < 70 && n < 6) { s.on = false; n++; J.burst(s.x, s.y, '#e8f2ff', 3, 70, 220, 2); }
      J.shake(1.2);
      if (g.scr >= SCRAPE) { g.step = 1; J.pop('비늘 제거!', '#bfe6ff'); audio.sfx('ok'); }
    },
    down(p) {
      if (g.step === 0) { g.ax = p.x; return; }
      g.drawing = true; g.trail = [p]; g.mark(p);
    },
    move(p) {
      if (g.step === 0) { if (g.ax == null) return; const d = p.x - g.ax; if (Math.abs(d) > 26) { g.scrape(Math.sign(d), p.x); g.ax = p.x; } return; }
      if (!g.drawing) return;
      g.trail.push(p); if (g.trail.length > 40) g.trail.shift(); g.mark(p);
    },
    mark(p) {
      g.moves++;
      let near = 1e9;
      for (const s of P.samples) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < 15) s.c = true; if (d < near) near = d; }
      if (near > 26) g.off++;
      if (g.moves % 3 === 0) { audio.sfx('chop'); J.burst(p.x, p.y, '#ff9f9f', 2, 50, 200, 2); }
    },
    up() {
      if (g.step === 0) { g.ax = null; return; }
      if (!g.drawing) return;
      g.drawing = false;
      const cov = P.samples.filter((s) => s.c).length / P.samples.length;
      const offR = g.off / Math.max(1, g.moves);
      if (cov >= 0.7 && offR < 0.45) { J.shake(4); J.burst(160, 100, '#fff', 20, 120); return g.finish('ok', cov >= 0.92 && offR < 0.12 ? 2 : cov >= 0.82 ? 1 : 0); }
      g.tries--;
      if (g.tries <= 0) return g.finish('fail');
      J.pop('다시!', '#ffe066'); P = mk(); g.off = 0; g.moves = 0; g.trail = [];
      audio.sfx('fail');
    },
    draw(ctx) {
      bgPanel(ctx, '#5a3a28', '#3a2418');
      ctx.fillStyle = '#e0bb84'; ctx.fillRect(18, 30, 284, 152);
      ctx.fillStyle = '#c99a5c'; for (let i = 0; i < 6; i++) ctx.fillRect(24 + i * 46, 40 + (i % 2) * 70, 30, 2);
      ctx.fillStyle = F.dark; ctx.beginPath(); ctx.ellipse(160, 100, 125, 48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = F.color; ctx.beginPath(); ctx.ellipse(160, 106, 118, 40, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(40, 100); ctx.lineTo(18, 70); ctx.lineTo(18, 130); ctx.closePath(); ctx.fillStyle = F.dark; ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(255, 90, 6, 6);
      if (g.step === 0) {
        for (const s of scales) if (s.on) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(s.x, s.y, 4, 3); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(s.x, s.y + 3, 4, 1); }
        ctx.fillStyle = '#0b1622'; ctx.fillRect(60, 186, 200, 8); ctx.fillStyle = '#bfe6ff'; ctx.fillRect(61, 187, 198 * (g.scr / SCRAPE), 6);
        // 긁개
        const sx = g.ax != null ? g.ax : 160 + g.lastDir * 50;
        ctx.fillStyle = '#9aa0aa'; ctx.fillRect(sx - 14, 60, 28, 6); ctx.fillStyle = '#6b4a2f'; ctx.fillRect(sx - 3, 40, 6, 20);
      } else {
        for (const s of P.samples) { ctx.fillStyle = s.c ? '#ffffff' : 'rgba(30,30,30,0.75)'; ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); }
        ctx.fillStyle = '#ff5252'; ctx.fillRect(P.pts[0].x - 4, P.pts[0].y - 4, 8, 8);
        if (g.trail.length > 1) {
          ctx.strokeStyle = 'rgba(220,240,255,0.95)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(g.trail[0].x, g.trail[0].y); for (const q of g.trail) ctx.lineTo(q.x, q.y); ctx.stroke();
          const q = g.trail[g.trail.length - 1];
          ctx.fillStyle = '#dfe6ee'; ctx.fillRect(q.x - 2, q.y - 16, 4, 14); ctx.fillStyle = '#3a2a22'; ctx.fillRect(q.x - 2, q.y - 24, 4, 8);
        }
        text(ctx, `기회 ${g.tries}`, 8, 192, 10, '#fff', 'left');
      }
    },
  };
  return g;
}

// ===== 📦 포장 · 출하: 팩 넣기 → 덮개 닫기 → 테이프건 → 도장 → 벨트로 밀기 =====
function gPack(tier, J) {
  const F = FISH[tier];
  const W = 320, H = 200;
  const box = { x: 160, y: 118, w: 110, h: 64 };
  const g = {
    t: 0, limit: 16, step: 0, lw: W, lh: H,
    steps: ['① 생선 팩을 상자에 넣어요 (끌기)', '② 덮개를 닫아요 (왼쪽 → 오른쪽 덮개)', '③ 테이프건으로 쫘아악! (한 번에 빠르게)', '④ 도장 쾅! (원 안에 왔을 때)', '⑤ 출하 벨트로 밀어요! (위로 밀기)'],
    hint: '마우스 / 손가락으로 끌어요',
    pk: { x: 50, y: 70, drag: false }, flaps: [0, 0], flapStart: null,
    tape: null, tapeK: 0, tapeGrade: 1, stampX: 0, stampDir: 1, stampDone: false, stampGrade: 1, stampMark: null,
    push: 0, pushStart: null, boxDY: 0, ok: false,
    actLabel() { return g.step === 3 ? '쾅!' : null; },
    key(k, on) {
      if (!on) return;
      if (k === 'act' && g.step === 3) g.stamp();
      if (k === 'up' && g.step === 4) g.doPush();
    },
    down(p) {
      if (g.step === 0 && Math.hypot(p.x - g.pk.x, p.y - g.pk.y) < 34) { g.pk.drag = true; audio.sfx('click'); }
      else if (g.step === 1) g.flapStart = p;
      else if (g.step === 2) { if (p.x < box.x - box.w / 2 + 30 && Math.abs(p.y - box.y) < 34) { g.tape = { x0: p.x, t0: p.t, ys: [p.y], x: p.x }; audio.sfx('tape'); } }
      else if (g.step === 3) g.stamp();
      else if (g.step === 4) g.pushStart = p;
    },
    move(p) {
      if (g.step === 0 && g.pk.drag) { g.pk.x = p.x; g.pk.y = p.y; }
      if (g.step === 2 && g.tape) { g.tape.x = Math.max(g.tape.x, p.x); g.tape.ys.push(p.y); if (Math.random() < 0.3) J.burst(p.x, p.y, '#d9d0b0', 2, 40, 120, 2); }
      if (g.step === 4 && g.pushStart) { const d = g.pushStart.y - p.y; g.boxDY = -Math.max(0, d) * 0.6; if (d > 40) g.doPush(); }
    },
    up(p) {
      if (g.step === 0 && g.pk.drag) {
        g.pk.drag = false;
        if (Math.abs(p.x - box.x) < box.w / 2 && Math.abs(p.y - box.y) < box.h / 2 + 10) { g.step = 1; audio.sfx('box'); J.shake(2); J.burst(box.x, box.y - 10, '#e6c88c', 10, 70); }
        else { g.pk.x = 50; g.pk.y = 70; }
      } else if (g.step === 1 && g.flapStart) {
        const dx = p.x - g.flapStart.x;
        const side = g.flaps[0] ? 1 : 0;
        if ((side === 0 && dx > 24) || (side === 1 && dx < -24) || Math.abs(dx) < 6) {
          g.flaps[side] = 1; audio.sfx('thud'); J.shake(3); J.burst(box.x + (side ? 30 : -30), box.y - box.h / 2, '#c99858', 8, 60);
          if (g.flaps[0] && g.flaps[1]) g.step = 2;
        }
        g.flapStart = null;
      } else if (g.step === 2 && g.tape) {
        const right = box.x + box.w / 2 - 10;
        if (g.tape.x >= right) {
          const dur = (p.t - g.tape.t0) / 1000;
          const ys = g.tape.ys; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
          const dev = Math.sqrt(ys.reduce((a, b) => a + (b - my) ** 2, 0) / ys.length);
          g.tapeGrade = dur < 0.5 && dev < 6 ? 2 : dur < 0.9 && dev < 11 ? 1 : 0;
          J.pop(GRADE_NAME[g.tapeGrade], GCOL[g.tapeGrade]); J.shake(3); audio.sfx(g.tapeGrade === 2 ? 'perfect' : 'box');
          g.tapeK = 1; g.step = 3;
        } else { g.tape = null; J.pop('끝까지!', '#ff6b6b'); }
        g.tape = null;
      } else if (g.step === 4) { g.pushStart = null; if (!g.ok) g.boxDY = 0; }
    },
    stamp() {
      if (g.stampDone) return;
      const err = Math.abs(g.stampX);
      g.stampGrade = err < 6 ? 2 : err < 14 ? 1 : 0;
      g.stampDone = true; g.stampMark = g.stampX;
      audio.sfx('stamp'); J.shake(6); J.burst(box.x + g.stampX, box.y, '#d02a2a', 14, 90);
      J.pop(GRADE_NAME[g.stampGrade], GCOL[g.stampGrade]);
      setTimeout(() => { g.step = 4; }, 280);
    },
    doPush() {
      if (g.ok) return;
      g.ok = true; audio.sfx('whoosh'); J.burst(box.x, box.y, '#fff', 16, 120);
      const total = g.tapeGrade + g.stampGrade;
      setTimeout(() => g.finish('ok', total >= 4 ? 2 : total >= 2 ? 1 : 0), 380);
    },
    update(dt) {
      if (g.step === 3 && !g.stampDone) { g.stampX += g.stampDir * (90 + tier * 18) * dt; if (Math.abs(g.stampX) > 44) g.stampDir *= -1; }
      if (g.ok) g.boxDY -= 380 * dt;
    },
    draw(ctx) {
      bgPanel(ctx, '#4a3c2c', '#2a2018', W, H);
      // 작업대 + 벨트
      ctx.fillStyle = '#7a5a40'; ctx.fillRect(0, 150, W, 50);
      ctx.fillStyle = '#2c2f37'; ctx.fillRect(box.x - 70, 0, 140, 34);
      ctx.fillStyle = 'rgba(140,150,165,0.6)'; for (let i = 0; i < 10; i++) ctx.fillRect(box.x - 70 + ((i * 14 + g.t * 40) % 140), 6, 6, 22);
      text(ctx, '출하 벨트 ▲', box.x, 46, 10, '#ffe066');
      const by = box.y + g.boxDY;
      // 상자
      ctx.fillStyle = '#5a3c1e'; ctx.fillRect(box.x - box.w / 2 - 2, by - box.h / 2 - 2, box.w + 4, box.h + 4);
      ctx.fillStyle = '#c99858'; ctx.fillRect(box.x - box.w / 2, by - box.h / 2, box.w, box.h);
      ctx.fillStyle = '#a77a40'; ctx.fillRect(box.x - box.w / 2, by - box.h / 2, box.w, 6);
      if (g.step >= 1) { // 들어간 팩
        ctx.fillStyle = '#f2f6fa'; ctx.fillRect(box.x - 30, by - 20, 60, 30); ctx.fillStyle = F.color; ctx.fillRect(box.x - 24, by - 14, 48, 18);
      }
      // 덮개
      const fl = (side) => {
        const closed = g.flaps[side];
        ctx.fillStyle = closed ? '#d6a868' : '#b8874a';
        if (closed) ctx.fillRect(side ? box.x : box.x - box.w / 2, by - box.h / 2, box.w / 2, box.h);
        else ctx.fillRect(side ? box.x + box.w / 2 : box.x - box.w / 2 - 34, by - box.h / 2 - 8, 34, box.h * 0.8);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; if (closed) ctx.fillRect(box.x - 1, by - box.h / 2, 2, box.h);
      };
      fl(0); fl(1);
      if (g.step === 1) { const side = g.flaps[0] ? 1 : 0; text(ctx, side ? '← 밀기' : '밀기 →', side ? box.x + 60 : box.x - 60, by + 4, 12, '#ffe066'); }
      // 테이프
      if (g.tapeK) { ctx.fillStyle = 'rgba(230,220,180,0.9)'; ctx.fillRect(box.x - box.w / 2, by - 6, box.w, 12); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(box.x - box.w / 2, by - 6, box.w, 2); }
      if (g.step === 2) {
        ctx.fillStyle = '#ffe066'; ctx.fillRect(box.x - box.w / 2 - 6, by - 10, 6, 20); ctx.fillRect(box.x + box.w / 2, by - 10, 6, 20);
        if (g.tape) { const w = g.tape.x - (box.x - box.w / 2); ctx.fillStyle = 'rgba(230,220,180,0.9)'; ctx.fillRect(box.x - box.w / 2, by - 6, Math.max(0, w), 12); ctx.fillStyle = '#d02a2a'; ctx.fillRect(g.tape.x - 8, by - 14, 14, 10); ctx.fillStyle = '#333'; ctx.fillRect(g.tape.x - 2, by - 4, 4, 14); }
        else text(ctx, '왼쪽 노란 표시에서 → 오른쪽까지 쫙!', box.x, by + 46, 10, '#fff');
      }
      // 도장 영역 · 움직이는 도장
      if (g.step >= 3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(box.x, by + 18, 10, 0, Math.PI * 2); ctx.stroke();
        if (g.stampMark != null) { ctx.strokeStyle = '#d02a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(box.x + g.stampMark, by + 18, 9, 0, Math.PI * 2); ctx.stroke(); text(ctx, '출하', box.x + g.stampMark, by + 22, 8, '#d02a2a'); }
        if (!g.stampDone) { const sx = box.x + g.stampX; ctx.fillStyle = '#6b3f1f'; ctx.fillRect(sx - 4, by - 26, 8, 20); ctx.fillStyle = '#d02a2a'; ctx.fillRect(sx - 9, by - 8, 18, 8); }
      }
      if (g.step === 4 && !g.ok) text(ctx, '▲ 위로 밀어 올려요 (W / ↑)', box.x, 192, 11, '#ffe066');
      // 생선 팩 (드래그)
      if (g.step === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(g.pk.x - 26, g.pk.y - 12, 56, 30);
        ctx.fillStyle = '#f2f6fa'; ctx.fillRect(g.pk.x - 28, g.pk.y - 16, 56, 30);
        ctx.fillStyle = F.color; ctx.fillRect(g.pk.x - 22, g.pk.y - 10, 44, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(g.pk.x - 22, g.pk.y - 10, 44, 3);
        if (!g.pk.drag) text(ctx, '끌어서 상자로 →', g.pk.x + 4, g.pk.y + 30, 10, '#ffe066');
      }
    },
  };
  return g;
}

// ===== 🔧 수리: 연타 + 불꽃 =====
function gMash(J) {
  const NEED = 14;
  const g = {
    t: 0, limit: 5, n: 0, rot: 0, steps: ['렌치로 쾅쾅! 연타'], step: 0, hint: '스페이스 / E / 탭 연타',
    actLabel() { return '연타!'; },
    key(k, on) { if (k === 'act' && on) g.hit(); }, down() { g.hit(); },
    hit() { g.n++; g.rot += 0.7; audio.sfx('chop'); J.burst(160, 72, '#ffd23f', 6, 110); J.shake(2); if (g.n >= NEED) g.finish('ok', g.t < 2.6 ? 2 : g.t < 3.6 ? 1 : 0); },
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
// ===== 💻 재부팅: 길게 누르기 =====
function gHold(J) {
  const g = {
    t: 0, limit: 6, holding: false, p: 0, steps: ['버튼을 꾹 누르고 있어요'], step: 0, hint: '스페이스 / E / 길게 누르기',
    actLabel() { return '꾹 누르기'; },
    key(k, on) { if (k === 'act') g.holding = on; }, down() { g.holding = true; }, up() { g.holding = false; },
    update(dt) {
      g.p = clamp(g.p + (g.holding ? dt / 1.5 : -dt / 3), 0, 1);
      if (g.holding && Math.random() < 0.3) { audio.sfx('tick'); J.burst(160, 84, '#3fd0ff', 2, 60, 0, 2); }
      if (g.p >= 1) g.finish('ok', 1);
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
// ===== 🧽 바닥 닦기: 좌우 문지르기 =====
function gMop(J) {
  const NEED = 8;
  const g = {
    t: 0, limit: 6, n: 0, lastDir: 0, ax: null, mx: 160, steps: ['좌우로 박박 문질러요!'], step: 0, hint: 'A·D / ←→ / 좌우 스와이프',
    key(k, on) { if (!on) return; if (k === 'left') g.swipe(-1); if (k === 'right') g.swipe(1); },
    down(p) { g.ax = p.x; },
    move(p) { if (g.ax == null) return; g.mx = p.x; const d = p.x - g.ax; if (Math.abs(d) > 30) { g.swipe(Math.sign(d)); g.ax = p.x; } },
    up() { g.ax = null; },
    swipe(d) {
      if (d === g.lastDir) return;
      g.lastDir = d; g.n++; g.mx = 160 + d * 60; audio.sfx('splash'); J.burst(g.mx, 130, '#bfe6ff', 8, 80); J.shake(1.5);
      if (g.n >= NEED) g.finish('ok', g.t < 3 ? 2 : 1);
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
