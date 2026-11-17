// ===== 클라이언트 게임 화면 (렌더링 · 입력 · HUD) =====
import {
  TILE, SPEED, HOLD_SPEED, MAP_W, MAP_H, FISH, STATIONS, STATION_BY_ID, UNLOCK, MAX_LV, TOYS, SABS, MACHS, BASKET, EVENTS, BELT_SPEED, BELT_INLETS,
  buildSolid, EMOTES, DAY_NAMES, GATES, SECTIONS, polar, CX, CY, R_WALK, stationPoint, nearestOf, activePads, COMBO_STEP, COMBO_MAX, UPGRADERS,
} from './data.js';
import { sealSprite, itemSprite, catSprite, bossPortrait, SEAL_SIZE } from './sprites.js';
import { background, drawWorldDynamic, drawStationsDynamic, drawOverhead, updateBelt, gateSignText, drawBelts, drawUpgraders, drawAutomation, drawPads, drawDecos } from './world.js';
import { store } from './util.js';
import { audio } from './audio.js';
import { runMinigame, mgActive, cancelMinigame } from './minigames.js';
import { clamp, distToStation, moveWithCollision, fmt, fmtTime, escapeHtml, rand } from './util.js';

const $ = (s) => document.querySelector(s);
const ACT_RANGE = 24;

export class Game {
  constructor(app, conn, myId, start) {
    this.app = app; this.conn = conn; this.myId = myId;
    this.mode = start.mode; this.vs = start.mode === 'vs'; this.coop = start.mode === 'coop' || start.mode === 'inf';
    this.roster = new Map(start.roster.map((r) => [r.id, r]));
    this.s = null; this.ents = new Map(); this.cats = new Map();
    const mine = this.roster.get(myId);
    this.me = { x: 24 * TILE, y: 22 * TILE, vx: 0, vy: 0, bx: 0, by: 0, dir: 1, mv: false, look: mine ? mine.look : { fur: 0, hat: 0, acc: 0 }, anim: 0 };
    this.placed = false;
    this.cam = { x: this.me.x, y: this.me.y };
    this.keys = new Set(); this.joy = { x: 0, y: 0 };
    this.fx = []; this.bubbles = new Map(); this.sayQ = []; this.say = null;
    this.cctv = 0; this.cctvT = 0; this.shake = 0; this.noticeT = 0;
    this.pcOpen = false; this.pcTab = 'up'; this.sabTarget = null; this.toySel = 0;
    this.sendT = 0; this.lastSent = '';
    this.bumpCd = 0; this.catCd = new Map();
    this.solid = buildSolid(); this.busy = {}; this.items = new Map(); this.pads = []; this.padNear = null; this.buyDismiss = null; this.pops = []; this.shipFlash = 0; this.guideKey = ''; this.mapOpen = false;
    this.opt = { arrows: store.get('arrows', true), zoom: store.get('zoom', 1) };
    this.t = 0; this.alive = true; this.lbT = 0; this.ordKey = null;
    this.viewFi = -1;
    this.canvas = $('#cv'); this.ctx = this.canvas.getContext('2d');
    this.bindInput();
    this.resize();
    $('#game').classList.add('show');
    $('#hud-coop').style.display = this.coop ? '' : 'none';
    $('#hud-time-wrap').style.display = this.mode === 'tut' ? 'none' : '';
    $('#pc-tab-sab').style.display = this.vs ? '' : 'none';
    $('#lb').style.display = this.mode === 'tut' ? 'none' : '';
    $('#lb').classList.add('fold');
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.lastT = performance.now();
    audio.bgm('factory');
  }

  send(m) { this.conn.send({ t: 'g', m }); }

  // ---------- 서버 메시지 ----------
  onSnap(s) {
    const first = !this.s;
    this.s = s;
    const me = s.me;
    if (first || !this.placed) { this.me.x = me.x; this.me.y = me.y; this.cam.x = me.x; this.cam.y = me.y; this.placed = true; }
    // 지형
    this.busy = {}; for (const id of s.f.bz || []) this.busy[id] = 1;
    if (this.viewFi !== s.f.i) { this.viewFi = s.f.i; this.ents.clear(); this.cats.clear(); }
    // 다른 플레이어
    const seen = new Set();
    for (const a of s.p) {
      const [id, x, y, dir, mv, hold, toy, stress, warn, flags, emote] = a;
      seen.add(id);
      let e = this.ents.get(id);
      if (!e) { e = { x, y, anim: Math.random() * 4 }; this.ents.set(id, e); }
      if (Math.hypot(e.x - x, e.y - y) > 90) { e.x = x; e.y = y; }
      Object.assign(e, { tx: x, ty: y, dir, mv, hold, toy, stress, warn, flags, emote });
    }
    for (const id of this.ents.keys()) if (!seen.has(id)) this.ents.delete(id);
    const cseen = new Set();
    for (const [id, x, y, st, dir] of s.f.c) {
      cseen.add(id);
      let c = this.cats.get(id);
      if (!c) { c = { x, y }; this.cats.set(id, c); }
      Object.assign(c, { tx: x, ty: y, st, dir });
    }
    for (const id of this.cats.keys()) if (!cseen.has(id)) this.cats.delete(id);
    // 벨트 상자 (로컬에서 부드럽게 이동, 서버 위치로 보정)
    const iseen = new Set();
    for (const [id, inl, d, t, auto] of s.f.b || []) {
      iseen.add(id);
      const it = this.items.get(id);
      if (!it) this.items.set(id, { inl, d, t, auto });
      else if (Math.abs(it.d - d) > 30) it.d = d; else it.d += (d - it.d) * 0.3;
    }
    for (const id of this.items.keys()) if (!iseen.has(id)) this.items.delete(id);
    this.pads = activePads(this.padStateOf(s.f));
    for (const ev of s.ev) this.onEvent(ev);
    this.updateHud();
  }

  onEvent(ev) {
    const [k, a, b, c, d] = ev;
    switch (k) {
      case 'say': this.sayQ.push({ txt: a, face: b }); if (this.sayQ.length > 4) this.sayQ.splice(0, this.sayQ.length - 4); break;
      case 'fx': this.fx.push({ x: a, y: b, txt: c, col: d, t: 0 }); if (this.fx.length > 40) this.fx.shift(); break;
      case 'sfx': audio.sfx(a); break;
      case 'note': this.notice(a); break;
      case 'cctv':
        if (a === 1) { this.cctv = 1; this.cctvT = 0; }
        else if (a === 0) this.cctv = 0;
        else if (a === 2) this.fxMe('통과!', '#7dff8a');
        else if (a === 3) { this.fxMe('걸렸다!', '#ff5b5b'); this.shake = 0.5; }
        break;
      case 'tp': this.me.x = a; this.me.y = b; this.me.vx = this.me.vy = 0; break;
      case 'warn': this.shake = 0.4; this.flashWarn(); break;
      case 'faint': this.shake = 0.3; break;
      case 'fired': if (a === 1) this.overlay('🚫 해고!', '관전 모드로 전환돼요', 2.5); cancelMinigame(); this.closePc(); break;
      case 'unlock': this.shake = 0.6; break;
      case 'bgm': audio.bgm(a); break;
      case 'ship': this.shipFlash = 0.7; break;
      case 'build': {
        const pad = this.pads.find((x) => x.pad.id === a) || null;
        const pd = pad ? pad.pad : null;
        const P = pd ? { x: (pd.x + pd.w / 2) * TILE, y: (pd.y + pd.h / 2) * TILE } : { x: this.me.x, y: this.me.y };
        this.pops.push({ x: P.x, y: P.y - 20, t: 0 });
        this.shake = Math.max(this.shake, 0.25);
        break;
      }
      case 'event': this.showEvent(a, b); break;
      case 'combo': if (a >= 2) { this.fxMe(`🔥 콤보 ${a}!`, '#ffb84a'); audio.sfx('combo'); } break;
      case 'day': this.overlay(`${this.dayName(a)} 클리어!`, `실적 ${fmt(c)} / 목표 ${fmt(d)}`, 4.5); audio.sfx('win'); break;
    }
  }
  dayName(d) { return d <= 5 ? DAY_NAMES[d - 1] : `${d}일차`; }
  padStateOf(f) { return { z: f.z.map((z) => ({ u: !!z[0], m: [z[3], z[4], z[5], z[6]] })), up: f.up || [0, 0, 0], deco: f.dc || [0, 0, 0, 0, 0] }; }

  onChat(m) {
    const log = $('#chatlog');
    const div = document.createElement('div');
    div.innerHTML = m.id ? `<b>${escapeHtml(m.name)}</b> ${escapeHtml(m.txt)}` : `<i>${escapeHtml(m.txt)}</i>`;
    log.appendChild(div);
    while (log.children.length > 6) log.removeChild(log.firstChild);
    setTimeout(() => div.classList.add('fade'), 8000);
    if (m.id) this.bubbles.set(m.id, { txt: m.txt, t: 3.5 });
  }

