// ===== 게임 데이터 / 상수 =====
export const VERSION = 1;
export const TILE = 16;
export const SPEED = 92; // 이동 속도(px/초)
export const HOLD_SPEED = 0.82; // 물건을 들었을 때 속도 배율
export const MAP_W = 48;
export const MAP_H = 30;

export const FISH = [
  { name: '멸치', price: 80, color: '#b8c8dc', dark: '#6f86a3', len: 6 },
  { name: '고등어', price: 250, color: '#5f8fc9', dark: '#2f4f86', len: 8 },
  { name: '연어', price: 700, color: '#f2906e', dark: '#b8513a', len: 9 },
  { name: '참치', price: 1800, color: '#3c4f7a', dark: '#1d2846', len: 11 },
  { name: '황금물고기', price: 6000, color: '#ffd23f', dark: '#c48a12', len: 9 },
];

// 구역 해금 비용
export const UNLOCK = [0, 500, 2200, 7000, 20000];
// 자동 생산: 초당 수입 = AUTO[i] * L^1.3
export const AUTO = [1, 3.5, 10, 27, 80];
// 기계 업그레이드 기본 비용 (× 1.6^(L-1))
export const UPCOST = [40, 180, 650, 2200, 7000];
export const MAX_LV = 10;
export const autoRate = (z, lv) => AUTO[z] * Math.pow(lv, 1.3);
// 기계 레벨이 오르면 그 구역 생선의 품질(판매가)도 오름
export const fishValue = (z, lv) => Math.round(FISH[z].price * (1 + 0.35 * (lv - 1)));
export const upCost = (z, lv) => Math.round(UPCOST[z] * Math.pow(1.6, lv - 1));

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

export const COOP_TARGET = [1000, 6500, 25000, 85000, 180000];
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

// ===== 맵 레이아웃 (타일 단위) =====
export const zoneX = (z) => 2 + z * 9;
export const ZONE_Y = 1, ZONE_H = 9; // y 1..9 (9 = 출입구 줄)

export function buildStations() {
  const s = [];
  for (let z = 0; z < 5; z++) {
    const x0 = zoneX(z);
    s.push({ id: 'tank' + z, kind: 'tank', z, x: x0 + 1, y: 3, w: 4, h: 3 });
    s.push({ id: 'mach' + z, kind: 'mach', z, x: x0 + 6, y: 3, w: 2, h: 2 });
  }
  s.push({ id: 'cut0', kind: 'cut', x: 4, y: 13, w: 3, h: 2 });
  s.push({ id: 'pack0', kind: 'pack', x: 10, y: 13, w: 3, h: 2 });
  s.push({ id: 'pc', kind: 'pc', x: 20, y: 13, w: 2, h: 2 });
  s.push({ id: 'board', kind: 'board', x: 25, y: 12, w: 4, h: 1 });
  s.push({ id: 'cut1', kind: 'cut', x: 34, y: 13, w: 3, h: 2 });
  s.push({ id: 'pack1', kind: 'pack', x: 40, y: 13, w: 3, h: 2 });
  s.push({ id: 'sofa', kind: 'sofa', x: 3, y: 22, w: 4, h: 1 });
  s.push({ id: 'mop', kind: 'mop', x: 16, y: 26, w: 2, h: 2 });
  s.push({ id: 'truck', kind: 'truck', x: 27, y: 22, w: 5, h: 3 });
  return s;
}
export const STATIONS = buildStations();
export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
export const SPAWN = { x: 27 * TILE, y: 18 * TILE };
export const CAT_DOOR = { x: 1.5 * TILE, y: 17 * TILE };

// 고정 벽 + 기본 장애물. locked: [bool x5] → 잠긴 구역 출입구 막기
export function buildSolid(unlocked) {
  const g = new Uint8Array(MAP_W * MAP_H);
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) g[y * MAP_W + x] = 1; };
  for (let x = 0; x < MAP_W; x++) { set(x, 0); set(x, MAP_H - 1); }
  for (let y = 0; y < MAP_H; y++) { set(0, y); set(MAP_W - 1, y); }
  // 구역 사이 벽 (y 1..8)
  for (let z = 0; z <= 5; z++) {
    const wx = z === 0 ? 1 : zoneX(z) - 1;
    for (let y = 1; y <= 8; y++) set(wx, y);
  }
  for (let y = 1; y <= 8; y++) set(46, y);
  // 구역 아래 벽 (출입구 4칸만 열림)
  for (let z = 0; z < 5; z++) {
    const x0 = zoneX(z);
    for (let x = x0 - 1; x < x0 + 9; x++) {
      const door = x >= x0 + 2 && x <= x0 + 5;
      if (!door || !unlocked[z]) set(x, 9);
    }
  }
  set(46, 9);
  for (const s of STATIONS) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) set(x, y);
  return g;
}

// 상호작용 지점 (스테이션 아래쪽 중앙 근처)
export function stationPoint(s) {
  return { x: (s.x + s.w / 2) * TILE, y: (s.y + s.h) * TILE + 8 };
}

export const FACE = { normal: 0, angry: 1, happy: 2, shock: 3 };
