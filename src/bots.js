// ===== AI 봇 (호스트에서 실행) =====
import { SPEED, HOLD_SPEED, TILE, STATION_BY_ID, STATIONS, stationPoint, UNLOCK, upCost, autoRate, MAX_LV, TOYS, SABS } from './data.js';
import { findPath, moveWithCollision, rand, pick } from './util.js';

const PARAM = [
  { succ: 0.7, speed: 0.85, react: [1.4, 2.6], stress: 82, work: 1.45 },
  { succ: 0.86, speed: 1, react: [0.7, 1.6], stress: 72, work: 1.15 },
  { succ: 0.95, speed: 1.08, react: [0.25, 0.7], stress: 66, work: 0.9 },
];
const WORK = { tank: 1.6, cut: 2.6, pack: 4.6, fix: 3, unhack: 1.5 };

function ai(p) {
  if (!p.ai) p.ai = { task: null, path: null, arrived: false, workT: 0, react: -1, shopCd: rand(10, 20), stuckT: 0, lastD: 1e9, idleT: 0 };
  return p.ai;
}

function goTo(sim, p, kind, extra, pt) {
  const a = ai(p);
  const f = sim.fp(p);
  const path = findPath(f.solid, p.x, p.y, pt.x, pt.y);
  if (!path) { a.task = null; a.idleT = 0.5; return; }
  a.task = { kind, ...extra, pt };
  a.path = path; a.arrived = false; a.stuckT = 0; a.lastD = 1e9;
}

export function botThink(sim, p, dt) {
  const a = ai(p);
  const P = PARAM[p.diff] || PARAM[1];
  if (sim.phase !== 'play' || !sim.canAct(p)) { a.path = null; a.task = null; a.workT = 0; return; }
  const f = sim.fp(p);
  if (a.shopCd > 0) a.shopCd -= dt;

  // CCTV 반응
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

  // 작업 중
  if (a.workT > 0) {
    a.workT -= dt;
    if (a.workT <= 0) finishWork(sim, p, a, P);
    return;
  }
  if (a.path) return;
  if (a.idleT > 0) { a.idleT -= dt; return; }
  if (a.arrived && a.task) { arrive(sim, p, a, P); return; }

  // 새 작업 고르기
  if (p.stress > P.stress && !f.cctv.active) {
    sim.handle(p.id, { t: 'toy', on: true, id: Math.max(...p.owned) });
    return;
  }
  const broken = f.zones.findIndex((z) => z.u && z.br);
  if (broken >= 0) return goTo(sim, p, 'fix', { z: broken }, pt('mach' + broken));
  if (p.hack > 3 && p.diff >= 1) return goTo(sim, p, 'unhack', {}, pt('pc'));
  const cat = f.cats.find((c) => c.st === 'eat');
  if (cat && !p.hold) return goTo(sim, p, 'cat', { id: cat.id }, { x: cat.x + rand(-4, 4), y: cat.y + 2 });
  if (a.shopCd <= 0 && !p.hold && wantShop(sim, p, f)) return goTo(sim, p, 'pc', {}, pt('pc'));
  if (p.hold) {
    if (p.hold.s === 0) return goTo(sim, p, 'cut', {}, pt(nearest(p, ['cut0', 'cut1', 'cut2'])));
    if (p.hold.s === 1) return goTo(sim, p, 'pack', {}, pt(nearest(p, ['pack0', 'pack1', 'pack2'])));
    return goTo(sim, p, 'ship', {}, pt('truck'));
  }
  let tier = -1;
  const need = f.orders.filter((o) => o.d < o.q && f.zones[o.t].u && !sim.catOn(f, o.t)).sort((x, y) => y.t - x.t || x.tl - y.tl);
  if (need.length) tier = Math.random() < 0.75 ? need[0].t : pick(need).t;
  else for (let z = 4; z >= 0; z--) if (f.zones[z].u && !sim.catOn(f, z)) { tier = z; break; }
  if (tier < 0) { a.idleT = 1; return; }
  goTo(sim, p, 'tank', { z: tier }, pt('tank' + tier, true));
}

function nearest(p, ids) {
  let best = ids[0], bd = 1e9;
  for (const id of ids) { const q = stationPoint(STATION_BY_ID[id]); const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); if (d < bd) { bd = d; best = id; } }
  return best;
}