  fxMe(txt, col) { this.fx.push({ x: this.me.x, y: this.me.y - 26, txt, col, t: 0 }); }
  notice(txt) {
    const n = $('#notice');
    n.textContent = txt; n.classList.add('show');
    clearTimeout(this._nt); this._nt = setTimeout(() => n.classList.remove('show'), 3200);
  }
  overlay(title, sub, dur) {
    const o = $('#ov');
    o.querySelector('h2').textContent = title; o.querySelector('p').textContent = sub || '';
    o.classList.add('show');
    clearTimeout(this._ot);
    if (dur) this._ot = setTimeout(() => o.classList.remove('show'), dur * 1000);
  }
  showEvent(id, dur) {
    if (!id) return;
    const E = EVENTS.find((e) => e.id === id); if (!E) return;
    this.overlay(`${E.icon} ${E.name}!`, E.desc, 2.6);
    this.shake = 0.35;
  }
  flashWarn() { const w = $('#h-warn'); w.classList.remove('pulse'); void w.offsetWidth; w.classList.add('pulse'); }

  // ---------- HUD ----------
  updateHud() {
    const s = this.s, me = s.me, f = s.f;
    $('#h-time').textContent = s.ph === 'count' ? '준비' : fmtTime(s.tl);
    $('#h-time').classList.toggle('urgent', s.tl <= (this.coop ? 30 : 60) && s.ph === 'play');
    $('#h-money').textContent = fmt(f.m);
    const st = clamp(me.st, 0, 100);
    const sb = $('#h-stress i');
    sb.style.transform = `scaleX(${st / 100})`;
    sb.style.background = st < 50 ? '#4cd964' : st < 80 ? '#ffcc00' : '#ff3b30';
    $('#h-stress-n').textContent = Math.round(st);
    $('#h-warn').textContent = me.wa ? '⚠'.repeat(me.wa) : '';
    const cb = me.cb || 0;
    $('#h-combo').textContent = cb ? `🔥${cb}` : '';
    const evb = $('#evbar');
    if (f.ev) { const E = EVENTS.find((e) => e.id === f.ev[0]); evb.classList.add('show'); evb.className = 'show ev-' + f.ev[0]; evb.innerHTML = `${E.icon} <b>${E.name}</b>${E.dur ? ` · ${f.ev[1]}초` : ''}`; }
    else evb.className = '';
    if (this.coop) {
      $('#h-day').textContent = this.dayName(f.day || 1);
      $('#h-target i').style.transform = `scaleX(${clamp(f.de / Math.max(1, f.tg), 0, 1)})`;
      $('#h-target-n').textContent = `${fmt(Math.max(0, f.de))} / ${fmt(f.tg)}`;
    }
    // 주문
    const ok = f.o.map((o) => o[0] + ':' + o[3]).join(',');
    const box = $('#orders');
    if (ok !== this.ordKey) {
      this.ordKey = ok;
      box.innerHTML = f.o.map((o) => `<div class="ord${o[6] ? ' boss' : ''}" data-id="${o[0]}"><canvas width="16" height="10"></canvas><div class="ord-t"><b>${FISH[o[1]].name}</b> ${o[3]}/${o[2]}</div><div class="ord-bar"><i></i></div></div>`).join('') || '<div class="ord empty">주문 대기 중…</div>';
      box.querySelectorAll('.ord canvas').forEach((cv, i) => { const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; const sp = itemSprite(f.o[i][1], 0); c.drawImage(sp, 0, 1); });
    }
    box.querySelectorAll('.ord[data-id]').forEach((el, i) => {
      const o = f.o[i]; if (!o) return;
      const k = clamp(o[4] / o[5], 0, 1);
      const bar = el.querySelector('.ord-bar i');
      bar.style.transform = `scaleX(${k})`;
      bar.style.background = k > 0.5 ? '#4cd964' : k > 0.25 ? '#ffcc00' : '#ff3b30';
    });
    // 순위표 (4Hz)
    const now = performance.now();
    if (now - this.lbT > 250) { this.lbT = now; this.renderLb(); if (this.pcOpen) this.renderPc(); }
    // 상태 오버레이
    const spec = $('#spec');
    if (me.fired) {
      spec.classList.add('show');
      const owner = [...this.roster.values()].find((r) => r.fi === me.view);
      spec.querySelector('span').textContent = `관전 중: ${owner ? owner.name : ''}`;
    } else spec.classList.remove('show');
    const out = $('#outov');
    if (me.out > 0) { out.classList.add('show'); out.querySelector('b').textContent = Math.ceil(me.out); } else out.classList.remove('show');
    const cd = $('#count');
    if (s.ph === 'count' && s.cd > 0.05) { cd.classList.add('show'); cd.textContent = s.cd > 0.6 ? Math.ceil(s.cd - 0.5) : 'GO!'; }
    else cd.classList.remove('show');
    // 장난감 버튼
    const tb = $('#mc-toy');
    const toy = TOYS.find((t) => t.id === (me.toy || this.pickToy()));
    tb.textContent = toy ? toy.icon : '🏐';
    tb.classList.toggle('on', !!me.toy);
    $('#h-toy').textContent = me.toy ? toy.icon : '';
  }

  renderLb() {
    const s = this.s; if (!s) return;
    const rows = s.lb.slice().sort((a, b) => a[4] - b[4] || b[1] - a[1]);
    $('#lb').innerHTML = (this.coop ? `<div class="lb-h">팀원 기여</div>` : `<div class="lb-h">순위</div>`) + rows.map((r, i) => {
      const p = this.roster.get(r[0]); if (!p) return '';
      return `<div class="lb-r${r[0] === this.myId ? ' me' : ''}${r[4] ? ' fired' : ''}"><span class="lb-n">${this.coop ? '' : (i + 1) + '. '}${escapeHtml(p.name)}${r[4] ? ' 🚫' : ''}</span><span class="lb-w">${'⚠️'.repeat(r[2])}</span><span class="lb-m">${fmt(r[1])}</span><span class="lb-s"><i style="transform:scaleX(${r[3] / 100});background:${r[3] < 50 ? '#4cd964' : r[3] < 80 ? '#ffcc00' : '#ff3b30'}"></i></span></div>`;
    }).join('');
  }

  // ---------- 입력 ----------
  bindInput() {
    this._kd = (e) => {
      if (!this.alive) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') this.closeChat();
        return;
      }
      if (mgActive()) return;
      const k = e.key.toLowerCase();
      if (k === 'enter') { e.preventDefault(); this.openChat(); return; }
      if (k === 'escape') { this.closePc(); this.toggleEmotes(false); this.toggleMap(false); if (this.buyPadCur) { this.buyDismiss = this.padNear; $('#buy').classList.remove('show'); this.buyPadCur = null; } return; }
      if (k === 'tab') { e.preventDefault(); $('#lb').classList.toggle('fold'); return; }
      if (k === 'm') { this.toggleMap(); return; }
      if (this.pcOpen) return;
      this.keys.add(k);
      if ((k === 'e' || k === ' ') && !e.repeat) { e.preventDefault(); this.act(); }
      if (k === 'escape' && this.buyPadCur) { this.buyDismiss = this.padNear; $('#buy').classList.remove('show'); this.buyPadCur = null; }
      if (k === 'q' && !e.repeat) this.toggleToy();
      if (['1', '2', '3', '4'].includes(k) && !e.repeat) this.emote(+k - 1);
      if (this.s && this.s.me.fired) { if (k === 'arrowleft' || k === 'a') this.spec(-1); if (k === 'arrowright' || k === 'd') this.spec(1); }
    };
    this._ku = (e) => this.keys.delete(e.key.toLowerCase());
    this._blur = () => this.keys.clear();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    this._rs = () => this.resize();
    window.addEventListener('resize', this._rs);

