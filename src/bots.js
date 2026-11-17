// ===== AI 봇 (호스트에서 실행) =====
import { SPEED, HOLD_SPEED, TILE, STATION_BY_ID, stationPoint, TOYS, SABS, activePads, nearestOf } from './data.js';
import { findPath, moveWithCollision, rand, pick } from './util.js';

const PARAM = [
  { succ: 0.72, perfect: 0.2, speed: 0.85, react: [1.4, 2.6], stress: 82, work: 1.45, shop: 0.6 },
  { succ: 0.86, perfect: 0.45, speed: 1, react: [0.7, 1.6], stress: 72, work: 1.15, shop: 0.85 },
  { succ: 0.95, perfect: 0.7, speed: 1.08, react: [0.25, 0.7], stress: 66, work: 0.95, shop: 1 },
];
const WORK = { tank: 3.2, cut: 3.6, pack: 5.2, fix: 3, unhack: 1.5, take: 0.4, send: 0.4 };

function ai(p) {
  if (!p.ai) p.ai = { task: null, path: null, arrived: false, workT: 0, react: -1, shopCd: rand(6, 12), stuckT: 0, lastD: 1e9, idleT: 0 };
  return p.ai;
}
function goTo(sim, p, kind, extra, pt) {
  const a = ai(p);
  const path = findPath(sim.fp(p).solid, p.x, p.y, pt.x, pt.y);
  if (!path) { a.task = null; a.idleT = 0.5; return; }
  a.task = { kind, ...extra, pt };
  a.path = path; a.arrived = false; a.stuckT = 0; a.lastD = 1e9;
}
const pt = (id) => stationPoint(STATION_BY_ID[id]);
const padPt = (pad) => ({ x: (pad.x + pad.w / 2) * TILE, y: (pad.y + pad.h / 2) * TILE });

