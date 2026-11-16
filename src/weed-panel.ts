import { WeedGame, WEED_RULES } from './weed-game';

let host: HTMLElement | null = null;
let current: WeedGame | null = null;
const outcomeText = { pulled: '쏙!', passed: '꽃 지켰어!', missed: '놓쳤어', wrong: '앗, 꽃이야!' } as const;

/** The shell owns keyboard input and start/result/pause controls. */
export function mountWeedPanel(root: HTMLElement, onPull: () => void) {
  if (host === root) return;
  host = root;
  root.innerHTML = `<div class="weed-helper"><span class="weed-hachiware" role="img" aria-label="하치와레"></span><span>풀은 쏙! 꽃은 그대로!</span></div>
    <div class="weed-stage"><div class="weed-center" aria-hidden="true"></div><div class="weed-row">${Array.from({ length: WEED_RULES.tiles }, (_, i) => `<div class="weed-tile" data-index="${i}"><span class="weed-plant" aria-hidden="true"></span><span class="weed-outcome"></span></div>`).join('')}</div></div>
    <div class="weed-cue" role="status"></div><div class="weed-timer" aria-hidden="true"><span></span></div>
    <div class="weed-progress" aria-label="진행 상황"></div><button type="button" class="weed-pull">뽑기 · Space</button>`;
  const button = root.querySelector<HTMLButtonElement>('.weed-pull')!;
  const pull = () => { if (current?.interactive && !current.paused) onPull(); };
  button.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    e.preventDefault(); pull();
  });
  button.addEventListener('click', e => { if (e.detail === 0) pull(); });
}

export interface WeedView { buttonText: string; buttonDisabled: boolean }
export function renderWeedPanel(g: WeedGame): WeedView {
  const view = { buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '뽑기', buttonDisabled: false };
  if (!host) return view;
  current = g;
  // Snap at the same one-second boundaries as the judgement. A CSS transition would misrepresent the active tile.
  const offset = g.phase === 'intro' ? 0 : Math.min(g.tileCount - 1, Math.floor(g.time / WEED_RULES.stepSeconds + 1e-9));
  host.querySelectorAll<HTMLElement>('.weed-tile').forEach((tile, i) => {
    tile.style.left = `calc(50% + ${i - offset} * var(--weed-step))`;
    tile.dataset.kind = g.row[i];
    tile.dataset.outcome = g.outcomes[i] ?? '';
    tile.classList.toggle('is-current', g.centerIndex === i);
    tile.setAttribute('aria-label', `${i + 1}번째 ${g.row[i] === 'weed' ? '풀' : '꽃'}${g.outcomes[i] ? ` · ${outcomeText[g.outcomes[i]!]}` : ''}`);
    tile.querySelector<HTMLElement>('.weed-plant')!.textContent = g.row[i] === 'flower' ? '✿' : '';
    tile.querySelector<HTMLElement>('.weed-outcome')!.textContent = g.outcomes[i] ? outcomeText[g.outcomes[i]!] : '';
  });
  const cue = host.querySelector<HTMLElement>('.weed-cue')!;
  const cueText = g.paused ? '잠깐 쉬어요' : g.centerIndex >= 0 ? g.row[g.centerIndex] === 'weed' ? '중앙의 풀을 뽑아요!' : '꽃이에요, 기다려요!' : g.phase === 'intro' ? '가운데 칸을 보세요' : '풀뽑기 끝!';
  if (cue.textContent !== cueText) cue.textContent = cueText;
  host.querySelector<HTMLElement>('.weed-timer span')!.style.width = `${g.interactive ? Math.max(0, 1 - g.tileTime / WEED_RULES.stepSeconds) * 100 : 0}%`;
  const progress = host.querySelector<HTMLElement>('.weed-progress')!;
  const marks = g.row.map((_, i) => g.outcomes[i] === undefined ? '○' : ['pulled', 'passed'].includes(g.outcomes[i]!) ? '●' : '◇').join(' ');
  if (progress.textContent !== marks) progress.textContent = marks;
  progress.setAttribute('aria-label', `${g.tileCount}개 중 ${g.judgedCount}개 판정 완료`);
  host.querySelector<HTMLButtonElement>('.weed-pull')!.disabled = !g.interactive || g.paused;
  return view;
}
