// ===== 소스 보호: 개발자 도구 / 우클릭 / 단축키 차단 =====
/* global __DEV__ */
if (!__DEV__) {
  const block = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
  document.addEventListener('contextmenu', block, true);
  document.addEventListener('dragstart', block, true);
  document.addEventListener('selectstart', (e) => { const t = e.target; if (!(t && t.closest && t.closest('input,textarea'))) block(e); }, true);
  document.addEventListener('copy', (e) => { const t = e.target; if (!(t && t.closest && t.closest('input,textarea'))) block(e); }, true);
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const c = e.ctrlKey || e.metaKey;
    if (k === 'f12' ||
      (c && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) ||
      (c && e.altKey && ['i', 'j', 'c', 'u'].includes(k)) ||
      (c && ['u', 's', 'p'].includes(k))) return block(e);
  }, true);

  // 개발자 도구 감지 (데스크톱만, 창 크기 차이 기준)
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (!isTouch) {
    const guard = () => document.getElementById('guard');
    let hits = 0;
    // 확대/축소에 영향받지 않도록 (바깥/안쪽 비율 ÷ 픽셀 비율)의 처음 값을 기준으로 비교
    const kw = () => window.outerWidth / window.innerWidth / (window.devicePixelRatio || 1);
    const kh = () => (window.outerHeight - 140) / window.innerHeight / (window.devicePixelRatio || 1);
    const bw = kw(), bh = kh();
    setInterval(() => {
      const open = window.outerWidth > 0 && !document.fullscreenElement &&
        (kw() / bw > 1.22 || kh() / bh > 1.3);
      hits = open ? hits + 1 : 0;
      const g = guard();
      if (g) g.classList.toggle('show', hits >= 2);
    }, 1000);
  }
}
