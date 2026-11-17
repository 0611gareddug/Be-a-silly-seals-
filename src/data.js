// ===== 게임 데이터 / 상수 =====
export const VERSION = 2;
export const TILE = 16;
export const SPEED = 132; // 이동 속도(px/초)
export const HOLD_SPEED = 0.82; // 물건을 들었을 때 속도 배율
export const MAP_W = 76;
export const MAP_H = 64;

export const FISH = [
  { name: '멸치', price: 80, color: '#b8c8dc', dark: '#6f86a3', len: 6 },
  { name: '고등어', price: 250, color: '#5f8fc9', dark: '#2f4f86', len: 8 },
  { name: '연어', price: 700, color: '#f2906e', dark: '#b8513a', len: 9 },
  { name: '참치', price: 1800, color: '#3c4f7a', dark: '#1d2846', len: 11 },
  { name: '황금물고기', price: 6000, color: '#ffd23f', dark: '#c48a12', len: 9 },
];

// 구역 해금 비용
export const UNLOCK = [0, 500, 2000, 6000, 15000];
export const MAX_LV = 5; // 기계 속도 최대 레벨
// ----- 자동화 라인 (구역마다 뜰채 → 손질기 → 포장기 → 연결 벨트) -----
export const MACHS = [
  { k: 'net', name: '자동 뜰채', icon: '🎣', desc: '수조 앞 바구니에 날생선이 쌓여요' },
  { k: 'cut', name: '자동 손질기', icon: '🔪', desc: '손질된 생선이 쌓여요' },
  { k: 'pack', name: '자동 포장기', icon: '📦', desc: '포장된 상자가 쌓여요' },
  { k: 'link', name: '출하 연결 벨트', icon: '➰', desc: '상자가 알아서 트럭으로 가요. 완전 자동!' },
];
export const ZONE_BASE = [120, 450, 1600, 5200, 16000];
const MACH_MUL = [1, 1.5, 2.2, 2.8];
export const machCost = (z, i) => Math.round(ZONE_BASE[z] * MACH_MUL[i] / 10) * 10;
export const speedCost = (z, i, lv) => Math.round(machCost(z, i) * 0.9 * Math.pow(1.75, lv - 1) / 10) * 10;
export const machCycle = (z, i, lv) => ([7, 6, 7][i] * (1 + 0.12 * z)) / (1 + 0.5 * (lv - 1));
export const BASKET = 6; // 기계 바구니 용량
export const UPGRADERS = [
  { id: 'wash', name: '세척기', icon: '🚿', mult: 1.25, price: 1200 },
  { id: 'ice', name: '얼음 포장기', icon: '🧊', mult: 1.5, price: 5000 },
  { id: 'gold', name: '금박 스티커기', icon: '✨', mult: 2, price: 18000 },
];
export const DECOS = [
  { id: 'plants', name: '화분 세트', icon: '🪴', price: 300, score: 1 },
  { id: 'fountain', name: '물고기 분수', icon: '⛲', price: 1500, score: 3 },
  { id: 'statue', name: '물범 동상', icon: '🗿', price: 4000, score: 5 },
  { id: 'neon', name: '네온 간판', icon: '💡', price: 8000, score: 8 },
  { id: 'goldfloor', name: '황금 바닥', icon: '🟨', price: 25000, score: 15 },
];
export const SELL_RATE = 0.6; // 주문 없이 팔 때
export const GRADE_MULT = [1, 1.06, 1.12]; // 그럭저럭 / 좋아요 / 완벽 (작업 단계마다 곱함)
export const GRADE_NAME = ['그럭저럭', '좋아요', '완벽!'];
export const COMBO_STEP = 0.05, COMBO_MAX = 10;
export const BELT_SPEED = 72; // px/초
export const EVENTS = [
  { id: 'gold', name: '황금 타임', icon: '✨', dur: 30, desc: '30초 동안 출하가 2배!' },
  { id: 'rush', name: '주문 러시', icon: '📢', dur: 0, desc: '주문이 한꺼번에 몰려와요 (보너스 +30%)' },
  { id: 'blackout', name: '정전', icon: '💡', dur: 20, desc: '20초 동안 어둡고 자동 기계가 멈춰요' },
  { id: 'vip', name: 'VIP 손님', icon: '👑', dur: 0, desc: '짧은 시간 안에 처리하면 3배!' },
  { id: 'patrol', name: '사장님 순찰', icon: '🚶', dur: 20, desc: '20초 동안 장난감 꺼내면 바로 경고!' },
];

