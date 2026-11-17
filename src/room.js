// ===== 방(로비 + 게임 진행) — 방장 기기에서 실행 =====
import { Sim } from './sim.js';
import { createHost, loopback, workerTicker } from './net.js';
import { VERSION } from './data.js';

const BOT_NAMES = ['꾸엥봇', '뒤뚱봇', '멍물범', '말랑봇', '통통봇', '물범7호', '졸린봇', '뽀잉봇'];
const DIFF_NAMES = ['쉬움', '보통', '어려움'];
const SEND_HZ = 15;

export class Room {
  constructor({ online }) {
    this.online = online;
    this.members = new Map(); // id → {id,name,look,conn,ready,bot,diff,host}
    this.order = [];
    this.nextId = 1;
    this.settings = { mode: 'vs', minutes: 12 };
    this.state = 'lobby';
    this.sim = null;
    this.code = null;
    this.hostNet = null;
    this.stopTick = null;
    this.chatT = new Map();
  }

  async open() {
    if (this.online) {
      this.hostNet = await createHost((c) => this.onConn(c, false));
      this.code = this.hostNet.code;
    }
  }

  // 방장 본인 연결 생성 → 클라이언트 쪽 연결 반환
  localConn() {
    const [hostSide, clientSide] = loopback();
    this.onConn(hostSide, true);
    return clientSide;
  }

  onConn(c, isHost) {
    c.onMsg((m) => this.onMsg(c, m, isHost));
    c.onClose(() => this.onLeave(c));
  }

