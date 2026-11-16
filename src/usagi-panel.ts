import { UsagiGame, type UsagiSide } from './usagi-game';

type Frame = { x: number; y: number; w: number; h: number };
let root: HTMLElement | null = null;
let idleFrame: Frame | null = null;
let introFrame: Frame | null = null;
let animFrames: { right: Frame[]; left: Frame[] } = { right: [], left: [] };
let atlasSize = { w: 2048, h: 1536 };
let current: UsagiGame | null = null;
let atlasFailed = false;

/** Fetched once, as soon as this module loads (the shell imports it at startup), so the atlas is normally ready before
 * the player ever opens the game. The dancer stays invisible until its frame exists: no placeholder is ever shown. */
function applyAtlas(atlas: any) {
  idleFrame = (atlas.frames['usagi-idle']?.frame as Frame) ?? (atlas.frames['usagi-dance-0']?.frame as Frame);
  introFrame = (atlas.frames['usagi-intro']?.frame as Frame) ?? idleFrame;
  animFrames = {
    right: [4, 5, 6, 7, 8].map(n => atlas.frames[`usagi-r-${n}`]?.frame as Frame).filter(Boolean),
    left: [4, 5, 6, 7, 8].map(n => atlas.frames[`usagi-l-${n}`]?.frame as Frame).filter(Boolean),
  };
  atlasSize = atlas.meta.size;
}
const atlasLoad: Promise<void> | null = typeof window === 'undefined' ? null : Promise.all([
  fetch('/assets/cameo-atlas.json').then(r => { if (!r.ok) throw Error('atlas'); return r.json(); }),
  new Promise<void>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = reject; img.src = '/assets/cameo-atlas.webp'; }),
]).then(([atlas]) => { applyAtlas(atlas); }).catch(() => { atlasFailed = true; /* missing art must not stop the game */ });

/** Owns only the panel contents. The shell owns start/result/pause and keyboard routing. */
export function mountUsagiPanel(host: HTMLElement, onLane: (side: UsagiSide) => void) {
  if (root === host) return;
  root = host;
  host.innerHTML = `<div class="usagi-stage">
    <div class="usagi-lane usagi-lane-left"><span class="usagi-target">←</span></div>
    <div class="usagi-lane usagi-lane-right"><span class="usagi-target">→</span></div>
    <div class="usagi-dancer" role="img" aria-label="양팔을 번갈아 뻗으며 춤추는 우사기"></div>
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
  void atlasLoad?.then(() => { if (current) renderUsagiPanel(current); });
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
  dancer.style.visibility = idleFrame || atlasFailed ? 'visible' : 'hidden'; // never a placeholder while the atlas loads
  if (!idleFrame && atlasFailed) dancer.textContent = '🐰'; // only when the art could not be loaded at all
  if (idleFrame) {
    let f = g.phase === 'intro' ? introFrame ?? idleFrame : idleFrame;
    // The model owns the animation clock, including pause and the return to standing.
    const progress = g.danceProgress;
    if (progress !== null && (g.dance === 'left' || g.dance === 'right')) {
      const list = g.dance === 'left' ? animFrames.left : animFrames.right;
      const frameIdx = Math.floor(progress * 5);
      if (list.length === 5 && frameIdx >= 0 && frameIdx < 5) f = list[frameIdx];
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