export const TOYS = [
  { id: 1, name: '비치볼', price: 0, rate: 2, icon: '🏐', desc: '코로 톡톡. 천천히 풀려요.' },
  { id: 2, name: '스퀴시', price: 300, rate: 4, icon: '🍡', desc: '꾹꾹 말랑. 조금 빨라요.' },
  { id: 3, name: '게임기', price: 1200, rate: 8, icon: '🎮', desc: '크게 풀리지만 CCTV 경고 후 1.5초 안에 내려놔야 해요.' },
  { id: 4, name: '낮잠 베개', price: 2500, rate: 15, icon: '💤', desc: '가장 강력! 일어나는 데 1.5초가 걸려요.' },
];

export const SABS = [
  { id: 'cat', name: '고양이 침입', price: 500, icon: '🐱', desc: '고양이 2마리가 생선을 훔쳐요. 3번 부딪혀야 도망가요.' },
  { id: 'slip', name: '미끄러운 바닥', price: 600, icon: '🧼', desc: '15초간 바닥이 미끄러워요. 대걸레로 닦을 수 있어요.' },
  { id: 'hack', name: '해킹', price: 800, icon: '💻', desc: '8초간 화면이 깨지고 방향이 반대가 돼요.' },
  { id: 'break', name: '기계 고장', price: 1000, icon: '⚙️', desc: '가장 비싼 구역의 자동 기계가 멈춰요.' },
];
export const SAB_IMMUNE = 20;

export const STRESS_PER_SEC = 1 / 3;
export const CCTV_WINDOW = 2;
export const CCTV_WINDOW_CONSOLE = 1.5;
export const PILLOW_WAKE = 1.5;

export const COOP_TARGET = [700, 2200, 7500, 20000, 52000];
export const DAY_NAMES = ['월요일', '화요일', '수요일', '목요일', '금요일'];
export const DAY_LEN = 180;

// 꾸미기
export const FUR = [
  { name: '기본 회색', price: 0, body: '#8f9cb0', belly: '#cfd7e2', shade: '#6b7890' },
  { name: '하얀 아기물범', price: 150, body: '#eef3f8', belly: '#ffffff', shade: '#c3cfdc' },
  { name: '점박이', price: 200, body: '#9aa3ad', belly: '#d8dde3', shade: '#5c6570', spots: '#5c6570' },
  { name: '분홍', price: 300, body: '#eba5bd', belly: '#f8d6e2', shade: '#c97894' },
  { name: '황금', price: 1500, body: '#e6b43c', belly: '#f8e39a', shade: '#b07f1c' },
];
export const HATS = [
  { name: '없음', price: 0 },
  { name: '안전모', price: 80 },
  { name: '요리사 모자', price: 120 },
  { name: '리본', price: 100 },
  { name: '해적 모자', price: 250 },
  { name: '왕관', price: 800 },
];
export const ACCS = [
  { name: '없음', price: 0 },
  { name: '선글라스', price: 120 },
  { name: '넥타이', price: 100 },
  { name: '앞치마', price: 150 },
  { name: '고무장갑', price: 90 },
];

export const EMOTES = ['👏', '😛', '💃', '😴'];
export const EMOTE_NAMES = ['박수', '혀 날름', '꿈틀 춤', '졸음'];