    // 모바일 조이스틱
    const joy = $('#joy'), knob = $('#joy i');
    let jid = null, ox = 0, oy = 0;
    this._jd = (e) => {
      if (jid !== null) return;
      jid = e.pointerId; ox = e.clientX; oy = e.clientY;
      joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; joy.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
    };
    this._jm = (e) => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy), R = 50;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      this.joy.x = dx / R; this.joy.y = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    this._ju = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; joy.classList.remove('on'); };
    const zone = $('#joyzone');
    zone.addEventListener('pointerdown', this._jd);
    window.addEventListener('pointermove', this._jm);
    window.addEventListener('pointerup', this._ju);
    window.addEventListener('pointercancel', this._ju);
    const tap = (sel, fn) => { const el = $(sel); const h = (e) => { e.preventDefault(); e.stopPropagation(); fn(); }; el.addEventListener('pointerdown', h); return () => el.removeEventListener('pointerdown', h); };
    this._unb = [
      tap('#mc-act', () => this.act()),
      tap('#mc-toy', () => this.toggleToy()),
      tap('#mc-emo', () => this.toggleEmotes()),
      tap('#mc-chat', () => this.openChat()),
      tap('#spec-l', () => this.spec(-1)),
      tap('#spec-r', () => this.spec(1)),
      tap('#pc-close', () => this.closePc()),
      tap('#btn-map', () => this.toggleMap()),
      tap('#buy-yes', () => this.buyPad()),
      tap('#buy-no', () => { this.buyDismiss = this.padNear; $('#buy').classList.remove('show'); this.buyPadCur = null; }),
      tap('#mapov', () => this.toggleMap(false)),
      tap('#lb', () => $('#lb').classList.toggle('fold')),
    ];
    document.querySelectorAll('#emotes button').forEach((b, i) => {
      const h = (e) => { e.preventDefault(); this.emote(i); this.toggleEmotes(false); };
      b.addEventListener('pointerdown', h);
      this._unb.push(() => b.removeEventListener('pointerdown', h));
    });
    document.querySelectorAll('#pc-tabs button').forEach((b) => {
      const h = () => { this.pcTab = b.dataset.tab; this.renderPc(); };
      b.addEventListener('click', h);
      this._unb.push(() => b.removeEventListener('click', h));
    });
    const pcBody = $('#pc-body');
    this._pcClick = (e) => {
      const b = e.target.closest('button[data-k]'); if (!b || b.disabled) return;
      const k = b.dataset.k;
      if (k === 'target') { this.sabTarget = +b.dataset.id; this.renderPc(); return; }
      if (k === 'equip') { this.toySel = +b.dataset.id; this.renderPc(); audio.sfx('click'); return; }
      const m = { t: 'buy', k };
      if (b.dataset.z) m.z = +b.dataset.z;
      if (b.dataset.id) m.id = +b.dataset.id;
      if (k === 'sab') { m.s = b.dataset.s; m.target = this.sabTarget; }
      this.send(m);
      audio.sfx('click');
    };
    pcBody.addEventListener('click', this._pcClick);
    const ci = $('#chatin');
    this._ci = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = ci.value.trim();
        if (v) this.conn.send({ t: 'chat', txt: v });
        this.closeChat();
      }
    };
    ci.addEventListener('keydown', this._ci);
    this._cb = () => setTimeout(() => this.closeChat(), 100);
    ci.addEventListener('blur', this._cb);
  }

  unbind() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    window.removeEventListener('resize', this._rs);
    $('#joyzone').removeEventListener('pointerdown', this._jd);
    window.removeEventListener('pointermove', this._jm);
    window.removeEventListener('pointerup', this._ju);
    window.removeEventListener('pointercancel', this._ju);
    this._unb.forEach((f) => f());
    $('#pc-body').removeEventListener('click', this._pcClick);
    $('#chatin').removeEventListener('keydown', this._ci);
    $('#chatin').removeEventListener('blur', this._cb);
  }

  openChat() { const w = $('#chatwrap'); w.classList.add('show'); const i = $('#chatin'); i.value = ''; i.focus(); this.keys.clear(); }
  closeChat() { $('#chatwrap').classList.remove('show'); $('#chatin').blur(); }
  toggleEmotes(v) { $('#emotes').classList.toggle('show', v); }
  emote(i) { this.send({ t: 'emote', e: i }); audio.sfx('seal'); }
  spec(d) {
    const s = this.s; if (!s || !s.me.fired) return;
    const fis = [...new Set(s.lb.filter((r) => !r[4]).map((r) => r[5]))];
    if (!fis.length) return;
    let i = fis.indexOf(s.me.view); i = (i + d + fis.length) % fis.length;
    this.send({ t: 'view', fi: fis[i] });
  }
  pickToy() {
    const ow = this.s ? this.s.me.ow : [1];
    return ow.includes(this.toySel) ? this.toySel : Math.max(...ow);
  }
  toggleToy() {
    const s = this.s; if (!s || s.ph !== 'play') return;
    if (s.me.toy) this.send({ t: 'toy', on: false });
    else { if (s.me.fa > 0 || s.me.out > 0 || s.me.fired) return; this.send({ t: 'toy', on: true, id: this.pickToy() }); }
  }

  canMove() {
    const s = this.s; if (!s || s.ph !== 'play') return false;
    const m = s.me;
    return !m.fired && m.out <= 0 && m.fa <= 0 && !m.toy && !mgActive() && !this.pcOpen;
  }

  // 현재 상호작용 대상 계산
  // 발밑의 구매 버튼
  padUnder() {
    const x = this.me.x, y = this.me.y;
    for (const a of this.pads) {
      const p = a.pad;
      const m = p.w > 1 ? 2 : 5;
      if (x >= p.x * TILE - m && x <= (p.x + p.w) * TILE + m && y >= p.y * TILE - m && y <= (p.y + p.h) * TILE + m) return a;
    }
    return null;
  }

  interaction() {
    const s = this.s; if (!s || s.ph !== 'play') return null;
    const m = s.me; if (m.fired || m.out > 0 || m.fa > 0) return null;
    const pad = this.padUnder();
    if (pad) return { pad, label: `🛒 구매 · ${pad.label} ${fmt(pad.price)}원`, run: () => this.buyPad(pad) };
    let best = null, bd = ACT_RANGE;
    for (const st of STATIONS) {
      if (st.z !== undefined) { // 아직 없는 자동 기계 자리는 건너뜀
        const zz = s.f.z[st.z];
        if (st.kind === 'acut' && !zz[4]) continue;
        if (st.kind === 'apack' && !zz[5]) continue;
        if (st.kind === 'mach' && !zz[3] && !zz[1]) continue;
      }
      const d = distToStation(this.me.x, this.me.y, st) - (st.kind === 'tank' ? 4 : 0);
      if (d < bd) { bd = d; best = st; }
    }
    if (!best) return null;
    const meP = s.p.find((p) => p[0] === this.myId);
    const hold = meP ? meP[5] : 0;
    const ht = hold ? Math.floor((hold - 1) / 3) : -1, hs = hold ? (hold - 1) % 3 : -1;
    const f = s.f;
    if (m.toy) return { st: best, label: '장난감을 먼저 내려놔요 (Q)', run: null };
    const Z = (z) => f.z[z]; // [u, br, cat, m0, m1, m2, m3, b0, b1, b2]
    switch (best.kind) {
      case 'tank': {
        const z = Z(best.z), nm = FISH[best.z].name;
        if (!z[0]) return { st: best, label: `🔒 ${nm} 구역 · 아래 바닥 버튼으로 열어요`, run: null };
        if (hold) return { st: best, label: '들고 있는 것 버리기', run: () => this.send({ t: 'a', k: 'drop' }) };
        if (z[2]) return { st: best, label: '🐱 고양이를 먼저 쫓아내요!', run: null };
        if (z[1]) return { st: best, label: '⚙️ 펌프 고장! 뒤쪽 모터를 고쳐요', run: null };
        if (z[3] && !z[4]) return z[7] > 0 ? { st: best, label: `바구니에서 ${nm} 줍기 (${z[7]})`, run: () => this.send({ t: 'a', k: 'take', z: best.z, i: 0 }) } : { st: best, label: '자동 뜰채가 건지는 중… 직접 건져도 돼요', run: () => this.mg('catch', best.z, { t: 'a', k: 'catch', z: best.z }, best.id) };
        return { st: best, label: `${nm} 건지기`, run: () => this.mg('catch', best.z, { t: 'a', k: 'catch', z: best.z }, best.id) };
      }
      case 'mach': {
        const z = Z(best.z); if (!z[0]) return null;
        if (z[1]) return { st: best, label: '🔧 펌프 수리하기', run: () => this.mg('repair', 0, { t: 'a', k: 'fix', z: best.z }, best.id) };
        return { st: best, label: z[3] ? `자동 뜰채 Lv.${z[3]}` : '뜰채 모터 자리 · 바닥 버튼으로 사요', run: null };
      }
      case 'acut': {
        const z = Z(best.z); if (!z[0] || !z[4]) return { st: best, label: '자동 손질기 자리', run: null };
        if (!z[5] && z[8] > 0 && !hold) return { st: best, label: `손질된 ${FISH[best.z].name} 꺼내기 (${z[8]})`, run: () => this.send({ t: 'a', k: 'take', z: best.z, i: 1 }) };
        return { st: best, label: `자동 손질기 Lv.${z[4]}${!z[5] ? ` · 바구니 ${z[8]}/${BASKET}` : ''}`, run: null };
      }
      case 'apack': {
        const z = Z(best.z); if (!z[0] || !z[5]) return { st: best, label: '자동 포장기 자리', run: null };
        if (!z[6] && z[9] > 0) return { st: best, label: `상자 ${z[9]}개 벨트로 보내기`, run: () => this.send({ t: 'a', k: 'send', z: best.z }) };
        return { st: best, label: `자동 포장기 Lv.${z[5]}${z[6] ? ' · 완전 자동!' : ''}`, run: null };
      }
      case 'cut': return hs === 0 ? { st: best, label: '손질하기', run: () => this.mg('cut', ht, { t: 'a', k: 'cut' }, best.id) } : { st: best, label: '손질대 · 날생선을 들고 와요', run: null };
      case 'pack': return hs === 1 ? { st: best, label: '포장 · 출하하기', run: () => this.mg('pack', ht, { t: 'a', k: 'pack' }, best.id) } : { st: best, label: '포장대 · 손질한 생선을 들고 와요', run: null };
      case 'truck': return { st: best, label: '출하 트럭 · 벨트로 들어온 상자를 실어요', run: null };
      case 'pc': return m.hk > 0 ? { st: best, label: '💻 재부팅하기', run: () => this.mg('reboot', 0, { t: 'a', k: 'unhack' }, best.id) } : { st: best, label: '컴퓨터 열기', run: () => this.openPc() };
      case 'mop': return f.sl > 0 ? { st: best, label: '🧽 바닥 닦기', run: () => this.mg('mop', 0, { t: 'a', k: 'mop' }, best.id) } : { st: best, label: '청소 도구함 · 바닥이 깨끗해요', run: null };
      case 'sofa': return { st: best, label: '소파에서 쉬기 (장난감)', run: () => this.toggleToy() };
      case 'board': return { st: best, label: '주문 게시판 · 오른쪽 위를 확인해요', run: () => { const o = $('#orders'); o.classList.remove('pulse'); void o.offsetWidth; o.classList.add('pulse'); } };
    }
    return null;
  }

  // 구매 확인 창
  updateBuy() {
    const pad = this.s && this.s.ph === 'play' && !mgActive() && !this.pcOpen ? this.padUnder() : null;
    const id = pad ? pad.pad.id + ':' + pad.price : null;
    if (id !== this.padNear) {
      this.padNear = id;
      const el = $('#buy');
      if (pad && this.buyDismiss !== id) {
        $('#buy-ic').textContent = pad.icon;
        $('#buy-name').textContent = pad.label;
        $('#buy-desc').textContent = pad.desc || '';
        $('#buy-price').textContent = fmt(pad.price) + '원';
        el.classList.add('show');
        this.buyPadCur = pad;
        audio.sfx('click');
      } else { el.classList.remove('show'); this.buyPadCur = null; }
      if (!pad) this.buyDismiss = null;
    }
    if (this.buyPadCur) {
      const money = this.s.f.m, ok = money >= this.buyPadCur.price;
      $('#buy-yes').disabled = !ok;
      $('#buy-yes').textContent = ok ? '구매 (E)' : '돈이 부족해요';
      $('#buy-bar i').style.transform = `scaleX(${clamp(money / this.buyPadCur.price, 0, 1)})`;
    }
  }
  buyPad(pad) {
    pad = pad || this.buyPadCur;
    if (!pad) return;
    if (this.s.f.m < pad.price) { audio.sfx('fail'); this.notice(`돈이 ${fmt(pad.price - this.s.f.m)}원 부족해요`); return; }
    this.send({ t: 'buy', k: 'pad', id: pad.pad.id });
    this.buyDismiss = pad.pad.id + ':' + pad.price;
    $('#buy').classList.remove('show'); this.buyPadCur = null;
  }

  act() {
    if (mgActive() || this.pcOpen) return;
    const it = this.interaction();
    if (it && it.run) { this.keys.clear(); it.run(); }
    else if (it) audio.sfx('click');
  }

  async mg(kind, tier, msg, stId) {
    this.keys.clear(); this.joy.x = this.joy.y = 0;
    this.me.vx = this.me.vy = 0;
    if (stId) this.send({ t: 'work', s: stId });
    const res = await runMinigame(kind, tier, (this.s && this.s.me.cb) || 0);
    if (!this.alive) return;
    if (stId) this.send({ t: 'work', s: null });
    if (res.r === 'ok') this.send({ ...msg, g: res.g });
    else if (res.r === 'fail') this.send({ t: 'a', k: 'fail' });
  }

  // ---------- 컴퓨터 ----------
  openPc() { this.pcOpen = true; this.keys.clear(); $('#pc').classList.add('show'); document.body.classList.add('modal-open'); this.send({ t: 'work', s: 'pc' }); this.renderPc(); audio.sfx('click'); }
  closePc() { if (!this.pcOpen) return; this.pcOpen = false; $('#pc').classList.remove('show'); document.body.classList.remove('modal-open'); this.send({ t: 'work', s: null }); }
  renderPc() {
    const s = this.s; if (!s) return;
    const f = s.f, m = s.me, money = f.m;
    document.querySelectorAll('#pc-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.pcTab));
    $('#pc-money').textContent = fmt(money);
    let h = '';
    if (this.pcTab === 'up') {
      h += '<p class="tip">기계는 공장 바닥의 초록 구매 버튼을 밟아서 사요. 여기서는 라인 상태를 볼 수 있어요.</p>';
      h += f.z.map((z, i) => {
        const nm = FISH[i].name;
        if (!z[0]) return `<div class="row locked"><div class="ic">🔒</div><div class="info"><b>${nm} 구역</b><small>잠김 · 해금 ${fmt(UNLOCK[i])}원 (수조 앞 바닥 버튼)</small></div></div>`;
        const st = MACHS.map((M, k) => (z[3 + k] ? `${M.icon}${k < 3 ? 'Lv' + z[3 + k] : ''}` : '<span style="opacity:.35">' + M.icon + '</span>')).join(' ');
        const full = z[6] ? '✅ 완전 자동' : z[3] ? `바구니 ${z[7 + (z[5] ? 2 : z[4] ? 1 : 0)]}/${BASKET}` : '수동';
        return `<div class="row"><div class="ic">${fishIcon(i)}</div><div class="info"><b>${nm} 라인 ${z[1] ? '<em class="bad">고장!</em>' : ''}</b><small>${st} · ${full}</small></div></div>`;
      }).join('');
      h += `<div class="row"><div class="ic">➰</div><div class="info"><b>출하 벨트 업그레이더</b><small>${UPGRADERS.map((u, i) => (f.up && f.up[i] ? `${u.icon}×${u.mult}` : `<span style="opacity:.35">${u.icon}</span>`)).join(' ')}</small></div></div>`;
    } else if (this.pcTab === 'toy') {
      const sel = this.pickToy();
      h += '<p class="tip">장난감은 Q / 🏐 버튼으로 사용해요. 노는 동안 CCTV에 걸리지 않게 조심!</p>';
      h += TOYS.map((t) => {
        const own = m.ow.includes(t.id);
        const btn = own ? (sel === t.id ? '<button disabled>장착 중</button>' : `<button data-k="equip" data-id="${t.id}">장착</button>`) : `<button data-k="toy" data-id="${t.id}" ${money < t.price ? 'disabled' : ''}>${fmt(t.price)}</button>`;
        return `<div class="row"><div class="ic">${t.icon}</div><div class="info"><b>${t.name}</b><small>초당 -${t.rate} · ${t.desc}</small></div>${btn}</div>`;
      }).join('');
    } else if (this.pcTab === 'sab') {
      const targets = s.lb.filter((r) => r[0] !== this.myId && !r[4]);
      if (this.sabTarget && !targets.some((r) => r[0] === this.sabTarget)) this.sabTarget = null;
      if (!this.sabTarget && targets.length) this.sabTarget = targets.slice().sort((a, b) => b[1] - a[1])[0][0];
      h += '<p class="tip">대상을 고르고 방해를 걸어요. 같은 대상은 20초 동안 다시 방해할 수 없어요.</p><div class="targets">';
      h += targets.map((r) => { const p = this.roster.get(r[0]); return `<button data-k="target" data-id="${r[0]}" class="${this.sabTarget === r[0] ? 'on' : ''}">${escapeHtml(p ? p.name : '?')} ${r[6] ? '🛡️' : ''}<small>${fmt(r[1])}</small></button>`; }).join('') || '<span class="tip">방해할 상대가 없어요</span>';
      h += '</div>';
      const tr = targets.find((r) => r[0] === this.sabTarget);
      h += SABS.map((sb) => `<div class="row"><div class="ic">${sb.icon}</div><div class="info"><b>${sb.name}</b><small>${sb.desc}</small></div><button data-k="sab" data-s="${sb.id}" ${!tr || tr[6] || money < sb.price ? 'disabled' : ''}>${fmt(sb.price)}</button></div>`).join('');
    } else {
      const rows = s.lb.slice().sort((a, b) => b[1] - a[1]);
      h += rows.map((r, i) => { const p = this.roster.get(r[0]); return `<div class="row"><div class="ic">${i + 1}</div><div class="info"><b>${escapeHtml(p ? p.name : '?')}${p && p.bot ? ' 🤖' : ''}${r[4] ? ' 🚫 해고' : ''}</b><small>스트레스 ${r[3]} · 경고 ${r[2]}회</small></div><span class="amt">${fmt(r[1])}</span></div>`; }).join('');
    }
    $('#pc-body').innerHTML = h;
  }

  // ---------- 루프 ----------
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    // 화면 확대 설정: 0 넓게 / 1 보통 / 2 크게 → 세로로 보이는 타일 수
    const rows = [21, 17, 13][this.opt.zoom] || 17;
    this.scale = Math.max(2, Math.round(this.canvas.height / (TILE * rows)));
    if (this.canvas.width / this.scale < TILE * (rows + 2)) this.scale = Math.max(2, Math.floor(this.canvas.width / (TILE * (rows + 2))));
  }

  frame(now) {
    if (!this.alive) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now; this.t += dt;
    if (this.s) { this.update(dt); this.render(dt); }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const s = this.s, me = this.me;
    // 이동
    let ix = 0, iy = 0;
    if (this.canMove()) {
      const k = this.keys;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      ix += this.joy.x; iy += this.joy.y;
      const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
      if (s.me.hk > 0) { ix = -ix; iy = -iy; }
    }
    const meP = s.p.find((p) => p[0] === this.myId);
    const holding = meP && meP[5];
    const sp = SPEED * (holding ? HOLD_SPEED : 1);
    const slip = s.f.sl > 0;
    const k = slip ? Math.min(1, dt * 1.6) : 1;
    me.vx += (ix * sp - me.vx) * k; me.vy += (iy * sp - me.vy) * k;
    if (!this.canMove() && !slip) { me.vx = 0; me.vy = 0; }
    me.bx *= Math.pow(0.02, dt); me.by *= Math.pow(0.02, dt);
    if (this.solid && !s.me.fired && s.me.out <= 0) {
      const r = moveWithCollision(this.solid, me, (me.vx + me.bx) * dt, (me.vy + me.by) * dt);
      if (slip) { if (r.hitX) me.vx *= -0.4; if (r.hitY) me.vy *= -0.4; }
    }
    me.mv = Math.hypot(me.vx, me.vy) > 8;
    if (Math.abs(me.vx) > 4) me.dir = me.vx > 0 ? 1 : -1;
    me.anim += dt * (me.mv ? 8 : 2);
    // 다른 물범과 부딪히기
    if (this.bumpCd > 0) this.bumpCd -= dt;
    if (!s.me.fired && s.me.out <= 0) {
      for (const [id, e] of this.ents) {
        if (id === this.myId || (e.flags & 6)) continue;
        const dx = me.x - e.x, dy = me.y - e.y, d = Math.hypot(dx, dy);
        if (d < 11) {
          const nx = d > 0.1 ? dx / d : rand(-1, 1), ny = d > 0.1 ? dy / d : rand(-1, 1);
          me.bx = nx * 110; me.by = ny * 110;
          if (this.bumpCd <= 0) { this.bumpCd = 0.35; audio.sfx('boing'); }
        }
      }
      for (const [id, c] of this.cats) {
        if (c.st === 2) continue;
        if (Math.hypot(me.x - c.x, me.y - c.y) < 14) {
          const cd = this.catCd.get(id) || 0;
          if (this.t > cd) {
            this.catCd.set(id, this.t + 0.5);
            this.send({ t: 'a', k: 'bumpcat', id });
            const dx = me.x - c.x, dy = me.y - c.y, d = Math.hypot(dx, dy) || 1;
            me.bx = dx / d * 140; me.by = dy / d * 140;
          }
        }
      }
    }
    // 위치 전송 (15Hz, 변경 시)
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 15;
      const key = `${me.x.toFixed(1)},${me.y.toFixed(1)},${me.dir},${me.mv ? 1 : 0}`;
      if (key !== this.lastSent) { this.lastSent = key; this.send({ t: 'p', x: me.x, y: me.y, d: me.dir, m: me.mv ? 1 : 0 }); }
    }
    // 보간
    const a = Math.min(1, dt * 12);
    for (const e of this.ents.values()) { e.x += (e.tx - e.x) * a; e.y += (e.ty - e.y) * a; e.anim += dt * (e.mv ? 8 : 2); }
    for (const c of this.cats.values()) { c.x += (c.tx - c.x) * a; c.y += (c.ty - c.y) * a; }
    // 컴퓨터 자동 닫기
    if (this.pcOpen && distToStation(me.x, me.y, STATION_BY_ID.pc) > ACT_RANGE + 12) this.closePc();
    // 대사창
    this.updateSay(dt);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 1.4);
    for (const [id, b] of this.bubbles) { b.t -= dt; if (b.t <= 0) this.bubbles.delete(id); }
    if (this.cctv) this.cctvT += dt;
    if (this.shipFlash > 0) this.shipFlash -= dt;
    updateBelt(dt, s.f.z.map((z) => z[0] === 1));
    const dark = s.f.ev && s.f.ev[0] === 'blackout';
    if (!dark) for (const it of this.items.values()) it.d = Math.min(BELT_INLETS[it.inl].len, it.d + BELT_SPEED * dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1);
    this.updateBuy();
    this.updateGuide();
    if (this.mapOpen) { this.mapT = (this.mapT || 0) - dt; if (this.mapT <= 0) { this.mapT = 0.25; this.drawMap(); } }
    if (this.shake > 0) this.shake -= dt;
    // 상호작용 안내 (모바일 버튼)
    const it = this.interaction();
    const key = it ? it.label + (it.run ? 1 : 0) : '';
    if (key !== this._itKey) {
      this._itKey = key;
      const btn = $('#mc-act');
      btn.classList.toggle('ready', !!(it && it.run));
      btn.querySelector('span').textContent = it && it.run ? shortLabel(it.label) : '행동';
    }
    this.curIt = it;
  }

  updateSay(dt) {
    const box = $('#boss');
    if (!this.say && this.sayQ.length) {
      const n = this.sayQ.shift();
      this.say = { ...n, shown: 0, hold: 0 };
      box.classList.add('show');
      const c = $('#boss-face'); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 64, 64); x.drawImage(bossPortrait(n.face), 0, 0, 64, 64);
    }
    const sy = this.say;
    if (!sy) return;
    const speed = this.sayQ.length > 1 ? 90 : 45;
    if (sy.shown < sy.txt.length) {
      const prev = Math.floor(sy.shown);
      sy.shown = Math.min(sy.txt.length, sy.shown + dt * speed);
      if (Math.floor(sy.shown) !== prev && prev % 2 === 0) audio.sfx('type');
      $('#boss-txt').textContent = sy.txt.slice(0, Math.floor(sy.shown));
    } else {
      sy.hold += dt;
      if (sy.hold > (this.sayQ.length ? 1.2 : 3.2)) { this.say = null; if (!this.sayQ.length) box.classList.remove('show'); }
    }
  }

  render() {
    const s = this.s, ctx = this.ctx, cv = this.canvas, sc = this.scale;
    const me = this.me;
    // 카메라
    let fx = me.x, fy = me.y;
    if (s.me.fired) {
      const owner = [...this.ents.entries()].find(([id, e]) => id !== this.myId && !(e.flags & 4));
      if (owner) { fx = owner[1].x; fy = owner[1].y; }
    }
    this.cam.x += (fx - this.cam.x) * 0.15; this.cam.y += (fy - this.cam.y) * 0.15;
    const vw = cv.width / sc, vh = cv.height / sc;
    let cx = clamp(this.cam.x - vw / 2, 0, Math.max(0, MAP_W * TILE - vw));
    let cy = clamp(this.cam.y - vh / 2, -8, Math.max(0, MAP_H * TILE - vh));
    if (MAP_W * TILE < vw) cx = (MAP_W * TILE - vw) / 2;
    if (MAP_H * TILE < vh) cy = (MAP_H * TILE - vh) / 2;
    if (this.shake > 0) { cx += rand(-2, 2); cy += rand(-2, 2); }
    cx = Math.round(cx * sc) / sc; cy = Math.round(cy * sc) / sc;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d111b'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(sc, 0, 0, sc, -cx * sc, -cy * sc);
    ctx.imageSmoothingEnabled = false;
    const un = s.f.z.map((z) => z[0] === 1);
    ctx.drawImage(background(un), 0, 0);
    const t = this.t;
    const view = { x: cx, y: cy, w: vw, h: vh };
    drawWorldDynamic(ctx, s, t, view);
    const dark = s.f.ev && s.f.ev[0] === 'blackout';
    drawDecos(ctx, s, t);
    drawBelts(ctx, s, t, this.items, dark);
    drawStationsDynamic(ctx, { f: s.f, me: s.me, busy: this.busy, shipped: s.f.sh, shipFlash: this.shipFlash }, t, view);
    const ghosts = new Set(this.pads.filter((a) => a.pad.kind === 'mach' && !a.up).map((a) => a.pad.id));
    drawAutomation(ctx, s, t, ghosts, dark);
    const gPad = this.pads.find((a) => a.pad.kind === 'upg');
    drawUpgraders(ctx, s, t, { g: gPad ? gPad.pad.i : -1 });
    drawPads(ctx, this.pads, s.f.m, t, this.buyPadCur ? this.buyPadCur.pad.id : null);
    // 설치 연출 (먼지 · 반짝)
    for (const p of this.pops) {
      const k = p.t;
      for (let i = 0; i < 10; i++) { const a = i * 0.63; ctx.fillStyle = `rgba(255,236,150,${1 - k})`; ctx.fillRect(Math.round(p.x + Math.cos(a) * k * 30), Math.round(p.y + 14 + Math.sin(a) * k * 18), 2, 2); }
      for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(200,200,200,${0.7 - k * 0.7})`; ctx.fillRect(Math.round(p.x - 16 + i * 6), Math.round(p.y + 20 - k * 8), 5, 4); }
    }
    // 지금 가야 할 동선 강조 (들고 있을 때)
    const g = this.guide;
    if (g && g.st) {
      const p = stationPoint(g.st), pulse = 0.5 + Math.sin(t * 6) * 0.3;
      ctx.strokeStyle = `rgba(255,224,102,${pulse})`; ctx.lineWidth = 2;
      ctx.strokeRect(g.st.x * TILE - 3, g.st.y * TILE - 3, g.st.w * TILE + 6, g.st.h * TILE + 6);
      ctx.fillStyle = `rgba(255,224,102,${pulse})`;
      const by = Math.round(p.y + Math.sin(t * 5) * 2);
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(p.x) - 4 + i, by - 8 + i, 9 - i * 2, 1);
    }
    // 미끄러운 바닥
    if (s.f.sl > 0) {
      ctx.fillStyle = 'rgba(140,220,255,0.12)';
      ctx.beginPath(); ctx.arc(CX * TILE, CY * TILE, R_WALK * TILE, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 60; i++) { const q = polar(4 + (i * 7.3) % 23, (i * 47) % 360); const k = (t + i * 0.37) % 2; ctx.fillStyle = `rgba(220,245,255,${0.6 - k * 0.3})`; ctx.fillRect(Math.round(q.x * TILE), Math.round(q.y * TILE - k * 3), 2, 2); }
    }
    // 엔티티 (y 정렬)
    const list = [];
    for (const [id, e] of this.ents) {
      if (id === this.myId) continue;
      if (e.flags & 6) continue;
      list.push({ y: e.y, draw: () => this.drawSeal(ctx, id, e, false) });
    }
    if (!s.me.fired && s.me.out <= 0) {
      const meE = this.ents.get(this.myId) || {};
      list.push({ y: me.y, draw: () => this.drawSeal(ctx, this.myId, { ...meE, x: me.x, y: me.y, dir: me.dir, mv: me.mv, anim: me.anim }, true) });
    }
    for (const c of this.cats.values()) list.push({ y: c.y, draw: () => this.drawCat(ctx, c) });
    list.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
    drawOverhead(ctx, t, view);
    // 마감 직전 붉은 경광 조명
    if (s.ph === 'play' && this.mode !== 'tut' && s.tl <= (this.coop ? 45 : 120)) { ctx.fillStyle = `rgba(255,40,30,${0.06 + Math.max(0, Math.sin(t * 4)) * 0.08})`; ctx.fillRect(cx, cy, vw, vh); }

    // ---- 화면 좌표 텍스트 ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W2S = (x, y) => [Math.round((x - cx) * sc), Math.round((y - cy) * sc)];
    const fs = Math.max(11, Math.round(sc * 4.2));
    ctx.textAlign = 'center';
    // 구역/시설 라벨
    ctx.font = `${fs}px Galmuri11, sans-serif`;
    const LBL = { cut: '손질대', pack: '포장대', pc: '컴퓨터', truck: '출하 트럭', mop: '청소함', board: '주문 게시판', sofa: '휴게실 소파' };
    for (const st of STATIONS) {
      const [lx, ly] = W2S((st.x + st.w / 2) * TILE, st.y * TILE - (st.kind === 'pc' ? 8 : 6));
      if (lx < -100 || ly < -50 || lx > cv.width + 100 || ly > cv.height + 50) continue;
      if (st.kind === 'tank') {
        const u = s.f.z[st.z][0];
        label(ctx, (u ? '' : '🔒 ') + FISH[st.z].name + (u ? ' 수조' : ` · ${fmt(UNLOCK[st.z])}원`), lx, ly, u ? FISH[st.z].color : '#ffcc66');
      } else if (st.kind === 'mach') {
        const zz = s.f.z[st.z]; if (!zz[0] || !zz[1]) continue;
        ctx.font = `${Math.max(10, fs - 3)}px Galmuri11, sans-serif`;
        label(ctx, '⚠ 고장!', lx, ly, '#ff6b6b');
        ctx.font = `${fs}px Galmuri11, sans-serif`;
      } else if (st.kind === 'acut' || st.kind === 'apack') {
        const zz = s.f.z[st.z], i = st.kind === 'acut' ? 1 : 2;
        if (!zz[0] || !zz[3 + i]) continue;
        continue;
      }
    }
    ctx.font = `${fs}px Galmuri11, sans-serif`;
    // 이름표 + 말풍선 + 이모트
    for (const [id, e] of this.ents) {
      if (e.flags & 6) continue;
      const isMe = id === this.myId;
      const px = isMe ? me.x : e.x, py = isMe ? me.y : e.y;
      const [nx, ny] = W2S(px, py - 23);
      const r = this.roster.get(id);
      ctx.font = `${Math.max(10, fs - 2)}px Galmuri11, sans-serif`;
      label(ctx, (r ? r.name : '?') + (e.warn ? ' ' + '⚠'.repeat(e.warn) : ''), nx, ny, isMe ? '#ffe066' : '#ffffff');
      const b = this.bubbles.get(id);
      if (b) bubble(ctx, b.txt, nx, ny - fs * 1.4, fs);
      if (e.emote >= 0) { ctx.font = `${fs * 2}px sans-serif`; ctx.fillText(EMOTES[e.emote], nx, ny - fs * (b ? 3 : 1.2) + Math.sin(this.t * 8) * 3); }
      if (e.flags & 1) { ctx.font = `${fs * 1.4}px sans-serif`; ctx.fillText('💫', nx, ny - fs * 1.3); }
    }
    // 효과 텍스트
    ctx.font = `bold ${fs + 2}px Galmuri11, sans-serif`;
    for (const f of this.fx) {
      const [x, y] = W2S(f.x, f.y - f.t * 18);
      ctx.globalAlpha = clamp(1.4 - f.t, 0, 1);
      ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.strokeText(f.txt, x, y);
      ctx.fillStyle = f.col || '#fff'; ctx.fillText(f.txt, x, y);
    }
    ctx.globalAlpha = 1;
    // 상호작용 안내
    const it = this.curIt;
    if (it && !mgActive() && !this.pcOpen && !this.app.touch) {
      const [x, y] = W2S(me.x, me.y + 14);
      ctx.font = `${fs}px Galmuri11, sans-serif`;
      bubble(ctx, (it.run ? '[E] ' : '') + it.label, x, y + fs * 1.6, fs, it.run ? '#ffe066' : '#c9d2e0');
    }
    // 정전: 내 주변만 보이게
    if (dark) {
      const [mx, my] = W2S(me.x, me.y - 8);
      const rr = 70 * sc;
      const gr = ctx.createRadialGradient(mx, my, rr * 0.35, mx, my, rr);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(2,3,8,0.93)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, cv.width, cv.height);
    }
    // 황금 타임: 금빛 테두리
    if (s.f.ev && s.f.ev[0] === 'gold') { ctx.strokeStyle = `rgba(255,210,63,${0.35 + Math.sin(this.t * 6) * 0.2})`; ctx.lineWidth = Math.max(8, cv.width / 90); ctx.strokeRect(0, 0, cv.width, cv.height); }
    // 구매 버튼 가격표 (가까운 것만)
    ctx.font = `${Math.max(10, fs - 3)}px Galmuri11, sans-serif`;
    for (const a of this.pads) {
      const pd = a.pad, px = (pd.x + pd.w / 2) * TILE, py = (pd.y + pd.h / 2) * TILE;
      const [lx, ly] = W2S(px, py);
      if (lx < -60 || ly < -60 || lx > cv.width + 60 || ly > cv.height + 60) continue;
      ctx.font = `${Math.round(fs * (pd.w > 1 ? 1.5 : 1.1))}px sans-serif`; ctx.fillText(a.icon, lx, ly + fs * 0.4);
    }
    // 방향 화살표 (목표가 화면 밖일 때)
    if (g && g.st && this.opt.arrows && !mgActive() && !this.pcOpen) {
      const p = stationPoint(g.st);
      const [sx, sy] = W2S(p.x, p.y);
      const m = 60 * this.dpr;
      if (sx < m || sy < m || sx > cv.width - m || sy > cv.height - m) {
        const ccx = cv.width / 2, ccy = cv.height / 2, dx = sx - ccx, dy = sy - ccy;
        const k = Math.min((ccx - m) / Math.abs(dx || 1e-6), (ccy - m) / Math.abs(dy || 1e-6));
        const ax = ccx + dx * k, ay = ccy + dy * k, ang = Math.atan2(dy, dx);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        const z = 10 * this.dpr + Math.sin(this.t * 6) * 2 * this.dpr;
        ctx.fillStyle = 'rgba(12,16,28,0.85)'; ctx.beginPath(); ctx.arc(0, 0, z * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.moveTo(z * 1.6, 0); ctx.lineTo(-z * 0.6, -z); ctx.lineTo(-z * 0.2, 0); ctx.lineTo(-z * 0.6, z); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = `${fs * 1.3}px sans-serif`; ctx.fillText(g.icon || '', ax, ay - z * 2.6);
      }
    }
    // CCTV
    if (this.cctv) {
      const a = 0.35 + Math.sin(this.cctvT * 12) * 0.25;
      ctx.strokeStyle = `rgba(255,40,40,${a})`; ctx.lineWidth = Math.max(10, cv.width / 60);
      ctx.strokeRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(255,40,40,0.9)'; ctx.font = `bold ${fs * 1.6}px Galmuri11, sans-serif`; ctx.textAlign = 'left';
      const sec = Math.max(0, 2 - this.cctvT);
      ctx.fillText(`● REC  CCTV 점검! ${sec > 0 ? sec.toFixed(1) + '초' : ''}`, cv.width * 0.03, cv.height * 0.2);
      ctx.textAlign = 'center';
    }
    // 해킹 글리치
    if (s.me.hk > 0) {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `hsla(${(i * 70 + this.t * 500) % 360},90%,55%,0.18)`;
        ctx.fillRect(0, rand(0, cv.height), cv.width, rand(4, 24) * this.dpr);
      }
      ctx.fillStyle = 'rgba(0,255,120,0.9)'; ctx.font = `bold ${fs * 1.3}px Galmuri11, monospace`;
      ctx.fillText(`해킹당함! 방향 반대 ${Math.ceil(s.me.hk)}s · 컴퓨터에서 재부팅`, cv.width / 2, cv.height * 0.32);
    }
  }

  drawSeal(ctx, id, e, isMe) {
    const r = this.roster.get(id);
    const look = r ? r.look : this.me.look;
    const flags = e.flags || 0;
    let frame;
    if (flags & 1) frame = 'sleep';
    else if (e.toy === 4 && !(flags & 16)) frame = 'sleep';
    else if (e.mv) frame = 'w' + (Math.floor(e.anim) % 4);
    else frame = 'i' + (Math.floor(e.anim) % 2);
    const sp = sealSprite(look, frame);
    const x = Math.round(e.x), y = Math.round(e.y);
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 7, y - 1, 14, 2);
    ctx.save(); ctx.translate(x, y);
    if (flags & 1) ctx.rotate(e.dir > 0 ? -0.25 : 0.25);
    if (e.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(sp, -11, -SEAL_SIZE + 2);
    ctx.restore();
    if (isMe) { ctx.fillStyle = '#ffe066'; ctx.fillRect(x - 1, y - 26 + Math.round(Math.sin(this.t * 4)), 3, 2); }
    // 들고 있는 것
    if (e.hold) {
      const ht = Math.floor((e.hold - 1) / 3), hs = (e.hold - 1) % 3;
      const it = itemSprite(ht, hs);
      ctx.drawImage(it, Math.round(x - it.width / 2), Math.round(y - 20 - it.height + Math.sin(e.anim * 2)));
    }
    // 장난감
    if (e.toy && !(flags & 1)) {
      const t = this.t;
      if (e.toy === 1) { const by = y - 22 - Math.abs(Math.sin(t * 6)) * 8; ctx.fillStyle = '#fff'; ctx.fillRect(x + 3, by, 6, 6); ctx.fillStyle = '#ff5b5b'; ctx.fillRect(x + 3, by, 3, 3); ctx.fillStyle = '#3fa9f5'; ctx.fillRect(x + 6, by + 3, 3, 3); }
      if (e.toy === 2) { const k = Math.abs(Math.sin(t * 5)); ctx.fillStyle = '#ff9fcf'; ctx.fillRect(x + 4, y - 9 + k, 7, 5 - k); }
      if (e.toy === 3) { ctx.fillStyle = '#333'; ctx.fillRect(x + 3, y - 10, 9, 6); ctx.fillStyle = Math.floor(t * 6) % 2 ? '#7cf' : '#9f7'; ctx.fillRect(x + 4, y - 9, 5, 4); ctx.fillStyle = 'rgba(120,220,255,0.2)'; ctx.fillRect(x - 10, y - 22, 26, 20); }
      if (e.toy === 4) { ctx.fillStyle = '#f0f0ff'; ctx.fillRect(x - 12, y - 6, 9, 5); ctx.fillStyle = '#fff'; ctx.font = '6px sans-serif'; ctx.fillText('z', x + 6, y - 20 - (t * 4 % 4)); }
    }
  }

  drawCat(ctx, c) {
    const sp = catSprite(c.st === 1 ? Math.floor(this.t * 2) % 2 : Math.floor(this.t * 8) % 2);
    const x = Math.round(c.x), y = Math.round(c.y);
    ctx.save(); ctx.translate(x, y); if (c.dir > 0) ctx.scale(-1, 1); ctx.drawImage(sp, -8, -12); ctx.restore();
    if (c.st === 1) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y - 16, 4, 2); }
  }

  // ---------- 다음 할 일 안내 ----------
  updateGuide() {
    const s = this.s, m = s.me, f = s.f;
    let g = null;
    const meP = s.p.find((p) => p[0] === this.myId);
    const hold = meP ? meP[5] : 0;
    const ht = hold ? Math.floor((hold - 1) / 3) : -1, hs = hold ? (hold - 1) % 3 : -1;
    const x = this.me.x, y = this.me.y;
    if (s.ph !== 'play' || m.fired || m.out > 0) g = null;
    else if (m.fa > 0) g = { text: '💫 기절했어요… 잠시만요', st: null };
    else if (m.toy) g = { text: '🏐 노는 중… CCTV 사이렌이 울리면 바로 내려놔요!', st: null };
    else if (m.hk > 0) g = { text: '💻 해킹당했어요! ④ 사무 구역 컴퓨터에서 재부팅', st: STATION_BY_ID.pc, icon: '💻' };
    else if (hs === 0) g = { text: `🐟 ${FISH[ht].name}(날것) → 파란 화살표 따라 ② 손질대로`, st: nearestOf('cut', x, y), icon: '🔪' };
    else if (hs === 1) g = { text: `🔪 손질한 ${FISH[ht].name} → 초록 화살표 따라 ③ 포장대로 (포장하면 벨트가 트럭까지!)`, st: nearestOf('pack', x, y), icon: '📦' };
    else {
      const Z = f.z;
      const br = Z.findIndex((z) => z[0] && z[1]);
      const cat = Z.findIndex((z) => z[0] && z[2]);
      const full = Z.findIndex((z) => z[0] && ((z[5] && !z[6] && z[9] >= BASKET) || (z[4] && !z[5] && z[8] >= BASKET) || (z[3] && !z[4] && z[7] >= BASKET)));
      const cheap = this.pads.filter((a) => a.price <= f.m && a.pad.kind !== 'deco').sort((a, b) => a.price - b.price)[0];
      if (br >= 0) g = { text: `🔧 ${FISH[br].name} 펌프가 고장났어요! 뒤쪽 모터를 고쳐요`, st: STATION_BY_ID['mach' + br], icon: '🔧' };
      else if (cat >= 0) g = { text: `🐱 고양이가 ${FISH[cat].name} 수조에! 부딪혀서 쫓아내요`, st: STATION_BY_ID['tank' + cat], icon: '🐱' };
      else if (f.sl > 0 && distToStation(x, y, STATION_BY_ID.mop) < 200) g = { text: '🧽 바닥이 미끄러워요. 청소함에서 닦을 수 있어요', st: STATION_BY_ID.mop, icon: '🧽' };
      else if (full >= 0) { const z = Z[full], i = z[5] ? 2 : z[4] ? 1 : 0; g = { text: `⚠ ${FISH[full].name} ${['바구니', '손질기', '포장기'][i]}가 꽉 찼어요! ${i === 2 ? '벨트로 보내요' : '꺼내 가요'}`, st: STATION_BY_ID[['tank', 'acut', 'apack'][i] + full], icon: '⚠' }; }
      else {
        const manual = (z) => Z[z][0] && !Z[z][6];
        const need = f.o.filter((o) => o[3] < o[2] && manual(o[1]) && !Z[o[1]][2]).sort((a, b) => b[1] - a[1] || a[4] - b[4]);
        const src = (z) => (Z[z][3] && !Z[z][4] && Z[z][7] > 0 ? { text: `🧺 ${FISH[z].name} 바구니에서 줍기`, st: STATION_BY_ID['tank' + z] } : Z[z][4] && !Z[z][5] && Z[z][8] > 0 ? { text: `🧺 손질된 ${FISH[z].name} 꺼내기`, st: STATION_BY_ID['acut' + z] } : { text: `🎣 ① 수조에서 ${FISH[z].name} 건지기`, st: STATION_BY_ID['tank' + z] });
        if (need.length) { const o = need[0]; const q = src(o[1]); g = { text: `${q.text} (주문 ${o[3]}/${o[2]})`, st: q.st, icon: '🎣' }; }
        else {
          let top = -1; for (let z = 4; z >= 0; z--) if (manual(z)) { top = z; break; }
          if (top < 0) g = { text: '✅ 모든 라인이 자동이에요! 업그레이드와 이벤트에 집중해요', st: null };
          else { const q = src(top); g = { text: `${q.text} · 주문이 없으면 60%에 팔려요`, st: q.st, icon: '🎣' }; }
        }
        if (cheap && g) g.sub = `💰 바닥 버튼으로 ${cheap.label} 구매 가능! (${fmt(cheap.price)})`;
      }
    }
    if (this.mode !== 'tut' && this.t > 90 + 5) g = null; // 안내는 처음 90초만
    if (g) g.sub = null;
    this.guide = g;
    const key = g ? g.text + (g.sub || '') : '';
    if (key !== this.guideKey) {
      this.guideKey = key;
      const el = $('#guide');
      el.innerHTML = g ? `<b>${escapeHtml(g.text)}</b>${g.sub ? `<small>${escapeHtml(g.sub)}</small>` : ''}` : '';
    }
  }

  // ---------- 지도 ----------
  toggleMap(v) {
    this.mapOpen = v === undefined ? !this.mapOpen : v;
    $('#mapov').classList.toggle('show', this.mapOpen);
    document.body.classList.toggle('modal-open', this.mapOpen || this.pcOpen);
    if (this.mapOpen) { this.mapT = 0; this.drawMap(); audio.sfx('click'); }
  }
  drawMap() {
    const cv = $('#map-cv'), s = this.s; if (!s) return;
    const dpr = this.dpr || 1;
    const size = Math.min(window.innerWidth * 0.86, window.innerHeight * 0.8, 520);
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    const x = cv.getContext('2d');
    const R = cv.width * 0.46, ox = cv.width / 2, oy = cv.height / 2, k = R / (R_WALK + 1.5);
    const P = (tx, ty) => [ox + (tx - CX) * k, oy + (ty - CY) * k];
    x.clearRect(0, 0, cv.width, cv.height);
    x.fillStyle = '#232b3e'; x.beginPath(); x.arc(ox, oy, R + 6 * dpr, 0, Math.PI * 2); x.fill();
    SECTIONS.forEach((sec) => {
      x.fillStyle = sec.col; x.globalAlpha = 0.22;
      x.beginPath(); x.moveTo(ox, oy); x.arc(ox, oy, R, -(sec.a + 45) * Math.PI / 180, -(sec.a - 45) * Math.PI / 180); x.closePath(); x.fill();
      x.globalAlpha = 1;
    });
    x.fillStyle = '#4a4f58'; x.beginPath(); x.arc(ox, oy, 9 * k, 0, Math.PI * 2); x.fill();
    const fsz = Math.round(12 * dpr);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    SECTIONS.forEach((sec) => { const q = polar(13, sec.a); const [a, b] = P(q.x, q.y); x.font = `bold ${fsz}px Galmuri11, sans-serif`; x.fillStyle = sec.col; x.fillText(sec.n, a, b); });
    const ICON = { tank: '🎣', mach: '⚙️', cut: '🔪', pack: '📦', pc: '💻', truck: '🚚', mop: '🧽', sofa: '🛋️', board: '📋', acut: '⚙️', apack: '⚙️' };
    for (const st of STATIONS) {
      const [a, b] = P(st.x, st.y);
      let col = '#7d8794';
      if (st.kind === 'tank') col = s.f.z[st.z][0] ? FISH[st.z].color : '#444';
      if (st.kind === 'mach' && s.f.z[st.z][1]) col = '#ff3b30';
      if ((st.kind === 'acut' && !s.f.z[st.z][4]) || (st.kind === 'apack' && !s.f.z[st.z][5]) || (st.kind === 'mach' && !s.f.z[st.z][3])) continue;
      x.fillStyle = col; x.fillRect(a, b, st.w * k, st.h * k);
      if (st.kind === 'tank' && s.f.o.some((o) => o[1] === st.z && o[3] < o[2]) && Math.floor(this.t * 3) % 2) { x.strokeStyle = '#ffe066'; x.lineWidth = 3 * dpr; x.strokeRect(a - 2 * dpr, b - 2 * dpr, st.w * k + 4 * dpr, st.h * k + 4 * dpr); }
      if (ICON[st.kind] && st.kind !== 'mach') { x.font = `${Math.round(fsz * 1.2)}px sans-serif`; x.fillText(ICON[st.kind], a + st.w * k / 2, b + st.h * k / 2); }
      if (st.kind === 'mach' && s.f.z[st.z][1]) { x.font = `bold ${fsz}px sans-serif`; x.fillStyle = '#fff'; x.fillText('!', a + st.w * k / 2, b + st.h * k / 2); }
    }
    for (const c of this.cats.values()) { const [a, b] = P(c.x / TILE, c.y / TILE); x.font = `${fsz}px sans-serif`; x.fillText('🐱', a, b); }
    for (const [id, e] of this.ents) {
      if (id === this.myId || (e.flags & 6)) continue;
      const [a, b] = P(e.x / TILE, e.y / TILE); x.fillStyle = '#fff'; x.beginPath(); x.arc(a, b, 4 * dpr, 0, Math.PI * 2); x.fill();
    }
    if (!s.me.fired) {
      const [a, b] = P(this.me.x / TILE, this.me.y / TILE);
      x.fillStyle = '#ffe066'; x.strokeStyle = '#111'; x.lineWidth = 2 * dpr;
      x.beginPath(); x.arc(a, b, 6 * dpr, 0, Math.PI * 2); x.fill(); x.stroke();
      x.font = `bold ${fsz}px Galmuri11, sans-serif`; x.fillStyle = '#ffe066'; x.fillText('나', a, b - 14 * dpr);
    }
    if (this.guide && this.guide.st) {
      const st = this.guide.st; const [a, b] = P(st.x + st.w / 2, st.y - 1);
      x.font = `${Math.round(fsz * 1.4)}px sans-serif`; x.fillText('⬇', a, b - 6 * dpr + Math.sin(this.t * 6) * 3 * dpr);
    }
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    cancelMinigame();
    this.closePc();
    this.toggleMap(false);
    document.body.classList.remove('modal-open');
    this.unbind();
    $('#game').classList.remove('show');
    $('#boss').classList.remove('show');
    $('#ov').classList.remove('show');
    $('#spec').classList.remove('show');
    $('#outov').classList.remove('show');
    $('#count').classList.remove('show');
    $('#chatlog').innerHTML = '';
    $('#guide').innerHTML = '';
    $('#buy').classList.remove('show');
    $('#evbar').className = '';
  }
}

function fishIcon(i) { return ['🐟', '🐟', '🍣', '🐠', '✨'][i]; }
function shortLabel(s) { return s.replace(/ ·.*/, '').replace(/^[^\s가-힣]+\s/, '').slice(0, 6); }

function label(ctx, txt, x, y, col) {
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,12,20,0.85)'; ctx.strokeText(txt, x, y);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function bubble(ctx, txt, x, y, fs, col = '#fff') {
  const w = ctx.measureText(txt).width + fs;
  const h = fs * 1.5;
  ctx.fillStyle = 'rgba(12,16,28,0.85)';
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - h + fs * 0.35), Math.round(w), Math.round(h));
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
