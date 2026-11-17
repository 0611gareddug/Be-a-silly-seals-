// ===== 호스트 시뮬레이션 (방장 기기에서만 실행) =====
import {
  TILE, FISH, UNLOCK, TOYS, SABS, SAB_IMMUNE, STRESS_PER_SEC,
  CCTV_WINDOW, CCTV_WINDOW_CONSOLE, PILLOW_WAKE, COOP_TARGET, DAY_NAMES, DAY_LEN,
  STATIONS, STATION_BY_ID, SPAWN, CAT_DOOR, buildSolid, stationPoint, FACE, MAP_W, MAP_H,
  MACHS, machCycle, BASKET, UPGRADERS, DECOS, SELL_RATE, GRADE_MULT, COMBO_STEP, COMBO_MAX, BELT_SPEED,
  EVENTS, PAD_BY_ID, activePads, BELT_INLETS, UPG_X, CX, CY,
} from './data.js';
import { rand, randi, pick, clamp, distToStation, fmt } from './util.js';
import { botThink, botMove } from './bots.js';
import { line } from './lines.js';

const NEAR = 30; // 상호작용 허용 거리(여유 포함)
const toyById = (id) => TOYS.find((t) => t.id === id);
const gm = (g) => GRADE_MULT[clamp(g | 0, 0, 2)];

export class Sim {
  constructor(cfg) {
    this.mode = cfg.mode; // 'vs' | 'coop' | 'inf' | 'tut'
    this.coop = cfg.mode === 'coop' || cfg.mode === 'inf';
    this.total = (cfg.minutes || 12) * 60;
    this.timeLeft = this.total;
    this.time = 0;
    this.phase = 'count';
    this.countT = cfg.mode === 'tut' ? 0.5 : 3.5;
    this.ev = [];
    this.players = new Map();
    this.factories = [];
    this.result = null;
    this.tut = cfg.mode === 'tut' ? { step: -1, t: 0 } : null;

    const list = cfg.players;
    const nf = this.coop || this.mode === 'tut' ? 1 : list.length;
    for (let i = 0; i < nf; i++) this.factories.push(this.makeFactory(i));
    list.forEach((pl, idx) => {
      const fi = nf === 1 ? 0 : idx;
      const p = {
        id: pl.id, name: pl.name, look: pl.look, bot: !!pl.bot, diff: pl.diff ?? 1, fi, view: fi,
        x: SPAWN.x + (idx % 4) * 18 - 27, y: SPAWN.y + Math.floor(idx / 4) * 16, dir: 1, mv: 0,
        hold: null, toy: 0, owned: [1], waking: 0, stress: 0, warn: 0, faint: 0, hack: 0, immune: 0,
        fired: false, firedAt: 0, out: 0, emote: -1, emoteT: 0, earned: 0, combo: 0,
        stats: { orders: 0, fish: 0, sabSent: 0, sabRecv: 0, caught: 0, perfect: 0, built: 0 }, ev: [], ai: null, left: false,
      };
      this.players.set(p.id, p);
      this.factories[fi].pids.push(p.id);
      if (this.factories[fi].owner == null) this.factories[fi].owner = p.id;
    });
    if (this.coop) this.startDay(1);
  }

  makeFactory(i) {
    return {
      i, owner: null, pids: [], money: 0, earned: 0,
      zones: [0, 1, 2, 3, 4].map((z) => ({ u: z === 0, br: false, m: [0, 0, 0, 0], buf: [0, 0, 0], prog: [0, 0, 0] })),
      belt: [], nextItem: 1, upg: [0, 0, 0], deco: [0, 0, 0, 0, 0],
      orders: [], orderT: 3, nextOid: 1, cats: [], nextCat: 1, slip: 0,
      cctv: { next: rand(45, 75), active: false, t: 0, checked: {} },
      evt: null, evtNext: rand(55, 75),
      ev: [], day: 0, target: 0, dayEarned: 0, solid: buildSolid(), shipped: 0, missStreak: 0,
    };
  }
  padState(f) { return { z: f.zones.map((z) => ({ u: z.u, m: z.m })), up: f.upg, deco: f.deco }; }

  // ---------- 이벤트 ----------
  sayAll(txt, face = FACE.normal) { this.ev.push(['say', txt, face]); }
  sayF(f, txt, face = FACE.normal) { f.ev.push(['say', txt, face]); }
  sayP(p, txt, face = FACE.normal) { p.ev.push(['say', txt, face]); }
  fx(f, x, y, txt, color) { f.ev.push(['fx', Math.round(x), Math.round(y), txt, color]); }
  sfxF(f, k) { f.ev.push(['sfx', k]); }
  sfxP(p, k) { p.ev.push(['sfx', k]); }
  noteF(f, txt) { f.ev.push(['note', txt]); }
  noteAll(txt) { this.ev.push(['note', txt]); }

  fp(p) { return this.factories[p.fi]; }
  playersOf(f) { return f.pids.map((id) => this.players.get(id)).filter(Boolean); }
  canAct(p) { return !p.fired && p.out <= 0 && p.faint <= 0 && !p.left; }
  evOn(f, id) { return f.evt && f.evt.id === id && f.evt.t > 0; }