// ===== 맵 레이아웃: 원형 도넛 (타일 단위) =====
// 가운데 = 출하 트럭(허브), 둘레 4구역: ① 수조(위) ② 손질(왼쪽) ③ 포장(아래) ④ 사무·휴게(오른쪽)
export const CX = 38, CY = 32; // 원의 중심 (타일 좌표)
export const R_HUB = 9; // 트럭 허브 반지름
export const R_WALK = 28.3; // 걸어다닐 수 있는 최대 반지름
export const R_BELT = 30; // 장식 컨베이어 바깥 반지름 (그 밖은 벽)
export const GATES = [45, 135, 225, 315];
export const SECTIONS = [
  { n: '① 수조', a: 90, col: '#3aa0d8' },
  { n: '② 손질', a: 180, col: '#4cc38a' },
  { n: '③ 포장', a: 270, col: '#f0a040' },
  { n: '④ 사무·휴게', a: 0, col: '#c58af0' },
];
const rad = (d) => (d * Math.PI) / 180;
export const polar = (r, deg) => ({ x: CX + r * Math.cos(rad(deg)), y: CY - r * Math.sin(rad(deg)) });
const rectAt = (r, deg, w, h) => { const p = polar(r, deg); return { x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h }; };
// 타일 중심의 각도(도, 0~360)와 반지름
export function tilePolar(tx, ty) {
  const dx = tx + 0.5 - CX, dy = CY - (ty + 0.5);
  let a = (Math.atan2(dy, dx) * 180) / Math.PI; if (a < 0) a += 360;
  return { r: Math.hypot(dx, dy), a };
}
// 각도 → 구역 번호 (0:수조 1:손질 2:포장 3:사무)
export const sectionOf = (a) => (a >= 45 && a < 135 ? 0 : a >= 135 && a < 225 ? 1 : a >= 225 && a < 315 ? 2 : 3);

const TANK_A = [128, 109, 90, 71, 52];
export function buildStations() {
  const s = [];
  for (let z = 0; z < 5; z++) {
    s.push({ id: 'tank' + z, kind: 'tank', z, ...rectAt(22, TANK_A[z], 6, 4), a: TANK_A[z] });
    s.push({ id: 'mach' + z, kind: 'mach', z, ...rectAt(26.4, TANK_A[z], 3, 2), a: TANK_A[z] });
    s.push({ id: 'acut' + z, kind: 'acut', z, ...rectAt(18.2, TANK_A[z] + 6, 2, 2), a: TANK_A[z] + 6 });
    s.push({ id: 'apack' + z, kind: 'apack', z, ...rectAt(18.2, TANK_A[z] - 6, 2, 2), a: TANK_A[z] - 6 });
  }
  [158, 180, 202].forEach((a, i) => s.push({ id: 'cut' + i, kind: 'cut', ...rectAt(19, a, 4, 3), a }));
  [248, 270, 292].forEach((a, i) => s.push({ id: 'pack' + i, kind: 'pack', ...rectAt(19, a, 4, 3), a }));
  s.push({ id: 'pc', kind: 'pc', ...rectAt(18.5, 6, 3, 3), a: 6 });
  s.push({ id: 'board', kind: 'board', ...rectAt(24.5, 24, 4, 2), a: 24 });
  s.push({ id: 'sofa', kind: 'sofa', ...rectAt(22.5, 338, 4, 2), a: 338 });
  s.push({ id: 'mop', kind: 'mop', ...rectAt(24, 236, 2, 2), a: 236 });
  s.push({ id: 'truck', kind: 'truck', x: CX - 4, y: CY - 2, w: 8, h: 5, a: 0 });
  return s;
}
export const STATIONS = buildStations();
export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
export const SPAWN = { x: CX * TILE, y: (CY + 5.5) * TILE };
export const CAT_DOOR = (() => { const p = polar(27, 300); return { x: p.x * TILE, y: p.y * TILE }; })();

