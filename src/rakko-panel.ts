// Screen for the Rakko subjugation mini game. Temporary shapes only (no new art yet); it draws from the
// game's state and never changes it. Input goes through main.ts like the other mini games.
import { RakkoGame, RAKKO_RULES, type RakkoGrade } from './rakko-game';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
export interface RakkoView { buttonText: string; buttonDisabled: boolean }
const GRADE_TEXT: Record<RakkoGrade, string> = { perfect: '퍼펙트!', good: '굿!', miss: '미스…' };
const MISS_TEXT = { early: '너무 일러요', late: '너무 늦었어요' } as const;

/** Positions every frame; rewrites text only when the state key changes. */
export function renderRakko(g: RakkoGame, state: { key: string }): RakkoView {
  const stage = $('rakko-stage'), monster = $('rakko-monster'), warn = $('rakko-warn'), zone = $('rakko-zone');
  zone.style.left = `${RAKKO_RULES.zoneX * 100}%`;
  const x = g.monsterX;
  monster.hidden = x === null || x < -.1;
  if (x !== null) monster.style.left = `${Math.min(1.1, x) * 100}%`;
  warn.hidden = !(g.phase === 'playing' && g.stage === 'telegraph');
  stage.classList.toggle('swing', g.phase === 'playing' && g.stage === 'feedback' && g.lastGrade !== null && g.lastGrade !== 'miss');
  stage.classList.toggle('paused', g.paused);
  const feedback = $('rakko-feedback');
  const shown = g.phase === 'playing' && g.stage === 'feedback' && g.lastGrade !== null;
  feedback.hidden = !shown;
  if (shown) {
    const reason = g.lastGrade === 'miss' ? g.misses[g.round] : undefined;
    feedback.textContent = reason ? `${GRADE_TEXT.miss} ${MISS_TEXT[reason]}` : GRADE_TEXT[g.lastGrade!];
    feedback.dataset.grade = g.lastGrade!;
  }
  // Progress as shapes, not colours alone: ● judged, ○ still to come. No score.
  const dots = Array.from({ length: RAKKO_RULES.rounds }, (_, n) => (g.grades[n] !== undefined ? '●' : '○')).join(' ');
  $('rakko-progress').textContent = dots;
  const view: RakkoView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '지금!',
    buttonDisabled: false,
  };
  const key = `${g.seed}:${g.phase}:${g.paused}`;
  if (key === state.key) return view;
  state.key = key;
  const done = g.phase === 'result';
  $('mini-title').textContent = g.phase === 'intro' ? '랏코 스승의 맹수 토벌 훈련' : done ? g.reaction : '';
  $('mini-copy').textContent = g.phase === 'intro' ? '느낌표가 나오면 소형 몬스터가 달려와요. 점선 안에 들어왔을 때 버튼이나 Space를 한 번 눌러요. 모두 세 마리!' : '';
  $('mini-paused').hidden = !g.paused;
  $('mini-reward').textContent = done && g.reward
    ? `동전 +${g.coinReward} · 체력 +${g.reward.stamina} · ${g.reward.speedMultiplier}배 속도 ${g.reward.seconds}초` : '';
  return view;
}
