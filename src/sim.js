// ===== 호스트 시뮬레이션 (방장 기기에서만 실행) =====
import {
  TILE, FISH, UNLOCK, autoRate, fishValue, upCost, MAX_LV, TOYS, SABS, SAB_IMMUNE, STRESS_PER_SEC,
  CCTV_WINDOW, CCTV_WINDOW_CONSOLE, PILLOW_WAKE, COOP_TARGET, DAY_NAMES, DAY_LEN,
  STATIONS, STATION_BY_ID, SPAWN, CAT_DOOR, buildSolid, stationPoint, FACE,
} from './data.js';
import { rand, randi, pick, clamp, distToStation, fmt } from './util.js';
import { botThink, botMove } from './bots.js';

const NEAR = 30; // 상호작용 허용 거리(여유 포함)
const toyById = (id) => TOYS.find((t) => t.id === id);

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
    this.nextId = 1;
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
        fired: false, firedAt: 0, out: 0, emote: -1, emoteT: 0, earned: 0,
        stats: { orders: 0, fish: 0, sabSent: 0, sabRecv: 0, caught: 0 }, ev: [], ai: null, left: false,
      };
      this.players.set(p.id, p);
      this.factories[fi].pids.push(p.id);
      if (this.factories[fi].owner == null) this.factories[fi].owner = p.id;
    });
    if (this.coop) this.startDay(1);
  }

  makeFactory(i) {
    const f = {
      i, owner: null, pids: [], money: 0, earned: 0,
      zones: [0, 1, 2, 3, 4].map((z) => ({ u: z === 0, lv: 1, br: false, acc: 0, popT: rand(1, 3) })),
      orders: [], orderT: 3, nextOid: 1, cats: [], nextCat: 1, slip: 0,
      cctv: { next: rand(45, 75), active: false, t: 0, checked: {} },
      ev: [], day: 0, target: 0, dayEarned: 0, solidKey: '', solid: null,
    };
    this.refreshSolid(f);
    return f;
  }

  refreshSolid(f) {
    const key = f.zones.map((z) => (z.u ? 1 : 0)).join('');
    if (key !== f.solidKey) { f.solidKey = key; f.solid = buildSolid(f.zones.map((z) => z.u)); }
  }

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
  humans() { return [...this.players.values()].filter((p) => !p.bot); }
  canAct(p) { return !p.fired && p.out <= 0 && p.faint <= 0 && !p.left; }

  // ---------- 협동 ----------
  coopMult() { return 1 + 0.5 * (this.players.size - 1); }
  targetFor(day) {
    const base = day <= 5 ? COOP_TARGET[day - 1] : COOP_TARGET[4] * Math.pow(1.35, day - 5);
    return Math.round(base * this.coopMult() / 50) * 50;
  }
  dayName(day) { return day <= 5 ? DAY_NAMES[day - 1] : `${day}일차`; }
  startDay(day) {
    const f = this.factories[0];
    f.day = day; f.target = this.targetFor(day); f.dayEarned = 0; f.orders = []; f.orderT = 2;
    this.dayT = DAY_LEN;
    this.timeLeft = DAY_LEN;
    if (day === 5) {
      const top = f.zones.reduce((m, z, i) => (z.u ? i : m), 0);
      const qty = Math.min(10, 3 + 2 * this.players.size);
      f.orders.push({ id: f.nextOid++, t: top, q: qty, d: 0, tl: 150, tt: 150, boss: true });
    }
  }

  // ---------- 메인 틱 ----------
  tick(dt) {
    if (this.phase === 'count') {
      this.countT -= dt;
      if (this.countT <= 0) {
        this.phase = 'play';
        if (this.mode === 'vs') this.sayAll('오늘도 물고기는 넘쳐나고 월급은 모자라다. 일해라, 물범들!');
        else if (this.coop) this.sayAll(`${this.dayName(1)}이다. 목표 실적 ${fmt(this.factories[0].target)}! 다 같이 채워라!`);
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
        this.sayAll(d === 5 ? `금요일이다! 대형 주문이 들어왔다. ${FISH[f.orders[0].t].name} ${f.orders[0].q}마리! 힘을 합쳐라!`
          : `${this.dayName(d)}이다. 목표 실적 ${fmt(f.target)}!`, d === 5 ? FACE.shock : FACE.normal);
      }
      return;
    }
    this.time += dt;
    if (this.mode !== 'tut') this.timeLeft -= dt;

    for (const f of this.factories) this.updateFactory(f, dt);
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    for (const p of this.players.values()) if (p.bot) { botThink(this, p, dt); botMove(this, p, dt); }
    if (this.tut) this.tutorial(dt);

    // 종료 판정
    if (this.mode === 'vs') {
      if (!this.said2 && this.timeLeft <= 120) { this.said2 = true; this.sayAll('마감 2분 전이다! 서둘러라!', FACE.angry); this.ev.push(['bgm', 'rush']); }
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
          this.sayAll(`${this.dayName(f.day)} 목표 달성! 잘했다, 물범들.`, FACE.happy);
        } else this.endCoop(false);
      }
    }
  }

  updateFactory(f, dt) {
    const players = this.playersOf(f);
    // 자동 생산
    f.zones.forEach((z, i) => {
      if (!z.u || z.br || this.catOn(f, i)) return;
      const inc = autoRate(i, z.lv) * dt;
      this.gain(f, inc, null);
      z.acc += inc; z.popT -= dt;
      if (z.popT <= 0) {
        z.popT = 3;
        if (z.acc >= 1) { const m = STATION_BY_ID['mach' + i]; this.fx(f, (m.x + 1) * TILE, m.y * TILE - 2, '+' + fmt(z.acc), '#ffe066'); }
        z.acc = 0;
      }
    });
    // 주문
    for (let k = f.orders.length - 1; k >= 0; k--) {
      const o = f.orders[k];
      o.tl -= dt;
      if (o.tl <= 0) {
        f.orders.splice(k, 1);
        this.sayF(f, `${FISH[o.t].name} 주문을 놓쳤다! 손님이 화났다!`, FACE.angry);
        this.sfxF(f, 'fail');
        for (const p of players) if (!p.fired && p.out <= 0) this.addStress(p, this.coop ? 8 : 15);
      }
    }
    if (this.mode !== 'tut') {
      const maxO = this.coop && f.day >= 3 ? 4 : 3;
      f.orderT -= dt;
      if (f.orders.length < maxO && f.orderT <= 0) {
        const n = this.coop ? this.players.size : 1;
        f.orderT = rand(12, 22) / (1 + 0.4 * (n - 1));
        const un = f.zones.map((z, i) => (z.u ? i : -1)).filter((i) => i >= 0);
        const w = un.map((i) => i + 1); let r = Math.random() * w.reduce((a, b) => a + b, 0), t = un[0];
        for (let j = 0; j < un.length; j++) { r -= w[j]; if (r <= 0) { t = un[j]; break; } }
        const q = this.coop ? randi(1, 2 + Math.floor(n / 2)) : randi(1, 3);
        const tt = 45 + 25 * q + 8 * t + (this.coop ? 10 : 0);
        f.orders.push({ id: f.nextOid++, t, q, d: 0, tl: tt, tt, boss: false });
        this.sayF(f, `${FISH[t].name} ${q}마리 주문 들어왔다! ${Math.round(tt)}초 안에 출하해!`);
        this.sfxF(f, 'order');
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
          this.noteF(f, `🐱 고양이가 ${FISH[c.z].name} 수조를 노린다! 부딪혀서 쫓아내!`);
        } else { c.x += dx / d * sp; c.y += dy / d * sp; c.dir = dx > 0 ? 1 : -1; }
      } else if (c.st === 'eat') {
        c.eatT -= dt;
        if (c.eatT <= 0) {
          c.eatT = 2;
          const amt = Math.min(Math.floor(f.money), Math.round(fishValue(c.z, f.zones[c.z].lv) * 0.5));
          if (amt > 0) { f.money -= amt; this.fx(f, c.x, c.y - 14, '-' + fmt(amt), '#ff6b6b'); this.sfxF(f, 'meow'); }
        }
      }
      if (c.hitCd > 0) c.hitCd -= dt;
    }
    if (f.slip > 0) f.slip = Math.max(0, f.slip - dt);
    // CCTV
    if (this.mode !== 'tut') {
      const cc = f.cctv;
      if (!cc.active) {
        cc.next -= dt;
        if (cc.next <= 0) this.startCctv(f);
      }
    }
    if (f.cctv.active) this.updateCctv(f, dt);
  }

  startCctv(f) {
    const cc = f.cctv;
    cc.active = true; cc.t = 0; cc.checked = {};
    this.sayF(f, '지금부터… CCTV를 확인하겠다.', FACE.angry);
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
        if ((p.toy && p.waking <= 0) || p.waking > 0) {
          const toy = toyById(p.toy);
          p.stats.caught++;
          p.toy = 0; p.waking = 0;
          this.warn(p, `${p.name}! 근무 중에 ${toy ? toy.name : '딴짓'}이라니!`);
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
    if (p.emoteT > 0) { p.emoteT -= dt; if (p.emoteT <= 0) p.emote = -1; }
    if (p.immune > 0) p.immune -= dt;
    if (p.hack > 0) p.hack -= dt;
    if (p.faint > 0) p.faint -= dt;
    if (p.fired || p.left) return;
    if (p.out > 0) {
      p.out -= dt;
      if (p.out <= 0) {
        p.x = SPAWN.x; p.y = SPAWN.y; p.ev.push(['tp', p.x, p.y]);
        this.sayF(this.fp(p), `${p.name}, 다시 일해라. 이번엔 잘해라.`);
      }
      return;
    }
    if (p.waking > 0) { p.waking -= dt; if (p.waking <= 0) { p.waking = 0; p.toy = 0; } }
    if (p.toy && p.waking <= 0) {
      p.stress = Math.max(0, p.stress - toyById(p.toy).rate * dt);
    } else if (p.faint <= 0 && (!this.tut || this.tut.stress)) {
      p.stress += STRESS_PER_SEC * dt;
    }
    if (p.stress >= 100) {
      p.stress = 50; p.faint = 3; p.toy = 0; p.waking = 0;
      p.ev.push(['faint']);
      this.sfxF(this.fp(p), 'faint');
      this.warn(p, `${p.name}! 스트레스로 쓰러지다니, 정신 차려라!`);
    }
    // 봇끼리/플레이어 밀치기 (봇만 호스트가 처리)
    if (p.bot) {
      for (const q of this.playersOf(this.fp(p))) {
        if (q === p || q.fired || q.out > 0) continue;
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
        if (d < 11 && d > 0.01) { p.x += dx / d * (11 - d); p.y += dy / d * (11 - d); }
      }
    }
    // 봇 고양이 부딪히기
    if (p.bot) for (const c of this.fp(p).cats) if (c.st === 'eat' && Math.hypot(c.x - p.x, c.y - p.y) < 14) this.bumpCat(p, c.id);
  }

  addStress(p, v) { p.stress = clamp(p.stress + v, 0, 100); }
  gain(f, v, p) {
    f.money += v; f.earned += v;
    if (this.coop) f.dayEarned += v;
    if (p) p.earned += v;
  }
  catOn(f, z) { return f.cats.some((c) => c.st === 'eat' && c.z === z); }

  warn(p, line) {
    if (p.fired) return;
    p.warn++;
    const f = this.fp(p);
    this.sayF(f, `${line} 경고 ${p.warn}회다!`, FACE.angry);
    p.ev.push(['warn', p.warn]);
    this.sfxF(f, 'stamp');
    if (p.warn >= 3) this.fire(p);
  }
  fire(p) {
    const f = this.fp(p);
    p.hold = null; p.toy = 0; p.waking = 0;
    if (this.coop) {
      p.out = 30; p.warn = 0;
      f.dayEarned -= 1000;
      this.sayAll(`${p.name}… 30초 동안 반성문이나 써라! 팀 실적 -1,000!`, FACE.angry);
      p.ev.push(['fired', 0]);
    } else if (this.mode === 'vs') {
      p.fired = true; p.firedAt = this.time;
      this.sayAll(`${p.name}… 내일부터 안 나와도 된다.`, FACE.angry);
      p.ev.push(['fired', 1]);
      this.ev.push(['sfx', 'stamp']);
    } else {
      p.warn = 0; this.sayP(p, '튜토리얼이니까 봐준다. 경고 초기화!');
    }
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
        p.x = clamp(m.x, 16, 47 * TILE); p.y = clamp(m.y, 16, 29 * TILE); p.dir = m.d > 0 ? 1 : -1; p.mv = m.m ? 1 : 0;
        return;
      }
      case 'emote': if (m.e >= 0 && m.e < 4 && !p.fired) { p.emote = m.e; p.emoteT = 2.5; } return;
      case 'view': if (p.fired && this.factories[m.fi]) p.view = m.fi; return;
      case 'toy': return this.toggleToy(p, m.on, m.id);
      case 'buy': return this.buy(p, m);
      case 'a': break;
      default: return;
    }
    if (this.phase !== 'play' || !this.canAct(p)) return;
    const near = (id) => distToStation(p.x, p.y, STATION_BY_ID[id]) <= NEAR;
    const nearKind = (k) => STATIONS.some((s) => s.kind === k && distToStation(p.x, p.y, s) <= NEAR);
    switch (m.k) {
      case 'catch': {
        const z = m.z | 0; const zz = f.zones[z];
        if (!zz || !zz.u || p.hold || !near('tank' + z) || this.catOn(f, z) || p.toy) return;
        p.hold = { t: z, s: 0 };
        this.sfxP(p, 'splash');
        if (this.tut) this.tut.flag = 'catch';
        return;
      }
      case 'cut': if (p.hold && p.hold.s === 0 && nearKind('cut') && !p.toy) { p.hold.s = 1; this.sfxP(p, 'chop'); if (this.tut) this.tut.flag = 'cut'; } return;
      case 'pack': if (p.hold && p.hold.s === 1 && nearKind('pack') && !p.toy) { p.hold.s = 2; this.sfxP(p, 'box'); if (this.tut) this.tut.flag = 'pack'; } return;
      case 'ship': if (p.hold && p.hold.s === 2 && near('truck') && !p.toy) this.deliver(p, f); return;
      case 'drop': if (p.hold) { p.hold = null; this.sfxP(p, 'drop'); } return;
      case 'fix': {
        const zz = f.zones[m.z | 0];
        if (zz && zz.br && near('mach' + (m.z | 0))) { zz.br = false; this.sayF(f, `${p.name}가 기계를 고쳤다. 좋아!`, FACE.happy); this.sfxF(f, 'fix'); }
        return;
      }
      case 'unhack': if (p.hack > 0 && near('pc')) { p.hack = 0; this.sfxP(p, 'fix'); this.sayP(p, '재부팅 완료. 해커 녀석들…'); } return;
      case 'mop': if (f.slip > 0 && near('mop')) { f.slip = 0; this.sayF(f, '바닥이 깨끗해졌다!', FACE.happy); this.sfxF(f, 'fix'); } return;
      case 'fail': this.addStress(p, 5); this.sfxP(p, 'fail'); return;
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
    else { this.fx(f, c.x, c.y - 12, `${c.hits}/3`, '#fff'); }
  }

  toggleToy(p, on, id) {
    if (on) {
      if (!this.canAct(p) || this.phase !== 'play') return;
      id = id | 0;
      if (!p.owned.includes(id)) id = Math.max(...p.owned);
      p.toy = id; p.waking = 0;
      this.sfxP(p, 'toy');
      if (this.tut) this.tut.flag = 'toy';
    } else {
      if (!p.toy || p.waking > 0) return;
      if (p.toy === 4) p.waking = PILLOW_WAKE; else p.toy = 0;
    }
  }

  deliver(p, f) {
    const t = p.hold.t;
    p.hold = null;
    p.stats.fish++;
    const o = f.orders.filter((o) => o.t === t && o.d < o.q).sort((a, b) => a.tl - b.tl)[0];
    const truck = STATION_BY_ID.truck;
    const tx = (truck.x + 2.5) * TILE, ty = truck.y * TILE;
    if (o) {
      o.d++;
      if (o.d >= o.q) {
        const reward = Math.round(fishValue(t, f.zones[t].lv) * o.q * (o.boss ? 2.5 : 1.5) * (1 + 0.3 * (o.tl / o.tt)));
        this.gain(f, reward, p);
        f.orders.splice(f.orders.indexOf(o), 1);
        p.stats.orders++;
        this.fx(f, tx, ty, '+' + fmt(reward), '#7dff8a');
        this.sfxF(f, 'horn');
        this.sayF(f, o.boss ? '대형 주문 완료! 역시 내 물범들이다!' : pick(['주문 완료! 좋아, 이 맛에 사장 한다.', '출하 완료! 다음 주문 받아라.', '훌륭하다. 월급 루팡은 아니군.']), FACE.happy);
      } else {
        this.fx(f, tx, ty, `${o.d}/${o.q}`, '#fff');
        this.sfxF(f, 'box');
      }
    } else {
      const v = Math.round(fishValue(t, f.zones[t].lv) * 0.6);
      this.gain(f, v, p);
      this.fx(f, tx, ty, '+' + fmt(v), '#ffe066');
      this.sfxF(f, 'coin');
    }
    if (t === 4 && this.mode === 'vs') this.noteAll(`✨ ${p.name}가 황금물고기를 출하했다!`);
    if (this.tut) this.tut.flag = 'ship';
  }

  buy(p, m) {
    if (this.phase !== 'play' || p.fired || p.out > 0) return;
    const f = this.fp(p);
    if (distToStation(p.x, p.y, STATION_BY_ID.pc) > NEAR + 10) return;
    const pay = (c) => { if (f.money < c) { this.sfxP(p, 'fail'); return false; } f.money -= c; return true; };
    if (m.k === 'unlock') {
      const z = m.z | 0;
      if (z < 1 || z > 4 || f.zones[z].u || !f.zones[z - 1].u) return;
      if (!pay(UNLOCK[z])) return;
      f.zones[z].u = true; (f.unlockT = f.unlockT || []).push(this.time);
      this.refreshSolid(f);
      f.ev.push(['unlock', z]);
      this.sfxF(f, 'unlock');
      this.sayF(f, z === 4 ? '황금물고기 구역이 열렸다! 전설의 물고기를 잡아라!' : `${FISH[z].name} 라인이 열렸다. ${z >= 3 ? '비싼 놈이니 떨어뜨리지 마라.' : '열심히 해라.'}`, FACE.happy);
    } else if (m.k === 'up') {
      const z = m.z | 0; const zz = f.zones[z];
      if (!zz || !zz.u || zz.lv >= MAX_LV) return;
      if (!pay(upCost(z, zz.lv))) return;
      zz.lv++;
      this.sfxP(p, 'upgrade');
      if (this.tut) this.tut.flag = 'up';
    } else if (m.k === 'toy') {
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
      if (q.immune > 0) { this.sayP(p, `${q.name}는 아직 방해 면역이다.`); return; }
      if (!pay(s.price)) return;
      this.sabotage(p, q, s);
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
        tf.cats.push({ id: tf.nextCat++, x: CAT_DOOR.x, y: CAT_DOOR.y + k * 12, tx: (t.x + 1 + k * 2) * TILE, ty: (t.y + t.h) * TILE + 6, z, st: 'walk', hits: 0, hitCd: 0, dir: 1, eatT: 0 });
      }
    } else if (s.id === 'slip') tf.slip = 15;
    else if (s.id === 'hack') q.hack = 8;
    else if (s.id === 'break') {
      const top = tf.zones.reduce((m, z, i) => (z.u && !z.br ? i : m), -1);
      if (top >= 0) tf.zones[top].br = true;
    }
    this.addStress(q, 10);
    this.noteF(tf, `${s.icon} ${p.name}님이 ${s.name}을(를) 걸었다!`);
    this.sfxF(tf, 'sabotage');
    this.sayP(p, `${q.name}에게 ${s.name} 성공. …나는 아무것도 못 봤다.`);
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
      rank: rank.map((p, i) => ({ id: p.id, name: p.name, look: p.look, bot: p.bot, rank: i + 1, earned: Math.floor(this.factories[p.fi].earned), fired: p.fired, warn: p.warn, stats: p.stats })),
    };
    const best = rank[0];
    this.sayAll(best ? `이번 달 우수 사원은… ${best.name}!` : '오늘은 다 해고다!', FACE.happy);
  }
  endCoop(cleared) {
    this.phase = 'end';
    const f = this.factories[0];
    const daysCleared = cleared ? f.day : f.day - 1;
    this.result = {
      mode: this.mode, cleared, day: f.day, daysCleared, total: Math.floor(f.earned), dayEarned: Math.floor(f.dayEarned), target: f.target,
      rank: [...this.players.values()].sort((a, b) => b.earned - a.earned).map((p, i) => ({ id: p.id, name: p.name, look: p.look, bot: p.bot, rank: i + 1, earned: Math.floor(p.earned), fired: false, warn: p.warn, stats: p.stats })),
    };
    this.sayAll(cleared ? '금요일까지 버텼다! 너희는 최고의 물범들이다!' : `${this.dayName(f.day)} 목표 실패… 공장 문 닫는다!`, cleared ? FACE.happy : FACE.shock);
  }

  removePlayer(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (this.coop) { p.bot = true; p.diff = 1; p.ai = null; p.name += '(봇)'; this.noteAll(`${p.name}가 나가서 봇이 대신 일한다.`); }
    else { p.left = true; if (!p.fired) { p.fired = true; p.firedAt = this.time; } this.noteAll(`${p.name}님이 퇴근했다.`); }
  }

  // ---------- 튜토리얼 ----------
  tutorial(dt) {
    const T = this.tut, p = [...this.players.values()][0], f = this.factories[0];
    T.t += dt;
    const next = (say, face) => { T.step++; T.t = 0; T.flag = null; if (say) this.sayAll(say, face); };
    switch (T.step) {
      case -1: if (T.t > 0.3) { f.orders.push({ id: f.nextOid++, t: 0, q: 1, d: 0, tl: 9999, tt: 9999, boss: false }); next('어서 와라, 신입 물범. 나는 이 공장의 사장이다. 오늘부터 일을 가르쳐 주마.'); } break;
      case 0: if (T.t > 3.5) next('먼저 왼쪽 위의 멸치 구역으로 가라. 수조 앞에 서 봐라.'); break;
      case 1: if (p.hold || distToStation(p.x, p.y, STATION_BY_ID.tank0) <= NEAR + 10) next('좋아. 행동 버튼(E / 스페이스)을 눌러 멸치를 건져라. 초록 칸에서 멈추면 된다!'); break;
      case 2: if (p.hold) next('잡았군! 이제 아래쪽 손질대로 가서 손질해라. 빨간 점부터 점선을 따라 쭉 그어라.'); break;
      case 3: if (p.hold && p.hold.s >= 1) next('다음은 바로 옆 포장대다. 생선 조각을 상자 칸에 빈틈없이 끌어다 놓아라.'); break;
      case 4: if (p.hold && p.hold.s >= 2) next('포장 완료! 주문이 들어와 있다. 아래쪽 출하 트럭으로 상자를 가져가 출하해라.'); break;
      case 5: if (p.stats.orders >= 1) { f.money = Math.max(f.money, 200); next('첫 주문 완료! 이제 가운데 컴퓨터로 가서 멸치 기계를 업그레이드해 봐라. 자동으로 돈을 벌어준다.'); } break;
      case 6: if (f.zones[0].lv >= 2) { p.stress = 65; T.stress = false; next('일하다 보면 스트레스가 쌓인다. 장난감 버튼(Q / 🏐)으로 놀면 풀린다. 한번 놀아 봐라.'); } break;
      case 7: if (p.toy) next(); break;
      case 8: if (T.t > 2.5) { T.cctvDone = false; this.startCctv(f); next('…방금 그 사이렌 들었나? CCTV 점검이다! 2초 안에 장난감을 내려놔라(다시 누르기)!', FACE.angry); } break;
      case 9: if (T.cctvDone) {
        if (p.warn > 0) { p.warn = 0; T.step = 7; T.t = 0; p.toy = 0; this.sayAll('걸렸잖아! 경고는 3번이면 해고다. 다시 놀아 봐라. 이번엔 빨리 내려놔라.', FACE.angry); }
        else next('잘 피했다. 딴짓은 몰래 하는 거다.', FACE.happy);
      } break;
      case 10: if (T.t > 3) next('경쟁 모드에선 컴퓨터로 다른 공장을 방해할 수도 있다. 튜토리얼 끝! 이제 진짜 일하러 가라.', FACE.happy); break;
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
      if (q.fired && q.id !== pid) continue;
      if (q.left) continue;
      const flags = (q.faint > 0 ? 1 : 0) | (q.out > 0 ? 2 : 0) | (q.fired ? 4 : 0) | (q.hack > 0 ? 8 : 0) | (q.waking > 0 ? 16 : 0);
      ps.push([q.id, Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, q.dir, q.mv, q.hold ? q.hold.t * 3 + q.hold.s + 1 : 0, q.toy, Math.round(q.stress), q.warn, flags, q.emote]);
    }
    const s = {
      ph: this.phase, tl: Math.round(this.timeLeft * 10) / 10, cd: Math.max(0, this.countT),
      f: {
        i: f.i, m: Math.floor(f.money), e: Math.floor(f.earned),
        z: f.zones.map((z, i) => [z.u ? 1 : 0, z.lv, z.br ? 1 : 0, this.catOn(f, i) ? 1 : 0]),
        o: f.orders.map((o) => [o.id, o.t, o.q, o.d, Math.round(o.tl), o.tt, o.boss ? 1 : 0]),
        c: f.cats.map((c) => [c.id, Math.round(c.x), Math.round(c.y), c.st === 'eat' ? 1 : c.st === 'flee' ? 2 : 0, c.dir]),
        sl: Math.round(f.slip * 10) / 10, cc: f.cctv.active ? 1 : 0,
        day: f.day, tg: f.target, de: Math.floor(f.dayEarned),
      },
      p: ps,
      me: {
        st: me.stress, wa: me.warn, hk: me.hack, im: Math.max(0, me.immune), ow: me.owned, toy: me.toy, wk: me.waking,
        fa: me.faint, out: Math.max(0, me.out), fired: me.fired ? 1 : 0, fi: me.fi, view: fi, earned: Math.floor(me.earned),
        x: me.x, y: me.y,
      },
      lb: [...this.players.values()].map((q) => [q.id, Math.floor(this.coop ? q.earned : this.factories[q.fi].earned), q.warn, Math.round(q.stress), q.fired ? 1 : 0, q.fi, q.immune > 0 ? 1 : 0]),
      ev: [...this.ev, ...f.ev, ...me.ev],
    };
    return s;
  }
  clearEvents() {
    this.ev.length = 0;
    for (const f of this.factories) f.ev.length = 0;
    for (const p of this.players.values()) p.ev.length = 0;
  }
}

export { stationPoint };