// ----- 인테리어 소품 (k: 종류, solid: 부딪힘) -----
const PROP_DEFS = [
  // 게이트 기둥
  ...[45, 135, 225, 315].flatMap((a) => [{ k: 'pillar', r: 12.4, a, w: 1, h: 1, solid: 1 }, { k: 'pillar', r: 27.6, a, w: 1, h: 1, solid: 1 }]),
  // ① 수조: 기계 사이 계기판·밸브, 바닥 증기구
  { k: 'gauge', r: 27, a: 118.5, w: 1, h: 1, solid: 1 }, { k: 'valve', r: 27, a: 99.5, w: 1, h: 1, solid: 1 },
  { k: 'gauge', r: 27, a: 80.5, w: 1, h: 1, solid: 1 }, { k: 'valve', r: 27, a: 61.5, w: 1, h: 1, solid: 1 },
  { k: 'panel', r: 26.5, a: 140, w: 1, h: 2, solid: 1 }, { k: 'panel', r: 26.5, a: 40, w: 1, h: 2, solid: 1 },
  { k: 'steam', r: 15.5, a: 100, w: 1, h: 1 }, { k: 'steam', r: 15.5, a: 75, w: 1, h: 1 },
  { k: 'puddle', r: 17.2, a: 118, w: 2, h: 1 }, { k: 'puddle', r: 17.2, a: 62, w: 2, h: 1 },
  { k: 'cable', r: 14, a: 90, w: 3, h: 1 },
  // ② 손질: 얼음 상자, 생선 바구니, 장화, 호스, 그물
  { k: 'ice', r: 24.6, a: 169, w: 2, h: 1, solid: 1 }, { k: 'ice', r: 24.6, a: 191, w: 2, h: 1, solid: 1 },
  { k: 'basket', r: 15.2, a: 169, w: 1, h: 1, solid: 1 }, { k: 'basket', r: 15.2, a: 191, w: 1, h: 1, solid: 1 },
  { k: 'boots', r: 25.5, a: 150, w: 2, h: 1, solid: 1 }, { k: 'hose', r: 25.5, a: 211, w: 1, h: 1, solid: 1 },
  { k: 'net', r: 25.2, a: 180, w: 2, h: 2 }, { k: 'puddle', r: 14.2, a: 150, w: 2, h: 1 }, { k: 'puddle', r: 14.5, a: 205, w: 2, h: 1 },
  // ③ 포장: 빈 상자 더미, 배전반, 전선, 팔레트
  { k: 'boxes', r: 24.6, a: 259, w: 2, h: 2, solid: 1 }, { k: 'boxes', r: 24.6, a: 281, w: 2, h: 2, solid: 1 },
  { k: 'panel', r: 25.8, a: 270, w: 1, h: 2, solid: 1 }, { k: 'tape', r: 15, a: 259, w: 1, h: 1, solid: 1 },
  { k: 'cable', r: 14.8, a: 281, w: 3, h: 1 }, { k: 'pallet', r: 25.5, a: 303, w: 2, h: 2, solid: 1 },
  { k: 'ice', r: 25.6, a: 246, w: 2, h: 1, solid: 1 },
  // ④ 사무·휴게: 자판기, 화분, TV, 정수기, 사물함
  { k: 'vend', r: 25.5, a: 352, w: 2, h: 2, solid: 1 }, { k: 'plant', r: 26.5, a: 326, w: 1, h: 1, solid: 1 },
  { k: 'tv', r: 17.8, a: 338, w: 2, h: 1, solid: 1 }, { k: 'water', r: 26, a: 6, w: 1, h: 2, solid: 1 },
  { k: 'locker', r: 25.6, a: 36, w: 2, h: 2, solid: 1 }, { k: 'plant', r: 14.8, a: 20, w: 1, h: 1, solid: 1 },
  { k: 'rug', r: 20.5, a: 338, w: 6, h: 4 },
  // 허브: 지게차, 팔레트, 경고 콘
  { k: 'forklift', r: 7, a: 40, w: 2, h: 2, solid: 1 }, { k: 'pallet', r: 7, a: 140, w: 2, h: 2, solid: 1 },
  { k: 'cone', r: 7.2, a: 230, w: 1, h: 1, solid: 1 }, { k: 'cone', r: 7.2, a: 310, w: 1, h: 1, solid: 1 },
];
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const PROPS = (() => {
  const out = [];
  for (const d of PROP_DEFS) {
    const p = { k: d.k, solid: !!d.solid, ...rectAt(d.r, d.a, d.w, d.h), a: d.a };
    if (STATIONS.some((s) => overlap(p, s))) continue;
    if (p.solid && out.some((q) => q.solid && overlap(p, q))) continue;
    out.push(p);
  }
  return out;
})();

