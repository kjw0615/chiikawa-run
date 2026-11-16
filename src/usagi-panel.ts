import { UsagiGame, type UsagiSide } from './usagi-game';

type Frame = { x: number; y: number; w: number; h: number };
let root: HTMLElement | null = null;
let idleFrame: Frame | null = null;
let animFrames: { right: Frame[]; left: Frame[] } = { right: [], left: [] };
let atlasSize = { w: 2048, h: 1536 };
let current: UsagiGame | null = null;

/** Owns only the panel contents. The shell owns start/result/pause and keyboard routing. */
export function mountUsagiPanel(host: HTMLElement, onLane: (side: UsagiSide) => void) {
  if (root === host) return;
  root = host;
  host.innerHTML = `<div class="usagi-stage">
    <div class="usagi-lane usagi-lane-left"><span class="usagi-target">←</span></div>
    <div class="usagi-lane usagi-lane-right"><span class="usagi-target">→</span></div>
    <div class="usagi-dancer" role="img" aria-label="엉덩이를 흔들며 춤추는 우사기">🐰</div>
    <div class="usagi-bubble" hidden></div><div class="usagi-grade" role="status" hidden></div>
    <div class="usagi-notes" aria-hidden="true">${Array.from({ length: 8 }, () => '<span class="usagi-note" hidden></span>').join('')}</div>
  </div><div class="usagi-progress" aria-label="진행 상황"></div>
  <div class="usagi-controls"><button type="button" data-side="left" aria-label="왼쪽 우냐">← 우냐!</button><button type="button" data-side="right" aria-label="오른쪽 우랴">우랴! →</button></div>`;
  for (const button of host.querySelectorAll<HTMLButtonElement>('[data-side]')) {
    const activate = () => {
      if (current?.interactive && !current.paused) onLane(button.dataset.side as UsagiSide);
    };
    button.addEventListener('pointerdown', e => {
      if (!e.isPrimary || e.button !== 0) return;
      e.preventDefault(); activate();
    });
    // Keyboard / assistive clicks have detail 0; physical clicks were handled at pointerdown.
    button.addEventListener('click', e => { if (e.detail === 0) activate(); });
  }
  void Promise.all([
    fetch('/assets/cameo-atlas.json').then(r => { if (!r.ok) throw Error('atlas'); return r.json(); }),
    new Promise<void>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = reject; img.src = '/assets/cameo-atlas.webp'; }),
  ]).then(([atlas]) => {
    idleFrame = (atlas.frames['usagi-idle']?.frame as Frame) ?? (atlas.frames['usagi-dance-0']?.frame as Frame);
    const rFrames = [4, 5, 6, 7, 8].map(n => atlas.frames[`usagi-r-${n}`]?.frame as Frame).filter(Boolean);
    const lFrames = [4, 5, 6, 7, 8].map(n => atlas.frames[`usagi-l-${n}`]?.frame as Frame).filter(Boolean);
    animFrames = { right: rFrames, left: lFrames };
    atlasSize = atlas.meta.size;
    if (current) renderUsagiPanel(current);
  }).catch(() => { /* Keep the rabbit fallback; missing scenery art must not stop the game. */ });
}

export interface UsagiView { buttonText: string; buttonDisabled: boolean }
export function renderUsagiPanel(g: UsagiGame, state?: { key: string }): UsagiView {
  const view: UsagiView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '박자에 맞춰 누르기',
    buttonDisabled: false,
  };
  if (!root) return view;
  current = g;
  const active = g.interactive && !g.paused;
  root.dataset.dance = g.dance;
  root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(b => { b.disabled = !active; });
  const dancer = root.querySelector<HTMLElement>('.usagi-dancer')!;
  if (idleFrame) {
    let f = idleFrame;
    // When a note is answered successfully (Perfect/Good), animate through frames 4..8 for that side, then return to idle!
    if ((g.dance === 'left' || g.dance === 'right') && g.lastIndex >= 0) {
      const dtSinceHit = g.time - g.judgedAt[g.lastIndex];
      const list = g.dance === 'left' ? animFrames.left : animFrames.right;
      if (list.length > 0) {
        // 5 frames across feedbackSeconds (0.45s) -> ~0.09s per frame
        const frameIdx = Math.floor((dtSinceHit / 0.45) * list.length);
        if (frameIdx < list.length) {
          f = list[frameIdx];
        }
      }
    }
    const scale = .625;
    dancer.textContent = '';
    dancer.style.backgroundImage = "url('/assets/cameo-atlas.webp')";
    dancer.style.backgroundSize = `${atlasSize.w * scale}px ${atlasSize.h * scale}px`;
    dancer.style.backgroundPosition = `${-f.x * scale}px ${-f.y * scale}px`;
  }
  const bubble = root.querySelector<HTMLElement>('.usagi-bubble')!;
  const text = g.bubble ? `${g.bubble}!` : g.label && g.lastIndex >= 0 ? (g.chart[g.lastIndex] === 'left' ? '우냐!' : '우랴!') : '';
  bubble.hidden = !text;
  if (bubble.textContent !== text) bubble.textContent = text;
  const grade = root.querySelector<HTMLElement>('.usagi-grade')!;
  const label = g.label ? { perfect: 'Perfect', good: 'Good', miss: 'Miss' }[g.label] : '';
  grade.hidden = !label;
  grade.dataset.grade = g.label ?? '';
  if (grade.textContent !== label) grade.textContent = label;
  root.querySelectorAll<HTMLElement>('.usagi-note').forEach((note, i) => {
    const p = g.noteProgress(i);
    note.hidden = p === null;
    if (p === null) return;
    const left = g.chart[i] === 'left';
    // Targets at 30% and 70%; notes approach from their corresponding outside edge.
    note.style.left = `${left ? 3 + p * 27 : 97 - p * 27}%`;
    note.dataset.side = g.chart[i];
    note.textContent = left ? '←' : '→';
  });
  const progress = root.querySelector<HTMLElement>('.usagi-progress')!;
  const marks = Array.from({ length: g.noteCount }, (_, i) => g.grades[i] === undefined ? '○' : g.grades[i] === 'miss' ? '◇' : '●').join(' ');
  if (progress.textContent !== marks) progress.textContent = marks;
    progress.setAttribute('aria-label', `${g.noteCount}개 중 ${g.judgedCount}개 완료`);
  return view;
}
