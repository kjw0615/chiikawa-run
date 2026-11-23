import { KaniGame, KANI_RULES, KANI_SHELVES, KANI_SHELF_INFO } from './kani-game';

let host: HTMLElement | null = null;
let current: KaniGame | null = null;
const FEEDBACK_SECONDS = .35;
const feedbackText = { sorted: '꽂았다!', wrong: '앗, 다른 책장이야', missed: '놓쳤어' } as const;

/** Prototype screen (symbols, text and basic shapes only). One button: Space (the shell routes it) or the on-screen button.
 * The shell owns start/result/pause controls. */
export function mountKaniPanel(root: HTMLElement, onPress: () => void) {
  if (host === root) return;
  host = root;
  root.innerHTML = `<div class="kani-helper"><span class="kani-badge" aria-hidden="true">📚</span><span>제목을 보고 알맞은 책장에 꽂아요!</span></div>
    <div class="kani-stage"><div class="kani-counter" aria-hidden="true"></div>
      <div class="kani-book" hidden><span class="kani-spine" aria-hidden="true"></span><span class="kani-title"></span></div>
      <div class="kani-result" role="status" hidden></div>
      <div class="kani-start" role="status" hidden></div></div>
    <div class="kani-cue" role="status"></div><div class="kani-timer" aria-hidden="true"><span></span></div>
    <div class="kani-progress" aria-label="진행 상황"></div>
    <div class="kani-shelves" aria-hidden="true">${KANI_SHELVES.map(shelf => `<div class="kani-shelf"><b>${KANI_SHELF_INFO[shelf].symbol}</b><span>${KANI_SHELF_INFO[shelf].name}</span></div>`).join('')}<div class="kani-cursor"></div></div>
    <button type="button" class="kani-put">책장에 꽂기 · Space</button>`;
  const button = root.querySelector<HTMLButtonElement>('.kani-put')!;
  const put = () => { if (current?.interactive && !current.paused && !current.startCue) onPress(); };
  button.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault(); put();
  });
  // Keyboard / assistive clicks have detail 0; physical clicks were handled at pointerdown.
  button.addEventListener('click', e => { if (e.detail === 0) put(); });
}

export interface KaniView { buttonText: string; buttonDisabled: boolean }
export function renderKaniPanel(g: KaniGame): KaniView {
  const view: KaniView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '책장에 꽂기',
    buttonDisabled: false,
  };
  if (!host) return view;
  current = g;
  const playing = g.phase === 'playing';
  const book = host.querySelector<HTMLElement>('.kani-book')!;
  const shown = g.current;
  book.hidden = !shown; // intro, lead-in and result show no book
  if (shown) {
    const title = host.querySelector<HTMLElement>('.kani-title')!;
    if (title.textContent !== shown.title) title.textContent = shown.title;
    book.dataset.index = String(g.currentIndex);
  }
  // Reaction of the book that just left the counter (a press brings the next book at once).
  const last = g.index - 1;
  const showFeedback = playing && last >= 0 && g.currentIndex >= 0 && g.bookTime < FEEDBACK_SECONDS && g.outcomes[last] !== undefined;
  const result = host.querySelector<HTMLElement>('.kani-result')!;
  const outcome = showFeedback ? g.outcomes[last]! : null;
  result.hidden = !outcome;
  result.dataset.outcome = outcome ?? '';
  const resultText = outcome ? feedbackText[outcome] : '';
  if (result.textContent !== resultText) result.textContent = resultText;
  const live = playing && !!g.current && !g.startCue;
  host.querySelectorAll<HTMLElement>('.kani-shelf').forEach((shelf, i) => {
    const flash = showFeedback && g.chosen[last] === KANI_SHELVES[i];
    shelf.dataset.flash = flash ? (g.outcomes[last] === 'sorted' ? 'sorted' : 'wrong') : '';
    shelf.dataset.active = live && g.cursorShelf === i ? 'true' : '';
  });
  const cursor = host.querySelector<HTMLElement>('.kani-cursor')!;
  cursor.hidden = !live;
  if (live) cursor.style.left = `${g.cursor / KANI_SHELVES.length * 100}%`;
  host.querySelector<HTMLButtonElement>('.kani-put')!.disabled = !g.interactive || g.paused || !!g.startCue;
  const start = host.querySelector<HTMLElement>('.kani-start')!;
  start.hidden = !g.startCue;
  const startText = g.startCue === 'ready' ? '준비…' : g.startCue === 'go' ? '시작!' : '';
  if (start.textContent !== startText) start.textContent = startText;
  const cue = host.querySelector<HTMLElement>('.kani-cue')!;
  const cueText = g.paused ? '잠깐 쉬어요' : g.startCue ? '카운터를 보세요' : g.current ? '커서가 알맞은 책장 위에 올 때 눌러요!' : g.phase === 'intro' ? '카운터를 보세요' : '정리 끝!';
  if (cue.textContent !== cueText) cue.textContent = cueText;
  host.querySelector<HTMLElement>('.kani-timer')!.hidden = g.phase === 'intro' || !!g.startCue;
  host.querySelector<HTMLElement>('.kani-timer span')!.style.width = `${g.interactive && g.current ? Math.max(0, 1 - g.bookTime / KANI_RULES.bookSeconds) * 100 : 0}%`;
  const progress = host.querySelector<HTMLElement>('.kani-progress')!;
  const marks = g.books.map((_, i) => g.outcomes[i] === undefined ? '○' : g.outcomes[i] === 'sorted' ? '●' : '◇').join(' ');
  if (progress.textContent !== marks) progress.textContent = marks;
  progress.setAttribute('aria-label', `${g.bookCount}권 중 ${g.judgedCount}권 정리 완료`);
  return view;
}