  // ---------- 협동 ----------
  // 인원이 많을수록 자동화가 빨라져서 뒤로 갈수록 보정이 커짐
  coopMult(day) { return 1 + (this.players.size - 1) * (0.45 + 0.35 * (Math.min(day, 5) - 1)); }
  targetFor(day) {
    const base = day <= 5 ? COOP_TARGET[day - 1] : COOP_TARGET[4] * Math.pow(1.35, day - 5);
    return Math.round(base * this.coopMult(day) / 50) * 50;
  }
  dayName(day) { return day <= 5 ? DAY_NAMES[day - 1] : `${day}일차`; }
  startDay(day) {
    const f = this.factories[0];
    f.day = day; f.target = this.targetFor(day); f.dayEarned = 0; f.orders = []; f.orderT = 2;
    this.timeLeft = DAY_LEN;
    if (day === 5) {
      const top = f.zones.reduce((m, z, i) => (z.u ? i : m), 0);
      const qty = Math.min(10, 3 + 2 * this.players.size);
      f.orders.push({ id: f.nextOid++, t: top, q: qty, d: 0, tl: 150, tt: 150, boss: true, val: 0 });
    }
  }

  // ---------- 메인 틱 ----------
  tick(dt) {
    if (this.phase === 'count') {
      this.countT -= dt;
      if (this.countT <= 0) {
        this.phase = 'play';
        if (this.mode === 'vs') this.sayAll(line('start'), FACE.happy);
        else if (this.coop) this.sayAll(line('coopStart', { d: this.dayName(1), m: fmt(this.factories[0].target) }), FACE.happy);
        this.ev.push(['sfx', 'start']);
      }
      return;
    }
    if (this.phase === 'end') return;
    if (this.phase === 'dayend') {
      this.dayEndT -= dt;
      if (this.dayEndT <= 0) {
        this.phase = 'play';
        const f = this.factories[0];
        this.startDay(f.day + 1);
        const d = f.day;
        this.sayAll(d === 5 ? line('friday', { f: FISH[f.orders[0].t].name, q: f.orders[0].q })
          : line('coopStart', { d: this.dayName(d), m: fmt(f.target) }), d === 5 ? FACE.shock : FACE.happy);
      }
      return;
    }
    this.time += dt;
    if (this.mode !== 'tut') this.timeLeft -= dt;

    for (const f of this.factories) this.updateFactory(f, dt);
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    for (const p of this.players.values()) if (p.bot) { botThink(this, p, dt); botMove(this, p, dt); }
    if (this.tut) this.tutorial(dt);

    if (this.mode === 'vs') {
      if (!this.said2 && this.timeLeft <= 120) { this.said2 = true; this.sayAll(line('rush'), FACE.shock); this.ev.push(['bgm', 'rush']); }
      const alive = [...this.players.values()].filter((p) => !p.fired);
      if (this.timeLeft <= 0 || alive.length === 0 || (this.players.size > 1 && alive.length <= 1)) this.endVs();
    } else if (this.coop) {
      const f = this.factories[0];
      if (!this.said2 && this.timeLeft <= 45) { this.said2 = true; this.ev.push(['bgm', 'rush']); }
      if (this.timeLeft <= 0) {
        this.said2 = false;
        if (f.dayEarned >= f.target) {
          if (f.day === 5 && this.mode === 'coop') return this.endCoop(true);
          this.phase = 'dayend'; this.dayEndT = 5;
          this.ev.push(['day', f.day, 1, Math.floor(f.dayEarned), f.target]);
          this.ev.push(['bgm', 'factory']);
          this.sayAll(line('dayClear', { d: this.dayName(f.day) }), FACE.happy);
        } else this.endCoop(false);
      }
    }
  }