export function botThink(sim, p, dt) {
  const a = ai(p);
  const P = PARAM[p.diff] || PARAM[1];
  if (sim.phase !== 'play' || !sim.canAct(p)) { a.path = null; a.task = null; a.workT = 0; return; }
  const f = sim.fp(p);
  if (a.shopCd > 0) a.shopCd -= dt;

  if (p.toy && p.waking <= 0) {
    if (f.cctv.active) {
      if (a.react < 0) a.react = rand(P.react[0], P.react[1]);
      a.react -= dt;
      if (a.react <= 0) { sim.handle(p.id, { t: 'toy', on: false }); a.react = -1; }
      return;
    }
    a.react = -1;
    if (p.stress < 18) sim.handle(p.id, { t: 'toy', on: false });
    return;
  }
  if (p.waking > 0) return;
  if (a.workT > 0) { a.workT -= dt; if (a.workT <= 0) finishWork(sim, p, a, P); return; }
  if (a.path) return;
  if (a.idleT > 0) { a.idleT -= dt; return; }
  if (a.arrived && a.task) { arrive(sim, p, a, P); return; }

  // 새 작업 고르기
  if (p.stress > P.stress && !f.cctv.active && !sim.evOn(f, 'patrol')) { sim.handle(p.id, { t: 'toy', on: true, id: Math.max(...p.owned) }); return; }
  const broken = f.zones.findIndex((z) => z.u && z.br);
  if (broken >= 0) return goTo(sim, p, 'fix', { z: broken }, pt('mach' + broken));
  if (p.hack > 3 && p.diff >= 1) return goTo(sim, p, 'unhack', {}, pt('pc'));
  const cat = f.cats.find((c) => c.st === 'eat');
  if (cat && !p.hold) return goTo(sim, p, 'cat', { id: cat.id }, { x: cat.x + rand(-4, 4), y: cat.y + 2 });
  // 바닥 구매 버튼
  if (a.shopCd <= 0 && !p.hold) {
    const pad = choosePad(sim, p, f, P);
    if (pad) return goTo(sim, p, 'pad', { id: pad.pad.id }, padPt(pad.pad));
    a.shopCd = rand(4, 8);
  }
  if (p.hold) {
    if (p.hold.s === 0) return goTo(sim, p, 'cut', {}, stationPoint(nearestOf('cut', p.x, p.y)));
    return goTo(sim, p, 'pack', {}, stationPoint(nearestOf('pack', p.x, p.y)));
  }
  // 자동 포장기에 상자가 쌓였으면 보내기
  const sendZ = f.zones.findIndex((z) => z.m[2] && !z.m[3] && z.buf[2] >= 3);
  if (sendZ >= 0) return goTo(sim, p, 'send', { z: sendZ }, pt('apack' + sendZ));
  // 일할 생선 고르기: 주문 우선, 완전 자동이 아닌 가장 비싼 구역
  const manual = (z) => f.zones[z].u && !f.zones[z].br && !sim.catOn(f, z) && !f.zones[z].m[3];
  let tier = -1;
  const need = f.orders.filter((o) => o.d < o.q && manual(o.t)).sort((x, y) => y.t - x.t || x.tl - y.tl);
  if (need.length) tier = need[0].t;
  else for (let z = 4; z >= 0; z--) if (manual(z)) { tier = z; break; }
  if (tier < 0) for (let z = 4; z >= 0; z--) if (f.zones[z].u && !f.zones[z].br && !sim.catOn(f, z)) { tier = z; break; }
  if (tier < 0) { a.idleT = 1; return; }
  const zz = f.zones[tier];
  // 바구니에서 꺼낼 수 있으면 꺼내기
  if (zz.m[0] && !zz.m[1] && zz.buf[0] > 0) return goTo(sim, p, 'take', { z: tier, i: 0 }, pt('tank' + tier));
  if (zz.m[1] && !zz.m[2] && zz.buf[1] > 0) return goTo(sim, p, 'take', { z: tier, i: 1 }, pt('acut' + tier));
  if (zz.m[0]) { // 자동 뜰채가 있으면 잠깐 기다렸다 줍기 (사람이 직접 건지지 않음)
    if (!zz.m[1]) return goTo(sim, p, 'wait', { z: tier, i: 0 }, pt('tank' + tier));
  }
  goTo(sim, p, 'tank', { z: tier }, pt('tank' + tier));
}

function choosePad(sim, p, f, P) {
  const pads = activePads(sim.padState(f)).filter((x) => x.price <= f.money);
  if (!pads.length || Math.random() > P.shop) return null;
  const score = (x) => {
    const k = x.pad.kind;
    if (k === 'unlock') return 100 - x.pad.z;
    if (k === 'mach') return (x.up ? 40 : 70) - x.pad.z * 2 - x.pad.i;
    if (k === 'upg') return 60;
    if (k === 'deco') return p.diff >= 2 ? -1 : 5;
    return 0;
  };
  const list = pads.map((x) => ({ x, s: score(x) })).filter((v) => v.s > 0).sort((a, b) => b.s - a.s);
  if (!list.length) return null;
  // 너무 비싼 업그레이드로 돈을 다 쓰지 않게
  const best = list[0].x;
  if (best.up && best.price > f.money * 0.7) return null;
  return best;
}

function arrive(sim, p, a, P) {
  const t = a.task;
  a.arrived = false;
  switch (t.kind) {
    case 'tank': case 'cut': case 'pack': case 'fix': case 'unhack': case 'take': case 'send':
      a.workT = WORK[t.kind] * P.work * rand(0.85, 1.2);
      return;
    case 'wait': {
      const zz = sim.fp(p).zones[t.z];
      if (zz.buf[0] > 0) { sim.handle(p.id, { t: 'a', k: 'take', z: t.z, i: 0 }); a.task = null; }
      else { a.idleT = 0.6; a.arrived = true; if (Math.random() < 0.15) a.task = null; }
      return;
    }
    case 'pad': sim.handle(p.id, { t: 'buy', k: 'pad', id: t.id }); a.task = null; a.shopCd = rand(3, 7); tryPc(sim, p); return;
    case 'cat': a.task = null; a.idleT = 0.3; return;
    case 'pc': shopPc(sim, p); a.task = null; return;
  }
  a.task = null;
}

