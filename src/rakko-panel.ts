// Screen for the Rakko subjugation mini game (converge timing). Temporary shapes only (no new art yet); it draws
// from the game's state and never changes it. Input goes through main.ts like the other mini games.
// Top: Rakko (left) and the small monster (right) face each other. Bottom: a horizontal rail with a green target box
// in the middle and two red notes that slide in from both ends; press when they overlap in the box.
import { RakkoGame, RAKKO_RULES, type RakkoGrade } from './rakko-game';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
export interface RakkoView { buttonText: string; buttonDisabled: boolean }
const GRADE_TEXT: Record<RakkoGrade, string> = { perfect: '퍼펙트!', good: '굿!', miss: '미스…' };
const MISS_TEXT = { early: '너무 일러요', late: '너무 늦었어요' } as const;

/** Positions every frame; rewrites text only when the state key changes. */
export function renderRakko(g: RakkoGame, state: { key: string }): RakkoView {
  const stage = $('rakko-stage'), left = $('rakko-note-l'), right = $('rakko-note-r');
  const p = g.noteProgress;
  left.hidden = right.hidden = p === null || p > 1.35;
  if (p !== null) { left.style.left = `${p * 50}%`; right.style.left = `${100 - p * 50}%`; }
  stage.classList.toggle('telegraph', g.phase === 'playing' && g.stage === 'telegraph');
  stage.classList.toggle('paused', g.paused);
  const feedback = g.phase === 'playing' && g.stage === 'feedback' && g.lastGrade !== null;
  // Attack: Rakko lunges and the monster is hit on a perfect or good; on a miss the monster shrugs it off.
  stage.dataset.attack = feedback ? (g.lastGrade === 'miss' ? 'miss' : 'hit') : '';
  const label = $('rakko-feedback');
  label.hidden = !feedback;
  if (feedback) {
    const reason = g.lastGrade === 'miss' ? g.misses[g.round] : undefined;
    label.textContent = reason ? `${GRADE_TEXT.miss} ${MISS_TEXT[reason]}` : GRADE_TEXT[g.lastGrade!];
    label.dataset.grade = g.lastGrade!;
  }
  // Progress as shapes, not colours alone: ● judged, ○ still to come. No score.
  $('rakko-progress').textContent = Array.from({ length: RAKKO_RULES.rounds }, (_, n) => (g.grades[n] !== undefined ? '●' : '○')).join(' ');
  const view: RakkoView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '지금!',
    buttonDisabled: false,
  };
  const key = `${g.seed}:${g.phase}:${g.paused}`;
  if (key === state.key) return view;
  state.key = key;
  const done = g.phase === 'result';
  $('mini-title').textContent = g.phase === 'intro' ? '랏코 스승의 맹수 토벌 훈련' : done ? g.reaction : '';
  $('mini-copy').textContent = g.phase === 'intro' ? '양쪽에서 빨간 동그라미가 가운데 초록 칸으로 모여요. 두 동그라미가 딱 겹치는 순간 버튼이나 Space를 눌러 공격! 모두 세 번!' : '';
  $('mini-paused').hidden = !g.paused;
  $('mini-reward').textContent = done && g.reward
    ? `동전 +${g.coinReward} · 체력 +${g.reward.stamina} · ${g.reward.speedMultiplier}배 속도 ${g.reward.seconds}초` : '';
  return view;
}