  updateFactory(f, dt) {
    const players = this.playersOf(f);
    const dark = this.evOn(f, 'blackout');
    // 자동화 라인
    if (!dark) f.zones.forEach((zz, z) => {
      if (!zz.u || zz.br || this.catOn(f, z)) return;
      for (let i = 0; i < 3; i++) {
        const lv = zz.m[i]; if (!lv) break;
        const last = i === 2 || !zz.m[i + 1];
        const hasIn = i === 0 || zz.buf[i - 1] > 0;
        const toBelt = i === 2 && zz.m[3];
        const space = toBelt || zz.buf[i] < BASKET;
        if (!hasIn || !space) continue;
        zz.prog[i] += dt / machCycle(z, i, lv);
        if (zz.prog[i] >= 1) {
          zz.prog[i] = 0;
          if (i > 0) zz.buf[i - 1]--;
          if (toBelt) this.beltAdd(f, z, z, 1, null, true);
          else zz.buf[i]++;
          if (last && !toBelt && zz.buf[i] === BASKET) f.ev.push(['full', z, i]);
        }
      }
    });
    // 출하 벨트
    if (!dark) for (let k = f.belt.length - 1; k >= 0; k--) {
      const it = f.belt[k];
      const B = BELT_INLETS[it.inl];
      it.d += BELT_SPEED * dt;
      for (let u = 0; u < 3; u++) {
        if (!it.u[u] && it.d >= B.upg[u]) {
          it.u[u] = 1;
          if (f.upg[u]) { it.mult *= UPGRADERS[u].mult; if (!it.auto || Math.random() < 0.25) this.fx(f, UPG_X[u], CY * TILE - 14, '×' + UPGRADERS[u].mult, '#9ff'); }
        }
      }
      if (it.d >= B.len) { f.belt.splice(k, 1); this.deliver(f, it); }
    }
    // 주문
    for (let k = f.orders.length - 1; k >= 0; k--) {
      const o = f.orders[k];
      o.tl -= dt;
      if (o.tl <= 0) {
        f.orders.splice(k, 1);
        f.missStreak++;
        for (const q of players) q.streak = 0;
        if (f.missStreak >= 2 && f.missStreak % 2 === 0) this.sayF(f, line('nagMiss'), FACE.shock);
        else this.sayF(f, line('orderMiss', { f: FISH[o.t].name }), FACE.shock);
        this.sfxF(f, 'fail');
        for (const p of players) if (!p.fired && p.out <= 0) this.addStress(p, this.coop ? 6 : 10);
      }
    }
    if (this.mode !== 'tut') {
      const maxO = this.coop && f.day >= 3 ? 4 : 3;
      f.orderT -= dt;
      if (f.orders.length < maxO && f.orderT <= 0) {
        const n = this.coop ? this.players.size : 1;
        f.orderT = rand(12, 22) / (1 + 0.4 * (n - 1));
        this.newOrder(f, false);
      }
      // 돌발 이벤트
      if (f.evt) { f.evt.t -= dt; if (f.evt.t <= 0) { f.ev.push(['event', '', 0]); f.evt = null; } }
      else {
        f.evtNext -= dt;
        if (f.evtNext <= 0 && this.phase === 'play') { f.evtNext = rand(70, 110); this.startEvent(f); }
      }
    }
    // 고양이
    for (let k = f.cats.length - 1; k >= 0; k--) {
      const c = f.cats[k];
      if (c.st === 'walk' || c.st === 'flee') {
        const tx = c.st === 'flee' ? CAT_DOOR.x : c.tx, ty = c.st === 'flee' ? CAT_DOOR.y : c.ty;
        const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), sp = (c.st === 'flee' ? 110 : 45) * dt;
        if (d <= sp) {
          c.x = tx; c.y = ty;
          if (c.st === 'flee') { f.cats.splice(k, 1); continue; }
          c.st = 'eat'; c.eatT = 1.5;
          this.noteF(f, line('catNote', { f: FISH[c.z].name }));
        } else { c.x += dx / d * sp; c.y += dy / d * sp; c.dir = dx > 0 ? 1 : -1; }
      } else if (c.st === 'eat') {
        c.eatT -= dt;
        if (c.eatT <= 0) {
          c.eatT = 2;
          const zz = f.zones[c.z];
          if (zz.buf[0] > 0) { zz.buf[0]--; this.fx(f, c.x, c.y - 14, '냠!', '#ff6b6b'); this.sfxF(f, 'meow'); }
          else {
            const amt = Math.min(Math.floor(f.money), Math.round(FISH[c.z].price * 0.5));
            if (amt > 0) { f.money -= amt; this.fx(f, c.x, c.y - 14, '-' + fmt(amt), '#ff6b6b'); this.sfxF(f, 'meow'); }
          }
        }
      }
      if (c.hitCd > 0) c.hitCd -= dt;
    }
    if (f.slip > 0) f.slip = Math.max(0, f.slip - dt);
    if (this.mode !== 'tut' && !f.cctv.active) { f.cctv.next -= dt; if (f.cctv.next <= 0) this.startCctv(f); }
    if (f.cctv.active) this.updateCctv(f, dt);
  }

  newOrder(f, rush, vip) {
    const n = this.coop ? this.players.size : 1;
    const un = f.zones.map((z, i) => (z.u ? i : -1)).filter((i) => i >= 0);
    let t;
    if (vip) t = un[un.length - 1];
    else {
      const w = un.map((i) => i + 1); let r = Math.random() * w.reduce((a, b) => a + b, 0); t = un[0];
      for (let j = 0; j < un.length; j++) { r -= w[j]; if (r <= 0) { t = un[j]; break; } }
    }
    const q = vip ? (n >= 3 ? 2 : 1) : this.coop ? randi(1, 2 + Math.floor(n / 2)) : randi(1, 3);
    const tt = vip ? 55 + 10 * q : 45 + 25 * q + 8 * t + (this.coop ? 10 : 0);
    f.orders.push({ id: f.nextOid++, t, q, d: 0, tl: tt, tt, boss: false, rush: !!rush, vip: !!vip, val: 0 });
    if (!rush && !vip) this.sayF(f, line('order', { f: FISH[t].name, q, s: Math.round(tt) }));
    this.sfxF(f, 'order');
  }

  startEvent(f) {
    const pool = EVENTS.filter((e) => !(e.id === 'patrol' && this.coop && this.players.size === 1));
    const e = pick(pool);
    f.evt = { id: e.id, t: e.dur || 6 };
    f.ev.push(['event', e.id, f.evt.t]);
    this.sfxF(f, 'event');
    if (e.id === 'gold') this.sayF(f, line('evGold'), FACE.happy);
    if (e.id === 'rush') { this.sayF(f, line('evRush'), FACE.shock); for (let i = 0; i < 3; i++) this.newOrder(f, true); }
    if (e.id === 'blackout') this.sayF(f, line('evBlackout'), FACE.shock);
    if (e.id === 'vip') { this.sayF(f, line('evVip'), FACE.happy); this.newOrder(f, false, true); }
    if (e.id === 'patrol') { this.sayF(f, line('evPatrol'), FACE.angry); if (!f.cctv.active) this.startCctv(f, true); }
  }

  startCctv(f, quiet) {
    const cc = f.cctv;
    cc.active = true; cc.t = 0; cc.checked = {};
    if (!quiet) this.sayF(f, line('cctv'), FACE.angry);
    f.ev.push(['cctv', 1]);
    this.sfxF(f, 'siren');
  }
  updateCctv(f, dt) {
    const cc = f.cctv;
    cc.t += dt;
    for (const p of this.playersOf(f)) {
      if (cc.checked[p.id] || p.fired || p.out > 0) continue;
      const win = p.toy === 3 ? CCTV_WINDOW_CONSOLE : CCTV_WINDOW;
      if (cc.t >= win) {
        cc.checked[p.id] = 1;
        if (p.toy || p.waking > 0) {
          const toy = toyById(p.toy);
          p.stats.caught++;
          p.toy = 0; p.waking = 0;
          this.warn(p, line('warnToy', { n: p.name, t: toy ? toy.name : '딴짓' }));
          p.ev.push(['cctv', 3]);
        } else p.ev.push(['cctv', 2]);
      }
    }
    if (cc.t >= CCTV_WINDOW + 0.6) {
      cc.active = false;
      cc.next = rand(60, 120);
      f.ev.push(['cctv', 0]);
      if (this.tut) this.tut.cctvDone = true;
    }
  }

  updatePlayer(p, dt) {
    if (!p.bot && !this.tut && this.phase === 'play' && !p.fired && p.out <= 0) {
      p.idleT = (p.idleT || 0) + dt;
      if (p.idleT > 35 && !p.toy) { p.idleT = 0; this.sayP(p, line('nagIdle', { n: p.name }), FACE.shock); }
    }
    if (p.emoteT > 0) { p.emoteT -= dt; if (p.emoteT <= 0) p.emote = -1; }
    if (p.immune > 0) p.immune -= dt;
    if (p.hack > 0) p.hack -= dt;
    if (p.faint > 0) p.faint -= dt;
    if (p.fired || p.left) return;
    if (p.out > 0) {
      p.out -= dt;
      if (p.out <= 0) { p.x = SPAWN.x; p.y = SPAWN.y; p.ev.push(['tp', p.x, p.y]); this.sayF(this.fp(p), line('back', { n: p.name }), FACE.happy); }
      return;
    }
    if (p.waking > 0) { p.waking -= dt; if (p.waking <= 0) { p.waking = 0; p.toy = 0; } }
    if (p.toy && p.waking <= 0) p.stress = Math.max(0, p.stress - toyById(p.toy).rate * dt);
    else if (p.faint <= 0 && (!this.tut || this.tut.stress)) p.stress += STRESS_PER_SEC * dt;
    if (p.stress >= 100) {
      p.stress = 50; p.faint = 3; p.toy = 0; p.waking = 0; p.combo = 0;
      p.ev.push(['faint']);
      this.sfxF(this.fp(p), 'faint');
      this.warn(p, line('warnStress', { n: p.name }));
    }
    if (p.bot) {
      for (const q of this.playersOf(this.fp(p))) {
        if (q === p || q.fired || q.out > 0) continue;
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
        if (d < 11 && d > 0.01) { p.x += dx / d * (11 - d); p.y += dy / d * (11 - d); }
      }
      for (const c of this.fp(p).cats) if (c.st === 'eat' && Math.hypot(c.x - p.x, c.y - p.y) < 14) this.bumpCat(p, c.id);
    }
  }

  addStress(p, v) { p.stress = clamp(p.stress + v, 0, 100); }
  gain(f, v, p) {
    f.money += v; f.earned += v;
    if (this.coop) f.dayEarned += v;
    if (p) p.earned += v;
  }
  catOn(f, z) { return f.cats.some((c) => c.st === 'eat' && c.z === z); }

  warn(p, msg) {
    if (p.fired) return;
    p.warn++;
    const f = this.fp(p);
    this.sayF(f, `${msg} 경고 ${p.warn}회다!`, FACE.angry);
    p.ev.push(['warn', p.warn]);
    this.sfxF(f, 'stamp');
    if (p.warn >= 3) this.fire(p);
  }
  fire(p) {
    const f = this.fp(p);
    p.hold = null; p.toy = 0; p.waking = 0; p.combo = 0;
    if (this.coop) {
      p.out = 30; p.warn = 0; f.dayEarned -= 1000;
      this.sayAll(line('fireCoop', { n: p.name }), FACE.angry);
      p.ev.push(['fired', 0]);
    } else if (this.mode === 'vs') {
      p.fired = true; p.firedAt = this.time;
      this.sayAll(line('fire', { n: p.name }), FACE.angry);
      p.ev.push(['fired', 1]);
      this.ev.push(['sfx', 'stamp']);
    } else { p.warn = 0; this.sayP(p, '튜토리얼이니까 이번만 봐줄게요. 경고 초기화!', FACE.happy); }
  }

  // 판정 → 콤보
  grade(p, g) {
    g = clamp(g | 0, 0, 2);
    if (g === 2) {
      p.combo = Math.min(99, p.combo + 1); p.stats.perfect++;
      p.ev.push(['combo', p.combo]);
      if (p.combo >= 5 && p.combo % 5 === 0) this.sayF(this.fp(p), line('combo', { n: p.name, c: p.combo }), FACE.happy);
    } else { if (p.combo) p.ev.push(['combo', 0]); p.combo = 0; }
    return gm(g);
  }

  beltAdd(f, inl, tier, mult, pid, auto) {
    f.belt.push({ id: f.nextItem++, inl, t: tier, mult, pid, auto, d: 0, u: [0, 0, 0] });
    if (f.belt.length > 90) f.belt.splice(0, f.belt.length - 90);
  }

  // ---------- 입력 처리 ----------
  handle(pid, m) {
    const p = this.players.get(pid);
    if (!p || this.phase === 'end') return;
    const f = this.fp(p);
    switch (m.t) {
      case 'p': {
        if (p.bot || p.fired || p.out > 0) return;
        if (typeof m.x !== 'number' || typeof m.y !== 'number') return;
        if (Math.abs(m.x - p.x) + Math.abs(m.y - p.y) > 2) p.idleT = 0;
        p.x = clamp(m.x, 16, (MAP_W - 1) * TILE); p.y = clamp(m.y, 16, (MAP_H - 1) * TILE); p.dir = m.d > 0 ? 1 : -1; p.mv = m.m ? 1 : 0;
        return;
      }
      case 'work': p.work = typeof m.s === 'string' ? m.s.slice(0, 8) : null; return;
      case 'emote': if (m.e >= 0 && m.e < 4 && !p.fired) { p.emote = m.e; p.emoteT = 2.5; } return;
      case 'view': if (p.fired && this.factories[m.fi]) p.view = m.fi; return;
      case 'toy': return this.toggleToy(p, m.on, m.id);
      case 'buy': return this.buy(p, m);
      case 'a': break;
      default: return;
    }
    if (this.phase !== 'play' || !this.canAct(p)) return;
    p.idleT = 0;
    const near = (id) => distToStation(p.x, p.y, STATION_BY_ID[id]) <= NEAR;
    const nearest = (k) => { let b = null, bd = NEAR; for (const s of STATIONS) if (s.kind === k) { const d = distToStation(p.x, p.y, s); if (d <= bd) { bd = d; b = s; } } return b; };
    const z = m.z | 0, zz = f.zones[z];
    switch (m.k) {
      case 'catch': {
        if (!zz || !zz.u || zz.br || p.hold || !near('tank' + z) || this.catOn(f, z) || p.toy) return;
        p.hold = { t: z, s: 0, q: this.grade(p, m.g) };
        this.sfxP(p, 'splash');
        return;
      }
      case 'take': { // 자동 기계 바구니에서 꺼내기 (날생선 / 손질된 생선)
        const i = m.i | 0;
        if (!zz || !zz.u || p.hold || p.toy || i < 0 || i > 1 || !zz.m[i] || zz.m[i + 1] || zz.buf[i] <= 0) return;
        if (!near(i === 0 ? 'tank' + z : 'acut' + z)) return;
        zz.buf[i]--;
        p.hold = { t: z, s: i, q: 1 };
        this.sfxP(p, 'box');
        return;
      }
      case 'send': { // 자동 포장기 상자를 벨트로
        if (!zz || !zz.m[2] || zz.m[3] || zz.buf[2] <= 0 || !near('apack' + z)) return;
        const n = zz.buf[2]; zz.buf[2] = 0;
        for (let k = 0; k < n; k++) { this.beltAdd(f, z, z, 1, p.id, true); f.belt[f.belt.length - 1].d = -k * 22; }
        this.sfxP(p, 'whoosh');
        return;
      }
      case 'cut': if (p.hold && p.hold.s === 0 && nearest('cut') && !p.toy) { p.hold.s = 1; p.hold.q *= this.grade(p, m.g); this.sfxP(p, 'chop'); } return;
      case 'pack': {
        const st = nearest('pack');
        if (!p.hold || p.hold.s !== 1 || !st || p.toy) return;
        const mult = p.hold.q * this.grade(p, m.g) * (1 + COMBO_STEP * Math.min(p.combo, COMBO_MAX));
        this.beltAdd(f, 5 + (+st.id.slice(4) || 0), p.hold.t, mult, p.id, false);
        p.hold = null; p.stats.fish++;
        this.sfxP(p, 'whoosh');
        if (this.tut) this.tut.flag = 'pack';
        return;
      }
      case 'drop': if (p.hold) { p.hold = null; this.sfxP(p, 'drop'); } return;
      case 'fix': if (zz && zz.br && near('mach' + z)) { zz.br = false; this.sayF(f, line('fixed', { n: p.name }), FACE.happy); this.sfxF(f, 'fix'); } return;
      case 'unhack': if (p.hack > 0 && near('pc')) { p.hack = 0; this.sfxP(p, 'fix'); this.sayP(p, line('unhack'), FACE.happy); } return;
      case 'mop': if (f.slip > 0 && near('mop')) { f.slip = 0; this.sayF(f, line('mopped'), FACE.happy); this.sfxF(f, 'fix'); } return;
      case 'fail': this.addStress(p, 5); if (p.combo) p.ev.push(['combo', 0]); p.combo = 0; this.sfxP(p, 'fail'); return;
      case 'bumpcat': return this.bumpCat(p, m.id);
    }
  }

  bumpCat(p, id) {
    const f = this.fp(p);
    const c = f.cats.find((c) => c.id === id);
    if (!c || c.st === 'flee' || c.hitCd > 0) return;
    if (Math.hypot(c.x - p.x, c.y - p.y) > 30) return;
    c.hits++; c.hitCd = 0.45;
    this.sfxF(f, 'meow');
    if (c.hits >= 3) { c.st = 'flee'; this.fx(f, c.x, c.y - 12, '도망!', '#7cf'); }
    else this.fx(f, c.x, c.y - 12, `${c.hits}/3`, '#fff');
  }

  toggleToy(p, on, id) {
    if (on) {
      if (!this.canAct(p) || this.phase !== 'play') return;
      id = id | 0;
      if (!p.owned.includes(id)) id = Math.max(...p.owned);
      const f = this.fp(p);
      if (this.evOn(f, 'patrol')) { p.stats.caught++; this.warn(p, line('warnPatrol', { n: p.name })); return; }
      p.toy = id; p.waking = 0;
      this.sfxP(p, 'toy');
      if (this.tut) this.tut.flag = 'toy';
    } else {
      if (!p.toy || p.waking > 0) return;
      if (p.toy === 4) p.waking = PILLOW_WAKE; else p.toy = 0;
    }
  }

  deliver(f, it) {
    const p = it.pid ? this.players.get(it.pid) : null;
    const t = it.t;
    let value = FISH[t].price * it.mult * (this.evOn(f, 'gold') ? 2 : 1);
    const truck = STATION_BY_ID.truck;
    const tx = (truck.x + truck.w) * TILE, ty = truck.y * TILE + 8;
    f.shipped++;
    f.ev.push(['ship']);
    const o = f.orders.filter((o) => o.t === t && o.d < o.q).sort((a, b) => (b.vip - a.vip) || (a.tl - b.tl))[0];
    if (o) {
      o.d++; o.val += value;
      if (o.d >= o.q) {
        const reward = Math.round(o.val * (o.vip ? 3 : o.boss ? 2.5 : 1.5) * (o.rush ? 1.3 : 1) * (1 + 0.3 * (o.tl / o.tt)));
        f.orders.splice(f.orders.indexOf(o), 1);
        this.gain(f, reward, p && !it.auto ? p : null);
        if (p) p.stats.orders++;
        this.fx(f, tx, ty - 10, '+' + fmt(reward), '#7dff8a');
        this.sfxF(f, 'horn');
        f.missStreak = 0;
        if (p && !it.auto) {
          p.streak = (p.streak || 0) + 1;
          if (p.streak >= 3 && p.streak % 3 === 0) this.sayF(f, line('streak', { n: p.name }), FACE.happy);
          else this.sayF(f, line(o.boss ? 'bossDone' : 'orderDone'), FACE.happy);
        } else if (o.vip || o.boss) this.sayF(f, line(o.boss ? 'bossDone' : 'orderDone'), FACE.happy);
        if (this.tut) this.tut.flag = 'ship';
      } else this.fx(f, tx, ty, `${o.d}/${o.q}`, '#fff');
    } else {
      const v = Math.round(value * SELL_RATE);
      this.gain(f, v, p && !it.auto ? p : null);
      if (!it.auto || Math.random() < 0.5) this.fx(f, tx, ty, '+' + fmt(v), it.auto ? '#ffe066' : '#fff3a0');
      if (!it.auto) this.sfxF(f, 'coin');
    }
    if (t === 4 && p && !it.auto) { this.sayF(f, line('gold', { n: p.name }), FACE.happy); if (this.mode === 'vs') this.noteAll(`✨ ${p.name}님이 황금물고기를 출하했어요!`); }
  }

  buy(p, m) {
    if (this.phase !== 'play' || p.fired || p.out > 0) return;
    const f = this.fp(p);
    const pay = (c) => { if (f.money < c) { this.sfxP(p, 'fail'); return false; } f.money -= c; return true; };
    if (m.k === 'pad') return this.buyPad(p, f, m.id, pay);
    if (distToStation(p.x, p.y, STATION_BY_ID.pc) > NEAR + 10) return;
    if (m.k === 'toy') {
      const t = toyById(m.id | 0);
      if (!t || p.owned.includes(t.id)) return;
      if (!pay(t.price)) return;
      p.owned.push(t.id);
      this.sfxP(p, 'upgrade');
    } else if (m.k === 'sab') {
      if (this.mode !== 'vs') return;
      const s = SABS.find((s) => s.id === m.s);
      const q = this.players.get(m.target);
      if (!s || !q || q === p || q.fired || q.left) return;
      if (q.immune > 0) { this.sayP(p, line('sabImmune', { n: q.name })); return; }
      if (!pay(s.price)) return;
      this.sabotage(p, q, s);
    }
  }

  buyPad(p, f, id, pay) {
    const pad = PAD_BY_ID[id];
    if (!pad) return;
    const cx = (pad.x + pad.w / 2) * TILE, cy = (pad.y + pad.h / 2) * TILE;
    if (Math.hypot(p.x - cx, p.y - cy) > 28 + pad.w * 8) return;
    const ap = activePads(this.padState(f)).find((a) => a.pad.id === id);
    if (!ap || !pay(ap.price)) return;
    p.stats.built++;
    f.ev.push(['build', id]);
    this.sfxF(f, 'build');
    if (pad.kind === 'unlock') {
      f.zones[pad.z].u = true; (f.unlockT = f.unlockT || []).push(this.time);
      f.ev.push(['unlock', pad.z]);
      this.sfxF(f, 'unlock');
      this.sayF(f, pad.z === 4 ? line('unlockGold') : line('unlock', { f: FISH[pad.z].name }), FACE.happy);
    } else if (pad.kind === 'mach') {
      const zz = f.zones[pad.z];
      if (zz.m[pad.i]) { zz.m[pad.i]++; this.sfxP(p, 'upgrade'); return; }
      zz.m[pad.i] = 1;
      if (pad.i === 3) {
        // 연결 벨트: 바구니에 쌓인 상자도 바로 보내기
        for (let k = 0; k < zz.buf[2]; k++) { this.beltAdd(f, pad.z, pad.z, 1, null, true); f.belt[f.belt.length - 1].d = -k * 22; }
        zz.buf[2] = 0;
        this.sayF(f, line('buildFull', { f: FISH[pad.z].name }), FACE.happy);
      } else {
        // 앞 단계 바구니에 있던 건 다음 기계로 이어짐
        this.sayF(f, line('build', { n: p.name, x: `${FISH[pad.z].name} ${MACHS[pad.i].name}` }), FACE.happy);
      }
      if (this.tut) this.tut.flag = 'build';
    } else if (pad.kind === 'upg') {
      f.upg[pad.i] = 1;
      this.sayF(f, line('upg', { x: UPGRADERS[pad.i].name }), FACE.happy);
    } else if (pad.kind === 'deco') {
      f.deco[pad.i] = 1;
      this.sayF(f, line('deco', { x: DECOS[pad.i].name }), FACE.happy);
    }
  }

  sabotage(p, q, s) {
    const tf = this.fp(q);
    q.immune = SAB_IMMUNE;
    p.stats.sabSent++; q.stats.sabRecv++;
    if (s.id === 'cat') {
      const un = tf.zones.map((z, i) => (z.u ? i : -1)).filter((i) => i >= 0);
      for (let k = 0; k < 2; k++) {
        const z = pick(un), t = STATION_BY_ID['tank' + z];
        tf.cats.push({ id: tf.nextCat++, x: CAT_DOOR.x, y: CAT_DOOR.y + k * 12, tx: stationPoint(t).x + (k ? 14 : -14), ty: stationPoint(t).y, z, st: 'walk', hits: 0, hitCd: 0, dir: 1, eatT: 0 });
      }
    } else if (s.id === 'slip') tf.slip = 15;
    else if (s.id === 'hack') q.hack = 8;
    else if (s.id === 'break') {
      // 자동화가 가장 많이 된 구역(없으면 가장 비싼 구역)의 펌프 고장
      let best = -1, bs = -1;
      tf.zones.forEach((z, i) => { if (!z.u || z.br) return; const sc = z.m.reduce((a, b) => a + b, 0) * 10 + i; if (sc > bs) { bs = sc; best = i; } });
      if (best >= 0) tf.zones[best].br = true;
    }
    this.addStress(q, 10);
    this.noteF(tf, `${s.icon} ${p.name}님이 ${s.name}을(를) 걸었어요!`);
    this.sfxF(tf, 'sabotage');
    this.sayP(p, line('sabOk', { n: q.name }), FACE.happy);
  }

  // ---------- 종료 ----------
  endVs() {
    this.phase = 'end';
    const ps = [...this.players.values()];
    const alive = ps.filter((p) => !p.fired).sort((a, b) => this.factories[b.fi].earned - this.factories[a.fi].earned);
    const dead = ps.filter((p) => p.fired).sort((a, b) => b.firedAt - a.firedAt);
    const rank = [...alive, ...dead];
    this.result = {
      mode: 'vs',
      rank: rank.map((p, i) => ({ id: p.id, name: p.name, look: p.look, bot: p.bot, rank: i + 1, earned: Math.floor(this.factories[p.fi].earned), fired: p.fired, warn: p.warn, stats: p.stats, deco: this.decoScore(this.factories[p.fi]) })),
    };
    const best = rank[0];
    this.sayAll(best && !best.fired ? line('winner', { n: best.name }) : line('allFired'), FACE.happy);
  }
  decoScore(f) { return f.deco.reduce((a, v, i) => a + (v ? DECOS[i].score : 0), 0); }
  endCoop(cleared) {
    this.phase = 'end';
    const f = this.factories[0];
    const daysCleared = cleared ? f.day : f.day - 1;
    this.result = {
      mode: this.mode, cleared, day: f.day, daysCleared, total: Math.floor(f.earned), dayEarned: Math.floor(f.dayEarned), target: f.target,
      rank: [...this.players.values()].sort((a, b) => b.earned - a.earned).map((p, i) => ({ id: p.id, name: p.name, look: p.look, bot: p.bot, rank: i + 1, earned: Math.floor(p.earned), fired: false, warn: p.warn, stats: p.stats })),
    };
    this.sayAll(cleared ? line('coopWin') : line('coopLose', { d: this.dayName(f.day) }), cleared ? FACE.happy : FACE.shock);
  }

  removePlayer(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (this.coop) { p.bot = true; p.diff = 1; p.ai = null; p.name += '(봇)'; this.noteAll(`${p.name}님이 나가서 봇이 대신 일해요.`); }
    else { p.left = true; if (!p.fired) { p.fired = true; p.firedAt = this.time; } this.noteAll(`${p.name}님이 퇴근했어요.`); }
  }

  // ---------- 튜토리얼 ----------
  tutorial(dt) {
    const T = this.tut, p = [...this.players.values()][0], f = this.factories[0];
    T.t += dt;
    const next = (say, face) => { T.step++; T.t = 0; T.flag = null; if (say) this.sayAll(say, face); };
    switch (T.step) {
      case -1: if (T.t > 0.3) { f.orders.push({ id: f.nextOid++, t: 0, q: 1, d: 0, tl: 9999, tt: 9999, boss: false, val: 0 }); next('어서 와요, 신입 물범님! 저는 이 공장 사장이에요. 오늘은 제가 일을 차근차근 알려 줄게요.', FACE.happy); } break;
      case 0: if (T.t > 3.5) next('처음엔 모든 일을 손으로 해요. 위쪽 ① 수조 구역의 멸치 수조로 가 볼까요?'); break;
      case 1: if (p.hold || distToStation(p.x, p.y, STATION_BY_ID.tank0) <= NEAR + 10) next('행동 버튼(E / 스페이스)으로 건져요! 물고기 그림자가 뜰채 안에 들어왔을 때 누르고, 연타로 끌어올려요.'); break;
      case 2: if (p.hold) next('잡았네요! 파란 바닥 화살표를 따라 왼쪽 ② 손질대로 가요. 비늘을 긁고, 점선을 따라 칼질해요.'); break;
      case 3: if (p.hold && p.hold.s >= 1) next('최고예요! 초록 화살표를 따라 아래 ③ 포장대로 가요. 상자에 넣고, 덮고, 테이프 쫙! 도장 쾅! 그리고 벨트로 밀어 넣어요.'); break;
      case 4: if (T.flag === 'pack' || p.stats.orders >= 1) next('상자가 출하 벨트를 타고 가운데 트럭으로 가요. 지켜봐요~'); break;
      case 5: if (p.stats.orders >= 1) { f.money = Math.max(f.money, 400); next('첫 주문 완료! 이제 진짜 타이쿤의 시작이에요. 멸치 수조 아래 바닥의 초록 구매 버튼을 밟아서 자동 뜰채를 사 봐요!', FACE.happy); } break;
      case 6: if (f.zones[0].m[0]) { p.stress = 65; T.stress = false; next('자동 뜰채가 생선을 건져서 바구니에 모아 줘요. 손질기, 포장기, 연결 벨트까지 사면 완전 자동! 그런데… 스트레스가 쌓였네요. 장난감(Q / 🏐)으로 풀어 봐요~'); } break;
      case 7: if (p.toy) next(); break;
      case 8: if (T.t > 2.5) { T.cctvDone = false; this.startCctv(f); next('…그런데 노는 걸 저한테 들키면 안 돼요. 지금 CCTV 점검이다! 2초 안에 장난감을 내려놔!', FACE.angry); } break;
      case 9: if (T.cctvDone) {
        if (p.warn > 0) { p.warn = 0; T.step = 7; T.t = 0; p.toy = 0; this.sayAll('걸렸잖아! 경고 3번이면 해고다. 다시 놀아 보고, 이번엔 빨리 내려놔.', FACE.angry); }
        else next('후후, 잘 피했네요. 딴짓은 몰래 하는 거예요~', FACE.happy);
      } break;
      case 10: if (T.t > 3) next('완벽 판정을 이어 가면 콤보 보너스! 돌발 이벤트도 생겨요. 튜토리얼 끝! 오늘도 화이팅이에요!', FACE.happy); break;
      case 11: if (T.t > 5) { this.phase = 'end'; this.result = { mode: 'tut', cleared: true, rank: [] }; } break;
    }
  }

  // ---------- 스냅샷 ----------
  snapshot(pid) {
    const me = this.players.get(pid);
    if (!me) return null;
    const fi = me.fired ? me.view : me.fi;
    const f = this.factories[fi] || this.factories[me.fi];
    const ps = [];
    for (const q of this.playersOf(f)) {
      if ((q.fired && q.id !== pid) || q.left) continue;
      const flags = (q.faint > 0 ? 1 : 0) | (q.out > 0 ? 2 : 0) | (q.fired ? 4 : 0) | (q.hack > 0 ? 8 : 0) | (q.waking > 0 ? 16 : 0);
      ps.push([q.id, Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, q.dir, q.mv, q.hold ? q.hold.t * 3 + q.hold.s + 1 : 0, q.toy, Math.round(q.stress), q.warn, flags, q.emote]);
    }
    return {
      ph: this.phase, tl: Math.round(this.timeLeft * 10) / 10, cd: Math.max(0, this.countT),
      f: {
        i: f.i, m: Math.floor(f.money), e: Math.floor(f.earned),
        z: f.zones.map((z, i) => [z.u ? 1 : 0, z.br ? 1 : 0, this.catOn(f, i) ? 1 : 0, z.m[0], z.m[1], z.m[2], z.m[3], z.buf[0], z.buf[1], z.buf[2]]),
        o: f.orders.map((o) => [o.id, o.t, o.q, o.d, Math.round(o.tl), o.tt, o.boss ? 1 : o.vip ? 2 : o.rush ? 3 : 0]),
        c: f.cats.map((c) => [c.id, Math.round(c.x), Math.round(c.y), c.st === 'eat' ? 1 : c.st === 'flee' ? 2 : 0, c.dir]),
        b: f.belt.filter((it) => it.d >= 0).map((it) => [it.id, it.inl, Math.round(it.d), it.t, it.auto ? 1 : 0]),
        up: f.upg, dc: f.deco, ev: f.evt ? [f.evt.id, Math.round(f.evt.t)] : 0,
        sl: Math.round(f.slip * 10) / 10, cc: f.cctv.active ? 1 : 0, sh: f.shipped,
        bz: this.playersOf(f).filter((q) => q.work).map((q) => q.work),
        day: f.day, tg: f.target, de: Math.floor(f.dayEarned),
      },
      p: ps,
      me: {
        st: me.stress, wa: me.warn, hk: me.hack, im: Math.max(0, me.immune), ow: me.owned, toy: me.toy, wk: me.waking,
        fa: me.faint, out: Math.max(0, me.out), fired: me.fired ? 1 : 0, fi: me.fi, view: fi, earned: Math.floor(me.earned),
        x: me.x, y: me.y, cb: me.combo,
      },
      lb: [...this.players.values()].map((q) => [q.id, Math.floor(this.coop ? q.earned : this.factories[q.fi].earned), q.warn, Math.round(q.stress), q.fired ? 1 : 0, q.fi, q.immune > 0 ? 1 : 0, this.decoScore(this.factories[q.fi])]),
      ev: [...this.ev, ...f.ev, ...me.ev],
    };
  }
  clearEvents() {
    this.ev.length = 0;
    for (const f of this.factories) f.ev.length = 0;
    for (const p of this.players.values()) p.ev.length = 0;
  }
}

export { stationPoint };
