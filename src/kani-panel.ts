import { KaniGame, KANI_RULES, KANI_SHELVES, KANI_SHELF_INFO } from './kani-game';
import { kaniCoverSvg } from './kani-cover';

let host: HTMLElement | null = null;
let current: KaniGame | null = null;
const FEEDBACK_SECONDS = .35;
let shelvingShown = -1;
const feedbackText = { sorted: '꽂았다!', wrong: '앗, 안 꽂혀! 다른 책장이야', missed: '놓쳤어' } as const;

/** Prototype screen (symbols, text and basic shapes only). ←/→ pick a shelf and Space (the shell routes both) or the put button puts the book there; clicking / tapping a shelf puts it there directly.
 * The shell owns start/result/pause controls. */
export function mountKaniPanel(root: HTMLElement, onPress: (shelf?: number) => void) {
  if (host === root) return;
  host = root;
  root.innerHTML = `<div class="kani-helper"><span class="kani-badge" aria-hidden="true"></span><span>제목을 보고 알맞은 책장에 꽂아요!</span></div>
    <div class="kani-split"><div class="kani-left"><div class="kani-stage">
      <div class="kani-book" hidden><span class="kani-spine" aria-hidden="true"></span><span class="kani-title"></span></div>
      <div class="kani-result" role="status" hidden></div>
      <div class="kani-start" role="status" hidden></div></div>
      <div class="kani-cue" role="status"></div><div class="kani-timer" aria-hidden="true"><span></span></div>
      <div class="kani-progress" aria-label="진행 상황"></div></div>
    <div class="kani-case" role="img" aria-label="책장"><div class="kani-row">${'<s></s>'.repeat(3)}<em>${'<u></u>'.repeat(KANI_RULES.books)}</em>${'<s></s>'.repeat(4)}</div></div></div>
    <div class="kani-shelves">${KANI_SHELVES.map(shelf => `<button type="button" class="kani-shelf" data-shelf="${KANI_SHELVES.indexOf(shelf)}"><b>${KANI_SHELF_INFO[shelf].symbol}</b><span>${KANI_SHELF_INFO[shelf].name}</span></button>`).join('')}</div>
    <button type="button" class="kani-put">선택한 책장에 꽂기 · Space</button>`;
  const button = root.querySelector<HTMLButtonElement>('.kani-put')!;
  root.querySelectorAll<HTMLButtonElement>('.kani-shelf').forEach(shelf => {
    const i = Number(shelf.dataset.shelf), choose = () => { if (current?.interactive && !current.paused && !current.startCue) onPress(i); };
    shelf.addEventListener('pointerdown', e => { if (!e.isPrimary || e.button !== 0) return; e.preventDefault(); choose(); });
    shelf.addEventListener('click', e => { if (e.detail === 0) choose(); });
  });
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
    const spine = host.querySelector<HTMLElement>('.kani-spine')!;
    if (spine.dataset.title !== shown.title) { spine.dataset.title = shown.title; spine.innerHTML = kaniCoverSvg(shown.shelf, shown.title); }
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
  // The book that just left flies to the shelf it was put on: it slots in when right and bounces off when wrong.
  if (showFeedback && outcome && shelvingShown !== g.seed * 100 + last) {
    shelvingShown = g.seed * 100 + last;
    const stage = host.querySelector<HTMLElement>('.kani-split')!, from = g.books[last], at = g.chosen[last];
    const ghost = document.createElement('span');
    ghost.className = 'kani-ghost'; ghost.dataset.outcome = outcome;
    ghost.style.setProperty('--ty', '45%');
    ghost.innerHTML = kaniCoverSvg(from.shelf, from.title);
    stage.appendChild(ghost);
    setTimeout(() => ghost.remove(), 700);
  }
  const live = playing && !!g.current && !g.startCue;
  host.querySelectorAll<HTMLElement>('.kani-shelf').forEach((shelf, i) => {
    const flash = showFeedback && g.chosen[last] === KANI_SHELVES[i];
    shelf.dataset.flash = flash ? (g.outcomes[last] === 'sorted' ? 'sorted' : 'wrong') : '';
    shelf.dataset.active = live && g.cursorShelf === i ? 'true' : '';
  });
  host.querySelectorAll<HTMLButtonElement>('.kani-shelf').forEach(b => { b.disabled = !live; });
  // One shared bookcase: every right answer fills the next empty gap, tinted by the kind of that book.
  const kinds = g.books.filter((_, n) => g.outcomes[n] === 'sorted').map(b => b.shelf);
  host.querySelectorAll<HTMLElement>('.kani-row em u').forEach((slot, k) => { slot.dataset.filled = kinds[k] ? 'true' : ''; slot.dataset.kind = kinds[k] ?? ''; });
  host.querySelector<HTMLButtonElement>('.kani-put')!.disabled = !g.interactive || g.paused || !!g.startCue;
  const start = host.querySelector<HTMLElement>('.kani-start')!;
  start.hidden = !g.startCue;
  const startText = g.startCue === 'ready' ? '준비…' : g.startCue === 'go' ? '시작!' : '';
  if (start.textContent !== startText) start.textContent = startText;
  const cue = host.querySelector<HTMLElement>('.kani-cue')!;
  const cueText = g.paused ? '잠깐 쉬어요' : g.startCue ? '카운터를 보세요' : g.current ? '←/→로 책장을 고르고 Space, 또는 책장을 눌러요!' : g.phase === 'intro' ? '카운터를 보세요' : '정리 끝!';
  if (cue.textContent !== cueText) cue.textContent = cueText;
  host.querySelector<HTMLElement>('.kani-timer')!.hidden = g.phase === 'intro' || !!g.startCue;
  host.querySelector<HTMLElement>('.kani-timer span')!.style.width = `${g.interactive && g.current ? Math.max(0, 1 - g.bookTime / KANI_RULES.bookSeconds) * 100 : 0}%`;
  const progress = host.querySelector<HTMLElement>('.kani-progress')!;
  const marks = g.books.map((_, i) => g.outcomes[i] === undefined ? '○' : g.outcomes[i] === 'sorted' ? '●' : '◇').join(' ');
  if (progress.textContent !== marks) progress.textContent = marks;
  progress.setAttribute('aria-label', `${g.bookCount}권 중 ${g.judgedCount}권 정리 완료`);
  return view;
}