// ----- 바닥 구매 버튼 (1×1 타일) -----
// kind: unlock(z) / mach(z,i) / upg(i) / deco(i)
const PAD_OFF = [-7.4, -3.7, 3.7, 7.4]; // 구역 중심선 기준 각도 (중심선 위로는 연결 벨트가 지나감)
const padAt = (r, a) => { const p = polar(r, a); return { x: Math.floor(p.x), y: Math.floor(p.y), w: 1, h: 1 }; };
export const DECO_SLOTS = [
  { r: 14.2, a: 348, w: 2, h: 2 }, { r: 14.2, a: 330, w: 2, h: 2 }, { r: 14.6, a: 16, w: 2, h: 2 }, { r: 23.5, a: 352, w: 1, h: 1 }, { r: 6.2, a: 205, w: 1, h: 1 },
];
export const PADS = (() => {
  const out = [];
  for (let z = 0; z < 5; z++) {
    const t = STATIONS.find((s) => s.id === 'tank' + z);
    out.push({ id: 'u' + z, kind: 'unlock', z, ...padAt(16.6, t.a) });
    for (let i = 0; i < 4; i++) out.push({ id: `m${z}_${i}`, kind: 'mach', z, i, ...padAt(14.3, t.a + PAD_OFF[[2, 1, 0, 3][i]]) });
  }
  [0, 1, 2].forEach((i) => out.push({ id: 'g' + i, kind: 'upg', i, x: CX + 8 - i * 1.5 | 0, y: CY + 2, w: 1, h: 1 }));
  DECO_SLOTS.forEach((d, i) => { const p = polar(d.r, d.a); out.push({ id: 'd' + i, kind: 'deco', i, x: Math.round(p.x - d.w / 2), y: Math.round(p.y - d.h / 2), w: d.w, h: d.h }); });
  return out;
})();
export const PAD_BY_ID = Object.fromEntries(PADS.map((p) => [p.id, p]));
// 지금 보여야 하는 버튼과 가격 (공장 상태 → 버튼 목록)
// st = { z: [{u, m:[lv0,lv1,lv2,link]}], up: [0/1 x3], deco: [0/1 x5] }
export function activePads(st) {
  const out = [];
  st.z.forEach((zz, z) => {
    if (!zz.u) { if (z > 0 && st.z[z - 1].u) out.push({ pad: PAD_BY_ID['u' + z], price: UNLOCK[z], label: `${FISH[z].name} 구역 열기`, icon: '🔓' }); return; }
    for (let i = 0; i < 4; i++) {
      const lv = zz.m[i];
      const pad = PAD_BY_ID[`m${z}_${i}`];
      if (!lv) { if (i === 0 || zz.m[i - 1]) out.push({ pad, price: machCost(z, i), label: `${FISH[z].name} ${MACHS[i].name}`, icon: MACHS[i].icon, desc: MACHS[i].desc }); break; }
      if (i < 3 && lv < MAX_LV) out.push({ pad, price: speedCost(z, i, lv), label: `${MACHS[i].name} Lv.${lv + 1}`, icon: '⬆️', desc: '작업 속도가 빨라져요', up: true });
    }
  });
  const nu = st.up.findIndex((v) => !v);
  if (nu >= 0) out.push({ pad: PAD_BY_ID['g' + nu], price: UPGRADERS[nu].price, label: UPGRADERS[nu].name, icon: UPGRADERS[nu].icon, desc: `출하 벨트를 지나는 상자 값 ×${UPGRADERS[nu].mult}` });
  DECOS.forEach((d, i) => { if (!st.deco[i]) out.push({ pad: PAD_BY_ID['d' + i], price: d.price, label: d.name, icon: d.icon, desc: `공장 꾸미기 점수 +${d.score}` }); });
  return out;
}

