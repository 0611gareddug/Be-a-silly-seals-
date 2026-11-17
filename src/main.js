// ===== 앱 진입점: 화면 전환 · 메뉴 · 로비 · 결과 =====
/* global __DEV__ */
import './protect.js';
import { VERSION, FUR, HATS, ACCS } from './data.js';
import { store, escapeHtml, fmt, ROOM_CHARS } from './util.js';
import { sealSprite, makeCanvas } from './sprites.js';
import { audio } from './audio.js';
import { Room } from './room.js';
import { joinHost } from './net.js';
import { Game } from './game.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

class App {
  constructor() {
    this.name = store.get('name', '');
    this.look = store.get('look', { fur: 0, hat: 0, acc: 0 });
    this.coins = store.get('coins', 0);
    this.owned = store.get('owned', { fur: [0], hat: [0], acc: [0] });
    this.infOpen = store.get('infOpen', false);
    this.tutDone = store.get('tutDone', false);
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    document.body.classList.toggle('touch', this.touch);
    this.room = null; this.conn = null; this.myId = 0; this.game = null; this.lobby = null; this.single = null; this.leaving = false;
    this.pendingRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    this.bind();
    this.titleAnim();
    this.show('s-title');
  }

  show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
    this.cur = id;
    if (id === 's-menu') this.renderMenu();
    if (id === 's-custom') this.renderCustom();
    if (id === 's-single') this.renderSingle();
    if (id === 's-lobby') this.renderLobby();
    if (id === 's-settings') { $('#set-bgm').value = Math.round(audio.bgmVol * 100); $('#set-sfx').value = Math.round(audio.sfxVol * 100); }
    if (['s-title', 's-menu', 's-name', 's-single', 's-join', 's-custom', 's-settings', 's-lobby', 's-result'].includes(id)) audio.bgm('title');
  }

  toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), ms);
  }
  confirm(msg) {
    return new Promise((res) => {
      $('#cf-txt').textContent = msg; $('#confirm').classList.add('show');
      const done = (v) => { $('#confirm').classList.remove('show'); $('#cf-yes').onclick = $('#cf-no').onclick = null; res(v); };
      $('#cf-yes').onclick = () => done(true); $('#cf-no').onclick = () => done(false);
    });
  }

  bind() {
    $('#s-title').addEventListener('click', () => {
      audio.unlock(); audio.sfx('seal');
      this.tryFullscreenHint();
      if (!this.name) this.show('s-name');
      else if (this.pendingRoom) this.goJoin(this.pendingRoom);
      else this.show('s-menu');
    });
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => { audio.sfx('click'); this.show('s-' + b.dataset.go); }));
    // 이름
    const nameOk = () => {
      const v = $('#name-in').value.replace(/\s+/g, ' ').trim().slice(0, 10);
      if (!v) { this.toast('이름을 입력해 주세요'); return; }
      this.name = v; store.set('name', v); audio.sfx('ok');
      if (this.pendingRoom) this.goJoin(this.pendingRoom); else this.show('s-menu');
    };
    $('#name-ok').addEventListener('click', nameOk);
    $('#name-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') nameOk(); });
    $('#menu-rename').addEventListener('click', () => { $('#name-in').value = this.name; this.show('s-name'); });
    $('#btn-host').addEventListener('click', () => this.host(true));
    // 혼자 하기
    this.sgMode = 'vs';
    $$('#s-single .opt').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; this.sgMode = b.dataset.mode; audio.sfx('click'); this.renderSingle(); }));
    $('#sg-start').addEventListener('click', () => this.startSingle());
    // 참가
    const joinOk = () => {
      const code = $('#join-in').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6 || [...code].some((c) => !ROOM_CHARS.includes(c))) { $('#join-err').textContent = '6자리 코드를 정확히 입력해 주세요'; return; }
      this.goJoin(code);
    };
    $('#join-ok').addEventListener('click', joinOk);
    $('#join-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinOk(); });
    // 로비
    $('#lb-copy').addEventListener('click', () => this.copyInvite());
    $('#lb-leave').addEventListener('click', async () => { if (await this.confirm('방에서 나갈까요?')) this.leave(); });
    $('#lb-main-btn').addEventListener('click', () => this.lobbyMain());
    const sendChat = () => { const i = $('#lb-chat-in'); const v = i.value.trim(); if (v && this.conn) this.conn.send({ t: 'chat', txt: v }); i.value = ''; };
    $('#lb-chat-send').addEventListener('click', sendChat);
    $('#lb-chat-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
    $('#lb-members').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !this.conn) return;
      if (b.dataset.bot !== undefined) this.conn.send({ t: 'addbot', diff: +b.dataset.bot });
      if (b.dataset.kick) this.conn.send({ t: 'kick', id: +b.dataset.kick });
      audio.sfx('click');
    });
    $('#lb-cfg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled || !this.conn) return;
      if (b.dataset.mode) this.conn.send({ t: 'cfg', mode: b.dataset.mode });
      if (b.dataset.min) this.conn.send({ t: 'cfg', minutes: +b.dataset.min });
      audio.sfx('click');
    });
    // 꾸미기
    this.cuTab = 'fur';
    $$('#cu-tabs button').forEach((b) => b.addEventListener('click', () => { this.cuTab = b.dataset.t; $$('#cu-tabs button').forEach((x) => x.classList.toggle('on', x === b)); this.renderCustom(); }));
    $('#cu-items').addEventListener('click', (e) => { const b = e.target.closest('.cu-item'); if (b) this.cuPick(+b.dataset.i); });
    // 설정
    $('#set-bgm').addEventListener('input', (e) => audio.setBgmVol(e.target.value / 100));
    $('#set-sfx').addEventListener('input', (e) => { audio.setSfxVol(e.target.value / 100); });
    $('#set-sfx').addEventListener('change', () => audio.sfx('coin'));
    // 결과
    $('#rs-menu').addEventListener('click', () => this.leave());
    $('#rs-again').addEventListener('click', () => {
      if (this.single) this.startSingle(true);
      else this.show('s-lobby');
    });
    // 상단 버튼
    $('#btn-mute').addEventListener('click', () => { const m = audio.toggleMute(); $('#btn-mute').textContent = m ? '🔇' : '🔊'; });
    $('#btn-mute').textContent = audio.muted ? '🔇' : '🔊';
    $('#btn-fs').addEventListener('click', () => this.toggleFs());
    $('#btn-exit').addEventListener('click', async () => {
      if (await this.confirm(this.room && this.room.online ? '게임에서 나갈까요? 방장이 나가면 모두의 게임이 끝나요.' : '게임에서 나갈까요?')) this.leave();
    });
    $('#rotate-ok').addEventListener('click', () => { this.rotateOk = true; $('#rotate').classList.remove('show'); });
    window.addEventListener('resize', () => this.checkRotate());
    document.addEventListener('visibilitychange', () => audio.pauseAll(document.hidden));
    window.addEventListener('beforeunload', () => { if (this.conn) this.conn.close(); });
  }

  // ---------- 전체 화면 ----------
  toggleFs() {
    const d = document, el = d.documentElement;
    const on = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (on) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else {
        const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (p && p.then) p.then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch { /* 무시 */ } }).catch(() => {});
      }
    } catch { this.toast('이 브라우저는 전체 화면을 지원하지 않아요'); }
  }
  tryFullscreenHint() { if (this.touch && !this._fsHint) { this._fsHint = true; this.toast('⛶ 버튼으로 전체 화면을 켤 수 있어요'); } }
  checkRotate() {
    const r = $('#rotate');
    r.classList.toggle('show', this.touch && !this.rotateOk && !!this.game && window.innerHeight > window.innerWidth);
  }

  // ---------- 타이틀 애니메이션 ----------
  titleAnim() {
    const cv = $('#title-cv'), ctx = cv.getContext('2d');
    const seals = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * 400, sp: 10 + Math.random() * 14, look: { fur: i % 5, hat: (i * 2) % 6, acc: i % 5 }, row: i % 3, a: Math.random() * 4 }));
    let last = performance.now();
    const loop = (now) => {
      if (this.cur !== 's-title') { requestAnimationFrame(loop); last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const sc = Math.max(2, Math.round(H / 180));
      const vw = W / sc, vh = H / sc;
      ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.imageSmoothingEnabled = false;
      // 하늘
      const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, '#1b2b55'); g.addColorStop(0.6, '#3a5a9a'); g.addColorStop(1, '#5d86c4');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
      // 바다
      const sea = vh * 0.62;
      ctx.fillStyle = '#1f5c8f'; ctx.fillRect(0, sea, vw, vh - sea);
      for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(((i * 47 + now / 60) % (vw + 20)) - 10, sea + 4 + (i % 6) * 9, 8, 1); }
      // 공장
      const fx = vw * 0.5 - 60, fy = sea - 64;
      ctx.fillStyle = '#28314a'; ctx.fillRect(fx, fy + 20, 120, 44);
      ctx.fillStyle = '#3b4766'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(fx + i * 30, fy + 20); ctx.lineTo(fx + i * 30 + 30, fy + 8); ctx.lineTo(fx + i * 30 + 30, fy + 20); ctx.fill(); }
      ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 5; i++) ctx.fillRect(fx + 10 + i * 22, fy + 34, 10, 8);
      ctx.fillStyle = '#4b5778'; ctx.fillRect(fx + 96, fy - 16, 12, 36);
      // 물고기 연기
      for (let i = 0; i < 4; i++) {
        const k = ((now / 2600) + i / 4) % 1;
        ctx.globalAlpha = 1 - k; ctx.fillStyle = '#dfe6f5';
        const sx = fx + 102 + k * 40, sy = fy - 20 - k * 50;
        ctx.fillRect(sx, sy, 8, 4); ctx.fillRect(sx - 3, sy - 1, 3, 6);
      }
      ctx.globalAlpha = 1;
      // 부두 + 물범
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(0, sea - 2, vw, 6);
      for (const s of seals) {
        s.x += s.sp * dt; s.a += dt * 8;
        if (s.x > vw + 20) s.x = -20;
        const sp = sealSprite(s.look, 'w' + (Math.floor(s.a) % 4));
        ctx.drawImage(sp, Math.round(s.x), Math.round(vh - 30 - s.row * 14));
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------- 메뉴 ----------
  renderMenu() {
    $('#menu-name').textContent = this.name;
    $('#menu-coins').textContent = fmt(this.coins);
    drawSeal($('#menu-seal'), this.look, 4);
    if (!this.tutDone && !this._tutHint) { this._tutHint = true; setTimeout(() => { if (this.cur === 's-menu') this.toast('처음이라면 혼자 하기 → 튜토리얼을 추천해요!', 3500); }, 400); }
  }
  renderSingle() {
    $$('#s-single .opt').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === this.sgMode);
      if (b.dataset.mode === 'inf') b.disabled = !this.infOpen;
    });
    $('#inf-lock').textContent = this.infOpen ? '끝없이 이어지는 협동' : '🔒 협동 금요일을 클리어하면 열려요';
    const sel = $('#sg-bots');
    const minB = this.sgMode === 'vs' ? 1 : 0;
    const prev = +sel.value || (this.sgMode === 'vs' ? 3 : 1);
    sel.innerHTML = '';
    for (let i = minB; i <= 7; i++) sel.innerHTML += `<option value="${i}">${i}명</option>`;
    sel.value = String(Math.max(minB, prev));
    const tut = this.sgMode === 'tut';
    $('.single-cfg').style.visibility = tut ? 'hidden' : 'visible';
    $('#sg-min-wrap').style.display = this.sgMode === 'vs' ? '' : 'none';
  }

  // ---------- 연결 ----------
  async host(online) {
    if (this.busy) return;
    this.busy = true;
    this.single = null;
    if (online) this.toast('방을 만드는 중…', 8000);
    try {
      this.room = new Room({ online });
      await this.room.open();
      this.attach(this.room.localConn());
      $('#toast').classList.remove('show');
    } catch (e) {
      this.room = null;
      this.toast(e.message || '방을 만들 수 없어요');
    }
    this.busy = false;
  }

  async startSingle(again) {
    const mode = again && this.single ? this.single.mode : this.sgMode;
    const bots = again && this.single ? this.single.bots : +$('#sg-bots').value;
    const diff = again && this.single ? this.single.diff : +$('#sg-diff').value;
    const minutes = again && this.single ? this.single.minutes : +$('#sg-min').value;
    this.cleanup();
    await this.host(false);
    if (!this.conn) return;
    this.single = { mode, bots, diff, minutes };
    const c = this.conn;
    if (mode !== 'tut') {
      c.send({ t: 'cfg', mode, minutes });
      for (let i = 0; i < bots; i++) c.send({ t: 'addbot', diff });
    }
    c.send({ t: 'start', mode });
  }

  async goJoin(code) {
    this.show('s-join');
    $('#join-in').value = code;
    $('#join-err').textContent = '';
    if (this.busy) return;
    this.busy = true;
    $('#join-ok').disabled = true;
    this.toast('방에 연결하는 중…', 12000);
    try {
      const c = await joinHost(code);
      this.single = null;
      this.attach(c);
      $('#toast').classList.remove('show');
      this.pendingRoom = '';
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      $('#toast').classList.remove('show');
      $('#join-err').textContent = e.message;
    }
    $('#join-ok').disabled = false;
    this.busy = false;
  }

  attach(c) {
    this.conn = c; this.leaving = false;
    c.onMsg((m) => this.onMsg(m));
    c.onClose(() => {
      if (this.conn !== c) return;
      const was = !this.leaving;
      this.cleanup(true);
      if (was) { this.show('s-menu'); this.toast('연결이 끊겼어요. (방장이 나갔을 수 있어요)', 3500); }
    });
    c.send({ t: 'hello', name: this.name, look: this.look, ver: VERSION });
  }

  onMsg(m) {
    switch (m.t) {
      case 'welcome':
        this.myId = m.id; this.lobbyChat = [];
        $('#lb-chat').innerHTML = '';
        if (!this.single) this.show('s-lobby');
        break;
      case 'lobby': this.lobby = m; if (this.cur === 's-lobby') this.renderLobby(); break;
      case 'deny': this.leaving = true; this.toast(m.reason, 3500); this.cleanup(); this.show('s-menu'); break;
      case 'closed': this.leaving = true; this.toast('방장이 방을 닫았어요.', 3500); this.cleanup(); this.show('s-menu'); break;
      case 'chat':
        if (this.game) this.game.onChat(m);
        this.lobbyChatAdd(m);
        break;
      case 'start':
        if (this.game) this.game.destroy();
        $$('.screen').forEach((s) => s.classList.remove('show'));
        this.cur = 'game';
        document.body.classList.add('ingame');
        $('#toast').classList.remove('show');
        this.game = new Game(this, this.conn, this.myId, m);
        this.checkRotate();
        break;
      case 's': if (this.game) this.game.onSnap(m.s); break;
      case 'end': this.onEnd(m.r); break;
    }
  }

  lobbyChatAdd(m) {
    const log = $('#lb-chat');
    const d = document.createElement('div');
    d.innerHTML = m.id ? `<b>${escapeHtml(m.name)}</b>${escapeHtml(m.txt)}` : `<i>${escapeHtml(m.txt)}</i>`;
    log.appendChild(d);
    while (log.children.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  renderLobby() {
    const L = this.lobby; if (!L) return;
    const me = L.members.find((x) => x.id === this.myId);
    const isHost = me && me.host;
    $('#lb-code').textContent = L.online ? L.code : '혼자';
    $('#lb-copy').style.display = L.online ? '' : 'none';
    let h = '';
    for (const x of L.members) {
      h += `<div class="mem">${x.host ? '<span class="crown">👑</span>' : ''}${isHost && !x.host ? `<button class="kick" data-kick="${x.id}">✕</button>` : ''}<canvas width="44" height="44" data-look="${x.look.fur},${x.look.hat},${x.look.acc}"></canvas><b>${escapeHtml(x.name)}</b>${x.bot ? `<small>🤖 봇 · ${x.diffName}</small>` : x.ready ? '<span class="rdy">✔ 준비</span>' : '<span class="nrdy">대기 중</span>'}</div>`;
    }
    for (let i = L.members.length; i < 8; i++) {
      h += `<div class="mem empty">${isHost && i === L.members.length ? '<small>🤖 봇 추가</small><button data-bot="0">쉬움</button><button data-bot="1">보통</button><button data-bot="2">어려움</button>' : `<small>빈 자리</small>${L.online ? '<small>초대 링크로 친구를 불러요</small>' : ''}`}</div>`;
    }
    $('#lb-members').innerHTML = h;
    $$('#lb-members canvas').forEach((cv) => { const [f, ha, a] = cv.dataset.look.split(',').map(Number); drawSeal(cv, { fur: f, hat: ha, acc: a }, 2); });
    const S = L.settings;
    const dis = isHost ? '' : 'disabled';
    let c = `<div class="cfg-row"><span>모드</span>`;
    c += `<button class="seg ${S.mode === 'vs' ? 'on' : ''}" data-mode="vs" ${dis}>⚔️ 경쟁</button>`;
    c += `<button class="seg ${S.mode === 'coop' ? 'on' : ''}" data-mode="coop" ${dis}>🤝 협동</button>`;
    c += `<button class="seg ${S.mode === 'inf' ? 'on' : ''}" data-mode="inf" ${isHost && this.infOpen ? '' : 'disabled'}>♾️ 협동 무한${this.infOpen ? '' : ' 🔒'}</button></div>`;
    if (S.mode === 'vs') {
      c += `<div class="cfg-row"><span>시간</span>${[8, 12, 15].map((m) => `<button class="seg ${S.minutes === m ? 'on' : ''}" data-min="${m}" ${dis}>${m}분</button>`).join('')}</div>`;
    }
    c += `<p class="muted tiny">${S.mode === 'vs' ? '각자 공장에서 일하고, 컴퓨터로 서로 방해할 수 있어요. 끝까지 해고되지 않고 가장 많이 번 물범이 승리!' : '한 공장을 함께 운영해요. 매일 목표 실적을 채워야 해요.'}</p>`;
    $('#lb-cfg').innerHTML = c;
    const btn = $('#lb-main-btn');
    if (isHost) {
      const allReady = L.members.every((x) => x.ready || x.bot);
      btn.textContent = L.members.length < 2 && S.mode === 'vs' ? '시작 (봇을 추가해 보세요)' : allReady ? '게임 시작!' : '모두 준비하면 시작할 수 있어요';
      btn.disabled = !allReady;
    } else {
      btn.disabled = false;
      btn.textContent = me && me.ready ? '준비 취소' : '준비';
    }
  }
  lobbyMain() {
    const L = this.lobby; if (!L || !this.conn) return;
    const me = L.members.find((x) => x.id === this.myId);
    audio.sfx('click');
    if (me && me.host) this.conn.send({ t: 'start' });
    else this.conn.send({ t: 'ready', v: !(me && me.ready) });
  }
  copyInvite() {
    const url = location.origin + location.pathname + '?room=' + (this.lobby ? this.lobby.code : '');
    const done = () => this.toast('초대 링크를 복사했어요!');
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done).catch(() => this.toast(url, 6000));
    else this.toast(url, 6000);
  }

  // ---------- 결과 ----------
  onEnd(r) {
    if (this.game) { this.game.destroy(); this.game = null; }
    document.body.classList.remove('ingame');
    $('#rotate').classList.remove('show');
    let coins = 0;
    const meR = r.rank.find((x) => x.id === this.myId);
    if (r.mode === 'tut') {
      if (!this.tutDone) { coins = 50; this.tutDone = true; store.set('tutDone', true); }
      $('#rs-title').textContent = '📘 튜토리얼 완료!';
      $('#rs-sub').textContent = '이제 진짜 공장으로 출근할 시간이에요.';
    } else if (r.mode === 'vs') {
      const rank = meR ? meR.rank : 9;
      coins = 20 + ([100, 60, 40][rank - 1] || 0);
      $('#rs-title').textContent = rank === 1 ? '🏆 이번 달 우수 사원!' : meR && meR.fired ? '🚫 해고당했어요…' : `${rank}위`;
      $('#rs-sub').textContent = '경쟁 모드 결과';
      if (rank === 1) audio.sfx('win');
    } else {
      const extra = Math.max(0, r.daysCleared - 5);
      coins = 20 * Math.min(5, r.daysCleared) + (r.cleared || r.daysCleared >= 5 ? 100 : 0) + extra * 10;
      if (r.daysCleared >= 5 && !this.infOpen) { this.infOpen = true; store.set('infOpen', true); this.toast('♾️ 협동 무한 모드가 열렸어요!', 3500); }
      $('#rs-title').textContent = r.cleared ? '🎉 금요일까지 버텼다!' : `${r.day <= 5 ? ['월', '화', '수', '목', '금'][r.day - 1] + '요일' : r.day + '일차'}에 문을 닫았어요`;
      $('#rs-sub').textContent = `${r.daysCleared}일 클리어 · 총 실적 ${fmt(r.total)}${r.cleared ? '' : ` · 마지막 날 ${fmt(Math.max(0, r.dayEarned))} / ${fmt(r.target)}`}`;
      if (r.cleared) audio.sfx('win');
    }
    this.coins += coins; store.set('coins', this.coins);
    $('#rs-coins').textContent = coins ? `🪙 꾸미기 코인 +${coins}` : '';
    $('#rs-list').innerHTML = r.rank.map((x) => {
      const s = x.stats || {};
      return `<div class="rs-row r${x.rank}${x.id === this.myId ? ' me' : ''}"><div class="rs-rank">${r.mode === 'vs' ? x.rank : ''}</div><canvas width="44" height="44" data-look="${x.look.fur},${x.look.hat},${x.look.acc}"></canvas><div class="rs-info"><b>${escapeHtml(x.name)}${x.bot ? ' 🤖' : ''}${x.fired ? ' 🚫' : ''}</b><small>주문 ${s.orders || 0}건 · 출하 ${s.fish || 0}마리 · CCTV 적발 ${s.caught || 0}회${r.mode === 'vs' ? ` · 방해 ${s.sabSent || 0}/${s.sabRecv || 0}` : ''}</small></div><div class="rs-amt">${fmt(x.earned)}</div></div>`;
    }).join('');
    $$('#rs-list canvas').forEach((cv) => { const [f, h, a] = cv.dataset.look.split(',').map(Number); drawSeal(cv, { fur: f, hat: h, acc: a }, 2); });
    $('#rs-again').textContent = this.single ? '다시 하기' : '로비로';
    $('#rs-list').style.display = r.mode === 'tut' ? 'none' : '';
    this.show('s-result');
  }

  // ---------- 꾸미기 ----------
  renderCustom() {
    $('#cu-coins').textContent = fmt(this.coins);
    drawSeal($('#cu-seal'), this.look, 8);
    const list = this.cuTab === 'fur' ? FUR : this.cuTab === 'hat' ? HATS : ACCS;
    const owned = this.owned[this.cuTab];
    $('#cu-items').innerHTML = list.map((it, i) => {
      const own = owned.includes(i), eq = this.look[this.cuTab] === i;
      const tag = eq ? '착용 중' : own ? '보유' : `🪙 ${fmt(it.price)}`;
      return `<button class="cu-item${eq ? ' eq' : ''}${!own && this.coins < it.price ? ' no' : ''}" data-i="${i}"><canvas width="22" height="22"></canvas>${it.name}<small>${tag}</small></button>`;
    }).join('');
    $$('#cu-items canvas').forEach((cv, i) => { const l = { ...this.look, [this.cuTab]: i }; drawSeal(cv, l, 1); });
  }
  cuPick(i) {
    const list = this.cuTab === 'fur' ? FUR : this.cuTab === 'hat' ? HATS : ACCS;
    const owned = this.owned[this.cuTab];
    if (!owned.includes(i)) {
      if (this.coins < list[i].price) { this.toast('코인이 부족해요'); audio.sfx('fail'); return; }
      this.coins -= list[i].price; owned.push(i);
      store.set('coins', this.coins); store.set('owned', this.owned);
      audio.sfx('upgrade');
    } else audio.sfx('click');
    this.look[this.cuTab] = i;
    store.set('look', this.look);
    this.renderCustom();
  }

  // ---------- 종료 ----------
  cleanup(fromClose) {
    if (this.game) { this.game.destroy(); this.game = null; }
    document.body.classList.remove('ingame');
    $('#rotate').classList.remove('show');
    const c = this.conn; this.conn = null;
    if (c && !fromClose) { this.leaving = true; c.close(); }
    if (this.room) { this.room.close(); this.room = null; }
    this.lobby = null;
  }
  leave() { this.leaving = true; this.single = null; this.cleanup(); this.show('s-menu'); }
}

function drawSeal(cv, look, scale) {
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const sp = sealSprite(look, 'i0');
  const s = Math.max(1, Math.floor(Math.min(cv.width, cv.height) / sp.width)) || scale;
  ctx.drawImage(sp, Math.round((cv.width - sp.width * s) / 2), Math.round((cv.height - sp.height * s) / 2), sp.width * s, sp.height * s);
}
export { makeCanvas };

function boot() {
  const go = () => { const a = new App(); if (__DEV__) window.__app = a; };
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load('16px Galmuri11'), new Promise((r) => setTimeout(r, 1500))]).then(go, go);
  else go();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
