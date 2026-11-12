// Screen for the kurimanju mini game. It only draws from the game's state; input goes through main.ts.
import { KurimanjuGame, KURI_RULES, type Grade } from './kurimanju-game';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const GRADE_TEXT: Record<Grade, string> = { perfect: '퍼펙트! +4', good: '굿 +2', bad: '배드 +0' };
// The inner glass height in px is measured from the element so the guide lines follow any layout.
const TITLES: Record<string, string> = {
  'intro': '쿠리만쥬에게 맥주 따라주기', 'beer-ready': '맥주를 따라요', 'beer-pour': '따르는 중…', 'beer-feedback': '',
  'foam-ready': '이번엔 거품!', 'foam-pour': '거품을 따르는 중…', 'foam-feedback': '', 'result': '', 'countdown': '', 'done': '',
};
export interface KuriView { buttonText: string; buttonDisabled: boolean }

/** Draws every frame the cheap part (fill levels, guide lines) and rewrites text only when `key` changes. */
export function renderKurimanju(g: KurimanjuGame, state: { key: string }): KuriView {
  const glass = $('kuri-glass'), h = glass.clientHeight;
  $('kuri-beer').style.height = `${g.beer * 100}%`;
  const foam = $('kuri-foam').style; foam.bottom = `${g.beer * 100}%`; foam.height = `${g.foam * 100}%`;
  $('kuri-beer-line').style.bottom = `${g.beerLine * 100}%`;
  // Both guide lines are visible from the very start.
  $('kuri-foam-line').style.bottom = `${g.foamLine * 100}%`;
  $('kuri-glass').classList.toggle('pouring', g.phase.endsWith('pour') && !g.paused);
  void h;
  const view: KuriView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '꾹 눌러서 따르기',
    buttonDisabled: g.phase.endsWith('feedback') && !g.paused,
  };
  const key = `${g.phase}:${g.beerGrade}:${g.foamGrade}:${g.paused}`;
  if (key === state.key) return view;
  state.key = key;
  let title = TITLES[g.phase] ?? '';
  if (g.phase === 'beer-feedback' && g.beerGrade) title = `맥주 ${GRADE_TEXT[g.beerGrade]}`;
  if (g.phase === 'foam-feedback' && g.foamGrade) title = `거품 ${GRADE_TEXT[g.foamGrade]}`;
  if (g.phase === 'result') title = g.reaction;
  $('mini-title').textContent = title;
  $('mini-copy').textContent = g.phase === 'intro' ? '버튼을 꾹 눌러 맥주를 따르고 맥주선에서 떼요. 다시 꾹 눌러 거품선에서 떼면 끝!'
    : g.phase === 'result' ? `${g.score} / ${KURI_RULES.maxScore}점! 달리기 화면으로 돌아가 준비한 뒤 출발해요.`
    : g.phase === 'beer-ready' || g.phase === 'beer-pour' || g.phase === 'beer-feedback' ? '주황 점선(맥주선)에 맞춰 떼요.' : '회색 점선(거품선)에 맞춰 떼요.';
  $('mini-paused').hidden = !g.paused;
  $('mini-reward').textContent = g.phase === 'result' && g.reward
    ? `동전 +${g.coinReward} · 체력 +${g.reward.stamina} · ${g.reward.speedMultiplier}배 속도 ${g.reward.seconds}초` : '';
  return view;
}