// ----- 출하 벨트 경로: 입구 → 가운데 원형 벨트 → 업그레이더 → 트럭 -----
export const R_RING = 10.6;
export const BELT_INLETS = (() => {
  const list = [];
  for (let z = 0; z < 5; z++) { const s = STATIONS.find((q) => q.id === 'apack' + z); list.push({ id: 'z' + z, a: TANK_A[z], start: { x: s.x + s.w / 2, y: s.y + s.h / 2 } }); }
  [248, 270, 292].forEach((a, i) => list.push({ id: 'p' + i, a: a + 4.5, start: polar(16.6, a + 4.5) }));
  return list.map((inl) => {
    const pts = [inl.start];
    if (inl.id[0] === 'z') pts.push(polar(16.8, inl.a));
    pts.push(polar(R_RING, inl.a));
    let a0 = ((inl.a % 360) + 360) % 360;
    const dir = a0 <= 180 ? -1 : 1; // 0°(오른쪽)까지 짧은 쪽으로
    let a = a0;
    while ((dir < 0 && a > 0) || (dir > 0 && a < 360)) { a += dir * 6; const aa = dir < 0 ? Math.max(0, a) : Math.min(360, a); pts.push(polar(R_RING, aa)); if (aa === 0 || aa === 360) break; }
    pts.push({ x: CX + 4.3, y: CY });
    const P = pts.map((q) => ({ x: q.x * TILE, y: q.y * TILE }));
    const seg = [0];
    for (let k = 1; k < P.length; k++) seg.push(seg[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
    const len = seg[seg.length - 1];
    // 업그레이더는 트럭 직전 직선 구간에 있음
    const finalStart = seg[seg.length - 2];
    const upg = [9.2, 7.6, 6.0].map((tx) => finalStart + (R_RING - tx) * TILE);
    return { id: inl.id, P, seg, len, upg };
  });
})();
export function beltPos(inlet, d) {
  const B = BELT_INLETS[inlet]; if (!B) return { x: 0, y: 0 };
  d = Math.max(0, Math.min(B.len, d));
  let k = 1; while (k < B.seg.length - 1 && B.seg[k] < d) k++;
  const a = B.P[k - 1], b = B.P[k], t = (d - B.seg[k - 1]) / Math.max(1e-6, B.seg[k] - B.seg[k - 1]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export const UPG_X = [9.2, 7.6, 6.0].map((t) => (CX + t) * TILE);

// 걸을 수 없는 칸: 원 밖 + 구조물 + 단단한 소품
let SOLID_CACHE = null;
export function buildSolid() {
  if (SOLID_CACHE) return SOLID_CACHE;
  const g = new Uint8Array(MAP_W * MAP_H);
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    // 칸의 네 모서리 중 하나라도 걸을 수 있는 원 밖이면 막힘
    let out = false;
    for (const [ox, oy] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) if (Math.hypot(tx + ox - CX, ty + oy - CY) > R_WALK) out = true;
    if (out) g[ty * MAP_W + tx] = 1;
  }
  const fill = (r) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) g[y * MAP_W + x] = 1; };
  STATIONS.forEach(fill);
  PROPS.forEach((p) => p.solid && fill(p));
  SOLID_CACHE = g;
  return g;
}

// 상호작용 지점: 구조물에서 허브(가운데) 쪽 면의 바로 앞
export function stationPoint(s) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  if (s.kind === 'truck') return { x: cx * TILE, y: (s.y + s.h) * TILE + 10 };
  const dx = CX - cx, dy = CY - cy;
  if (Math.abs(dx) > Math.abs(dy)) return { x: (dx > 0 ? s.x + s.w : s.x) * TILE + (dx > 0 ? 10 : -10), y: cy * TILE };
  return { x: cx * TILE, y: (dy > 0 ? s.y + s.h : s.y) * TILE + (dy > 0 ? 10 : -10) };
}
export const nearestOf = (kind, x, y) => {
  let best = null, bd = 1e9;
  for (const s of STATIONS) if (s.kind === kind) { const p = stationPoint(s); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = s; } }
  return best;
};

export const FACE = { normal: 0, angry: 1, happy: 2, shock: 3 };