function finishWork(sim, p, a, P) {
  const t = a.task;
  a.task = null;
  if (!t) return;
  if (t.kind === 'fix' || t.kind === 'unhack') { sim.handle(p.id, { t: 'a', k: t.kind, z: t.z }); return; }
  if (t.kind === 'take' || t.kind === 'send') { sim.handle(p.id, { t: 'a', k: t.kind, z: t.z, i: t.i }); return; }
  if (Math.random() > P.succ) { sim.handle(p.id, { t: 'a', k: 'fail' }); return; }
  const g = Math.random() < P.perfect ? 2 : Math.random() < 0.6 ? 1 : 0;
  if (t.kind === 'tank') sim.handle(p.id, { t: 'a', k: 'catch', z: t.z, g });
  else sim.handle(p.id, { t: 'a', k: t.kind, g });
}

// 컴퓨터: 장난감 · 방해 (가끔)
function tryPc(sim, p) {
  const f = sim.fp(p);
  if (sim.mode === 'vs' && p.diff >= 1 && f.money > 2500 && Math.random() < 0.35) goTo(sim, p, 'pc', {}, pt('pc'));
}
function shopPc(sim, p) {
  const f = sim.fp(p);
  if (!sim.coop) {
    const want = TOYS.filter((t) => !p.owned.includes(t.id) && t.price > 0 && f.money > t.price * 3);
    if (want.length && p.diff >= 1) sim.handle(p.id, { t: 'buy', k: 'toy', id: want[0].id });
  }
  if (sim.mode === 'vs' && p.diff >= 1) {
    const others = [...sim.players.values()].filter((q) => q !== p && !q.fired && !q.left && q.immune <= 0);
    if (!others.length) return;
    let target = null, mul = 3;
    if (p.diff === 2) {
      const leader = [...sim.players.values()].filter((q) => !q.fired).sort((x, y) => sim.factories[y.fi].earned - sim.factories[x.fi].earned)[0];
      if (leader && leader !== p && leader.immune <= 0) { target = leader; mul = 2; }
    } else if (Math.random() < 0.3) target = pick(others);
    if (!target) return;
    const opts = SABS.filter((s) => f.money > s.price * mul);
    if (opts.length) sim.handle(p.id, { t: 'buy', k: 'sab', s: pick(opts).id, target: target.id });
  }
}

export function botMove(sim, p, dt) {
  const a = p.ai;
  p.mv = 0;
  if (!a || !a.path || !sim.canAct(p) || p.toy) return;
  const f = sim.fp(p);
  const P = PARAM[p.diff] || PARAM[1];
  const wp = a.path[0];
  const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy);
  const sp = SPEED * P.speed * (p.hold ? HOLD_SPEED : 1) * (p.hack > 0 ? 0.6 : 1) * (f.slip > 0 ? 0.75 : 1) * (sim.evOn(f, 'blackout') ? 0.8 : 1) * dt;
  if (d <= Math.max(2, sp)) {
    p.x = wp.x; p.y = wp.y;
    a.path.shift();
    if (!a.path.length) { a.path = null; a.arrived = true; }
    return;
  }
  moveWithCollision(f.solid, p, dx / d * sp, dy / d * sp);
  p.mv = 1;
  if (Math.abs(dx) > 1) p.dir = dx > 0 ? 1 : -1;
  a.stuckT += dt;
  if (a.stuckT > 1) {
    const nd = Math.hypot(wp.x - p.x, wp.y - p.y);
    if (nd > a.lastD - 4) { const t = a.task; a.path = null; if (t) goTo(sim, p, t.kind, t, t.pt); }
    a.lastD = nd; a.stuckT = 0;
  }
}