  onMsg(c, m, isHost) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (c.mid) return;
      if (m.ver !== VERSION) { c.send({ t: 'deny', reason: '게임 버전이 달라요. 새로고침 해 주세요.' }); return setTimeout(() => c.close(), 300); }
      if (this.state !== 'lobby') { c.send({ t: 'deny', reason: '이미 게임이 진행 중이에요.' }); return setTimeout(() => c.close(), 300); }
      if (this.members.size >= 8) { c.send({ t: 'deny', reason: '방이 꽉 찼어요. (최대 8명)' }); return setTimeout(() => c.close(), 300); }
      const id = this.nextId++;
      c.mid = id;
      const name = String(m.name || '물범').slice(0, 10);
      this.members.set(id, { id, name, look: sanitizeLook(m.look), conn: c, ready: isHost, bot: false, diff: 1, host: isHost });
      this.order.push(id);
      c.send({ t: 'welcome', id, code: this.code, online: this.online });
      this.broadcastLobby();
      if (!isHost) this.sysChat(`${name}님이 들어왔어요.`);
      return;
    }
    const me = this.members.get(c.mid);
    if (!me) return;
    switch (m.t) {
      case 'ready': if (this.state === 'lobby') { me.ready = !!m.v; this.broadcastLobby(); } return;
      case 'chat': {
        const now = performance.now();
        if (now - (this.chatT.get(me.id) || 0) < 900) return;
        this.chatT.set(me.id, now);
        const txt = String(m.txt || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (txt) this.broadcast({ t: 'chat', id: me.id, name: me.name, txt });
        return;
      }
      case 'look': if (this.state === 'lobby') { me.look = sanitizeLook(m.look); this.broadcastLobby(); } return;
      case 'g': if (this.sim && this.state === 'game') this.sim.handle(me.id, m.m); return;
    }
    if (!me.host) return;
    // ----- 방장 전용 -----
    switch (m.t) {
      case 'cfg':
        if (this.state !== 'lobby') return;
        if (['vs', 'coop', 'inf'].includes(m.mode)) this.settings.mode = m.mode;
        if ([8, 12, 15].includes(m.minutes)) this.settings.minutes = m.minutes;
        this.broadcastLobby();
        return;
      case 'addbot': {
        if (this.state !== 'lobby' || this.members.size >= 8) return;
        const id = this.nextId++;
        const used = new Set([...this.members.values()].map((x) => x.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) || '봇' + id;
        const diff = Math.max(0, Math.min(2, m.diff | 0));
        this.members.set(id, { id, name, look: { fur: id % 5, hat: id % 6, acc: id % 5 }, conn: null, ready: true, bot: true, diff, host: false });
        this.order.push(id);
        this.broadcastLobby();
        return;
      }
      case 'kick': {
        const x = this.members.get(m.id);
        if (!x || x.host || this.state !== 'lobby') return;
        if (x.conn) { x.conn.send({ t: 'deny', reason: '방장이 내보냈어요.' }); setTimeout(() => x.conn.close(), 200); }
        this.removeMember(x.id);
        return;
      }
      case 'start': this.start(m.mode); return;
    }
  }

  removeMember(id) {
    this.members.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.broadcastLobby();
  }

  onLeave(c) {
    const me = this.members.get(c.mid);
    if (!me) return;
    if (me.host) { this.close(); return; }
    if (this.state === 'game' && this.sim) this.sim.removePlayer(me.id);
    this.members.delete(me.id);
    this.order = this.order.filter((x) => x !== me.id);
    this.sysChat(`${me.name}님이 나갔어요.`);
    if (this.state === 'lobby') this.broadcastLobby();
  }

  lobbyState() {
    return {
      t: 'lobby', code: this.code, online: this.online, settings: this.settings, state: this.state,
      members: this.order.map((id) => this.members.get(id)).filter(Boolean).map((x) => ({ id: x.id, name: x.name, look: x.look, ready: x.ready, bot: x.bot, diff: x.diff, diffName: DIFF_NAMES[x.diff], host: x.host })),
    };
  }
  broadcastLobby() { this.broadcast(this.lobbyState()); }
  broadcast(o) { for (const x of this.members.values()) if (x.conn) x.conn.send(o); }
  sysChat(txt) { this.broadcast({ t: 'chat', id: 0, name: '', txt }); }

  start(modeOverride) {
    if (this.state !== 'lobby') return;
    const ms = this.order.map((id) => this.members.get(id)).filter(Boolean);
    const mode = modeOverride || this.settings.mode;
    if (mode !== 'tut' && ms.some((x) => !x.ready && !x.bot)) return this.sysChat('아직 준비 안 된 물범이 있어요.');
    this.state = 'game';
    const players = ms.map((x) => ({ id: x.id, name: x.name, look: x.look, bot: x.bot, diff: x.diff }));
    this.sim = new Sim({ mode, minutes: this.settings.minutes, players });
    const roster = [...this.sim.players.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, bot: p.bot, fi: p.fi }));
    this.broadcast({ t: 'start', mode, minutes: this.settings.minutes, roster });
    let last = performance.now(), sendAcc = 0, ended = false;
    this.stopTick && this.stopTick();
    this.stopTick = workerTicker(50, () => {
      const now = performance.now();
      let dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      while (dt > 0) { const s = Math.min(0.05, dt); this.sim.tick(s); dt -= s; }
      sendAcc += (now - (this._lastSend || now)) / 1000;
      this._lastSend = now;
      if (sendAcc >= 1 / SEND_HZ || this.sim.phase === 'end') {
        sendAcc = 0;
        for (const x of this.members.values()) {
          if (!x.conn) continue;
          const s = this.sim.snapshot(x.id);
          if (s) x.conn.send({ t: 's', s });
        }
        this.sim.clearEvents();
      }
      if (this.sim.phase === 'end' && !ended) {
        ended = true;
        const r = this.sim.result;
        setTimeout(() => {
          this.broadcast({ t: 'end', r });
          this.finishGame();
        }, 2500);
      }
    });
  }

  finishGame() {
    this.stopTick && this.stopTick();
    this.stopTick = null;
    this.sim = null;
    this.state = 'lobby';
    for (const x of this.members.values()) if (!x.bot) x.ready = x.host;
    this.broadcastLobby();
  }

  close() {
    this.stopTick && this.stopTick();
    for (const x of this.members.values()) if (x.conn && !x.host) { x.conn.send({ t: 'closed' }); }
    setTimeout(() => {
      for (const x of this.members.values()) if (x.conn) x.conn.close();
      this.hostNet && this.hostNet.destroy();
    }, 200);
    this.members.clear();
  }
}

function sanitizeLook(l) {
  l = l || {};
  return { fur: clampInt(l.fur, 0, 4), hat: clampInt(l.hat, 0, 5), acc: clampInt(l.acc, 0, 4) };
}
function clampInt(v, a, b) { v = v | 0; return v < a ? a : v > b ? b : v; }