function pt(id, jitter) {
  const s = STATION_BY_ID[id];
  const q = stationPoint(s);
  if (jitter) { const horiz = Math.abs(q.y - (s.y + s.h / 2) * TILE) > Math.abs(q.x - (s.x + s.w / 2) * TILE); if (horiz) q.x += rand(-s.w * 4, s.w * 4); else q.y += rand(-s.h * 4, s.h * 4); }
  return q;
}

function wantShop(sim, p, f) {
  const next = f.zones.findIndex((z) => !z.u);
  if (next > 0 && f.money >= UNLOCK[next]) return true;
  for (let z = 0; z < 5; z++) if (f.zones[z].u && f.zones[z].lv < MAX_LV && upCost(z, f.zones[z].lv) <= f.money * 0.6) return true;
  if (sim.mode === 'vs' && p.diff >= 1 && f.money > 2500) return true;
  return false;
}

function arrive(sim, p, a, P) {
  const t = a.task;
  a.arrived = false;
  switch (t.kind) {
    case 'tank': case 'cut': case 'pack': case 'fix': case 'unhack':
      a.workT = WORK[t.kind] * P.work * rand(0.85, 1.2);
      return;
    case 'ship': sim.handle(p.id, { t: 'a', k: 'ship' }); a.task = null; return;
    case 'cat': a.task = null; a.idleT = 0.3; return;
    case 'pc': shop(sim, p); a.task = null; a.shopCd = rand(12, 22); return;
  }
  a.task = null;
}

function finishWork(sim, p, a, P) {
  const t = a.task;
  a.task = null;
  if (!t) return;
  if (t.kind === 'fix' || t.kind === 'unhack') { sim.handle(p.id, { t: 'a', k: t.kind, z: t.z }); return; }
  if (Math.random() > P.succ) { sim.handle(p.id, { t: 'a', k: 'fail' }); return; }
  if (t.kind === 'tank') sim.handle(p.id, { t: 'a', k: 'catch', z: t.z });
  else sim.handle(p.id, { t: 'a', k: t.kind });
}

function shop(sim, p) {
  const f = sim.fp(p);
  const next = f.zones.findIndex((z) => !z.u);
  if (next > 0 && f.money >= UNLOCK[next]) sim.handle(p.id, { t: 'buy', k: 'unlock', z: next });
  for (let k = 0; k < 6; k++) {
    let best = -1, bv = 0;
    for (let z = 0; z < 5; z++) {
      const zz = f.zones[z];
      if (!zz.u || zz.lv >= MAX_LV) continue;
      const c = upCost(z, zz.lv), v = (autoRate(z, zz.lv + 1) - autoRate(z, zz.lv)) / c;
      if (v > bv) { bv = v; best = z; }
    }
    if (best < 0) break;
    // 다음 구역 해금을 위해 조금 아껴둠
    const reserve = next > 0 ? UNLOCK[next] * 0.35 : 0;
    if (upCost(best, f.zones[best].lv) > f.money - reserve) break;
    sim.handle(p.id, { t: 'buy', k: 'up', z: best });
  }
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
  const sp = SPEED * P.speed * (p.hold ? HOLD_SPEED : 1) * (p.hack > 0 ? 0.6 : 1) * (f.slip > 0 ? 0.75 : 1) * dt;
  if (d <= Math.max(2, sp)) {
    p.x = wp.x; p.y = wp.y;
    a.path.shift();
    if (!a.path.length) { a.path = null; a.arrived = true; }
    return;
  }
  moveWithCollision(f.solid, p, dx / d * sp, dy / d * sp);
  p.mv = 1;
  if (Math.abs(dx) > 1) p.dir = dx > 0 ? 1 : -1;
  // 끼임 감지
  a.stuckT += dt;
  if (a.stuckT > 1) {
    const nd = Math.hypot(wp.x - p.x, wp.y - p.y);
    if (nd > a.lastD - 4) { const t = a.task; a.path = null; if (t) goTo(sim, p, t.kind, t, t.pt); }
    a.lastD = nd; a.stuckT = 0;
  }
}

export { STATIONS };
