// ===== 네트워크 전송 계층 =====
// PeerJS(WebRTC P2P) / BroadcastChannel(테스트용) / 루프백(방장 본인)
import { Peer } from 'peerjs';
import { makeRoomCode } from './util.js';

const PREFIX = 'sillyseal-ff-v1-';
const useBC = () => /[?&]net=bc/.test(location.search);

function wrapConn(sendFn, closeFn) {
  const c = {
    id: null, _msg: null, _close: null, open: true,
    send(o) { if (c.open) { try { sendFn(o); } catch { /* 무시 */ } } },
    onMsg(cb) { c._msg = cb; },
    onClose(cb) { c._close = cb; },
    close() { if (!c.open) return; c.open = false; try { closeFn && closeFn(); } catch { /* 무시 */ } c._close && c._close(); },
    _recv(o) { c._msg && c._msg(o); },
    _closed() { if (!c.open) return; c.open = false; c._close && c._close(); },
  };
  return c;
}

// 방장 본인용 루프백 연결 쌍
export function loopback() {
  let a, b;
  a = wrapConn((o) => queueMicrotask(() => b._recv(o)), () => queueMicrotask(() => b._closed()));
  b = wrapConn((o) => queueMicrotask(() => a._recv(o)), () => queueMicrotask(() => a._closed()));
  return [a, b];
}

// ---------- 호스트 ----------
export function createHost(onConn) {
  if (useBC()) return createBCHost(onConn);
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = makeRoomCode();
      const peer = new Peer(PREFIX + code, { debug: 0 });
      let opened = false;
      peer.on('open', () => {
        opened = true;
        resolve({ code, destroy: () => { try { peer.destroy(); } catch { /* 무시 */ } } });
      });
      peer.on('connection', (dc) => {
        const c = wrapConn((o) => dc.send(o), () => dc.close());
        dc.on('open', () => onConn(c));
        dc.on('data', (d) => c._recv(d));
        dc.on('close', () => c._closed());
        dc.on('error', () => c._closed());
      });
      peer.on('disconnected', () => { if (opened) { try { peer.reconnect(); } catch { /* 무시 */ } } });
      peer.on('error', (e) => {
        if (!opened) {
          try { peer.destroy(); } catch { /* 무시 */ }
          if (e.type === 'unavailable-id' && tries++ < 5) attempt();
          else reject(new Error(netErr(e)));
        }
      });
    };
    attempt();
  });
}

// ---------- 클라이언트 ----------
export function joinHost(code) {
  if (useBC()) return joinBC(code);
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    let done = false;
    const fail = (msg) => { if (done) return; done = true; try { peer.destroy(); } catch { /* 무시 */ } reject(new Error(msg)); };
    const timer = setTimeout(() => fail('연결 시간이 초과됐어요. 방 코드를 확인해 주세요.'), 12000);
    peer.on('open', () => {
      const dc = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      const c = wrapConn((o) => dc.send(o), () => { dc.close(); setTimeout(() => peer.destroy(), 300); });
      dc.on('open', () => { if (done) return; done = true; clearTimeout(timer); resolve(c); });
      dc.on('data', (d) => c._recv(d));
      dc.on('close', () => c._closed());
      dc.on('error', () => c._closed());
    });
    peer.on('error', (e) => { clearTimeout(timer); fail(netErr(e)); });
  });
}

function netErr(e) {
  switch (e && e.type) {
    case 'peer-unavailable': return '방을 찾을 수 없어요. 방 코드를 확인해 주세요.';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return '연결 서버에 접속할 수 없어요. 인터넷 연결을 확인해 주세요.';
    case 'browser-incompatible': return '이 브라우저는 멀티플레이를 지원하지 않아요.';
    default: return '연결에 실패했어요. 잠시 후 다시 시도해 주세요.';
  }
}

// ---------- BroadcastChannel (같은 브라우저 탭끼리 테스트용) ----------
function createBCHost(onConn) {
  const code = makeRoomCode();
  const bc = new BroadcastChannel('ssff-' + code);
  const conns = new Map();
  bc.onmessage = (ev) => {
    const m = ev.data;
    if (m.k === 'hello') {
      const c = wrapConn((o) => bc.postMessage({ k: 'msg', to: m.from, d: o }), () => bc.postMessage({ k: 'bye', to: m.from }));
      conns.set(m.from, c);
      bc.postMessage({ k: 'welcome', to: m.from });
      onConn(c);
    } else if (m.k === 'msg' && m.to === 'host') { const c = conns.get(m.from); c && c._recv(m.d); }
    else if (m.k === 'bye' && m.to === 'host') { const c = conns.get(m.from); c && c._closed(); conns.delete(m.from); }
  };
  return Promise.resolve({ code, destroy: () => { for (const c of conns.values()) c.close(); bc.close(); } });
}
function joinBC(code) {
  return new Promise((resolve, reject) => {
    const me = Math.random().toString(36).slice(2);
    const bc = new BroadcastChannel('ssff-' + code);
    let c = null;
    const timer = setTimeout(() => { bc.close(); reject(new Error('방을 찾을 수 없어요.')); }, 3000);
    bc.onmessage = (ev) => {
      const m = ev.data;
      if (m.to !== me) return;
      if (m.k === 'welcome') {
        clearTimeout(timer);
        c = wrapConn((o) => bc.postMessage({ k: 'msg', from: me, to: 'host', d: o }), () => { bc.postMessage({ k: 'bye', from: me, to: 'host' }); bc.close(); });
        resolve(c);
      } else if (m.k === 'msg' && c) c._recv(m.d);
      else if (m.k === 'bye' && c) c._closed();
    };
    bc.postMessage({ k: 'hello', from: me });
  });
}

// 백그라운드 탭에서도 멈추지 않는 타이머 (워커 기반)
export function workerTicker(ms, cb) {
  try {
    const src = `let i=setInterval(()=>postMessage(0),${ms});onmessage=()=>{clearInterval(i);close()}`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = cb;
    return () => w.postMessage(0);
  } catch {
    const i = setInterval(cb, ms);
    return () => clearInterval(i);
  }
}
