# 🦭 실리실 피쉬팩토리

바보 물범 직원이 되어 물고기 공장에서 **해고당하지 않고 버티는** 8인 멀티 픽셀아트 타이쿤 게임.

- 타이쿤: 처음엔 손으로 → 바닥 구매 버튼으로 자동화 기계를 사서 라인을 완전 자동으로
- 경쟁 모드: 각자 공장에서 일하며 컴퓨터로 서로 방해 (고양이 · 해킹 · 기계 고장 · 미끄러운 바닥)
- 협동 모드: 한 공장을 함께 운영하며 월~금 목표 실적 달성 → 클리어하면 무한 모드
- 혼자 하기: AI 봇(쉬움/보통/어려움)과 경쟁·협동, 튜토리얼
- PC(키보드) · 모바일(가상 조이스틱, 전체 화면) 모두 지원

## 폴더 구조

```
Be-a-silly-seals-/
├─ index.html        ← 배포용 (빌드 결과)
├─ style.css         ← 배포용 (빌드 결과)
├─ game.min.js       ← 배포용 (난독화된 게임 코드)
├─ audio/            ← BGM (title / factory / rush)
├─ fonts/            ← Galmuri 픽셀 폰트 (OFL 라이선스)
├─ src/              ← 원본 코드 (유지보수는 여기서)
│  ├─ index.html, style.css
│  ├─ main.js        화면 전환 · 메뉴 · 로비 · 결과
│  ├─ game.js        게임 화면 렌더링 · 입력 · HUD · 컴퓨터
│  ├─ sim.js         게임 규칙 (방장 기기에서 실행)
│  ├─ bots.js        AI 봇
│  ├─ room.js        방 · 로비 · 게임 진행
│  ├─ net.js         P2P 연결 (PeerJS)
│  ├─ minigames.js   업무 미니게임 (여러 단계 · 판정 · 콤보)
│  ├─ world.js       원형 공장 맵 · 구조물 · 인테리어 그래픽
│  ├─ lines.js       사장님 대사
│  ├─ sprites.js     물범 · 생선 · 고양이 픽셀아트 (코드로 생성)
│  ├─ audio.js       BGM · 효과음
│  ├─ data.js        밸런스 수치 · 맵 배치
│  └─ protect.js     소스 보호
├─ tools/build.js    빌드 스크립트
└─ docs/기획서.md
```

## 수정 후 다시 빌드하기

```bash
npm install
npm run build   # 배포용 (난독화 + 소스 보호)
npm run dev     # 개발용 (난독화·보호 없음, 테스트할 때)
```

`src/`만 고친 뒤 `npm run build`를 실행하면 루트의 `index.html`, `style.css`, `game.min.js`가 새로 만들어져요.

## GitHub Pages 배포

1. 저장소 → **Settings → Pages**
2. Source: **Deploy from a branch**, Branch: 이 브랜치(또는 병합한 `main`) / `(root)` → Save
3. 1~2분 뒤 접속: **https://0611gareddug.github.io/Be-a-silly-seals-/**

친구 초대: 방을 만든 뒤 **초대 링크 복사**를 눌러 보내면 링크만으로 바로 들어올 수 있어요.

## 참고

- 멀티플레이는 PeerJS 공용 중계 서버로 연결한 뒤 기기끼리 직접 통신해요. 방장이 나가면 게임이 끝나요.
- 일부 회사·학교·모바일 통신망에서는 P2P 연결이 막힐 수 있어요.
- 꾸미기 코인은 브라우저(기기)에만 저장돼요.
- BGM: Kim's RPG OST · 폰트: [Galmuri](https://github.com/quiple/galmuri) (SIL OFL 1.1)
