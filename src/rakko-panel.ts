// Screen for the Rakko subjugation mini game (converge-timing battle). Official art when every image loads, otherwise
// plain shapes; it draws from the game state and never changes it. Input goes through main.ts like the other games.
// The small monster stands in the middle under a faint horizontal line; two small round objects slide in from both
// ends of the line and overlap above it. Rakko stands to its left. The monster HP bar and the remaining chances
// are shapes only: no numbers, no score.
import { RakkoGame, RAKKO_RULES, type RakkoGrade } from './rakko-game';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
export interface RakkoView { buttonText: string; buttonDisabled: boolean }
const GRADE_TEXT: Record<RakkoGrade, string> = { critical: '크리티컬!', normal: '명중!', miss: '빗나갔어요' };
const MISS_TEXT = { early: '너무 일러요', late: '너무 늦었어요' } as const;

// The art is switched on for the whole panel only after every image has loaded; a missing file keeps the shapes.
const ART = ['rakko-idle', 'rakko-attack', 'rakko-miss', 'monster-idle', 'monster-hit', 'monster-miss', 'note-red', 'hit-effect'];
let artState: 'idle' | 'loading' | 'failed' | 'ready' = 'idle';
function loadArt(panel: HTMLElement) {
  if (artState !== 'idle') return;
  artState = 'loading'; let left = ART.length;
  for (const name of ART) {
    const img = new Image();
    img.onload = () => { if (--left === 0 && artState === 'loading') { artState = 'ready'; panel.dataset.art = '1'; } };
    img.onerror = () => { artState = 'failed'; };
    img.src = `/assets/${name}.webp`;
  }
}
let pips: HTMLElement[] | undefined;

/** Positions every frame; rewrites text only when the state key changes. */
export function renderRakko(g: RakkoGame, state: { key: string }): RakkoView {
  loadArt($('rakko-panel'));
  const stage = $('rakko-stage'), left = $('rakko-note-l'), right = $('rakko-note-r');
  const p = g.noteProgress;
  left.hidden = right.hidden = p === null || p > 1.35;
  if (p !== null) { left.style.left = `${p * 50}%`; right.style.left = `${100 - p * 50}%`; }
  stage.classList.toggle('telegraph', g.phase === 'playing' && g.stage === 'telegraph');
  stage.classList.toggle('paused', g.paused);
  const feedback = g.phase === 'playing' && g.stage === 'feedback' && g.lastGrade !== null;
  // Attack: Rakko lunges; the monster is knocked back (more on a critical); on a miss it shrugs it off.
  stage.dataset.attack = feedback ? g.lastGrade! : '';
  stage.dataset.result = g.phase === 'result' ? (g.won ? 'win' : 'lose') : '';
  const label = $('rakko-feedback');
  label.hidden = !feedback;
  if (feedback) {
    const reason = g.lastGrade === 'miss' ? g.misses[g.round] : undefined;
    label.textContent = reason ? `${GRADE_TEXT.miss} · ${MISS_TEXT[reason]}` : GRADE_TEXT[g.lastGrade!];
    label.dataset.grade = g.lastGrade!;
  }
  // Monster HP: one pip per HP point, shown as a bar (no number). Remaining chances: filled = used, empty = left.
  const hp = $('rakko-hp');
  if (!pips) pips = Array.from({ length: RAKKO_RULES.monsterHp }, () => { const i = document.createElement('i'); hp.append(i); return i; });
  const alive = g.monsterHp;
  pips.forEach((i, n) => i.classList.toggle('lost', n >= alive));
  $('rakko-progress').textContent = Array.from({ length: RAKKO_RULES.chances }, (_, n) => (g.grades[n] !== undefined ? '●' : '○')).join(' ');
  const view: RakkoView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '지금!',
    buttonDisabled: false,
  };
  const key = `${g.seed}:${g.phase}:${g.paused}`;
  if (key === state.key) return view;
  state.key = key;
  const done = g.phase === 'result';
  $('mini-title').textContent = g.phase === 'intro' ? '랏코 스승의 맹수 토벌 훈련' : done ? g.reaction : '';
  $('mini-copy').textContent = g.phase === 'intro' ? '선 양쪽 끝에서 동그라미가 가운데로 모여요. 두 동그라미가 딱 겹치는 순간 버튼이나 Space를 눌러 공격! 기회는 다섯 번, 크리티컬이면 두 배!' : '';
  $('mini-paused').hidden = !g.paused;
  $('mini-reward').textContent = done && g.reward
    ? `동전 +${g.coinReward} · 체력 +${g.reward.stamina} · ${g.reward.speedMultiplier}배 속도 ${g.reward.seconds}초` : '';
  return view;
}
