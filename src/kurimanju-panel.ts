// Screen for the kurimanju mini game. It only draws from the game's state; input goes through main.ts.
import { KurimanjuGame } from './kurimanju-game';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
export interface KuriView { buttonText: string; buttonDisabled: boolean }

/** Draws the cheap part (fill levels, guide lines) every frame and rewrites text only when the state key changes. */
export function renderKurimanju(g: KurimanjuGame, state: { key: string }): KuriView {
  $('kuri-beer').style.height = `${g.beer * 100}%`;
  const foam = $('kuri-foam').style; foam.bottom = `${g.beer * 100}%`; foam.height = `${g.foam * 100}%`;
  // Both guide lines are visible from the very start.
  $('kuri-beer-line').style.bottom = `${g.beerLine * 100}%`; $('kuri-foam-line').style.bottom = `${g.foamLine * 100}%`;
  $('kuri-glass').classList.toggle('pouring', g.phase.endsWith('pour') && !g.paused);
  const view: KuriView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '꾹 눌러서 따르기',
    buttonDisabled: false,
  };
  const key = `${g.phase}:${g.paused}`;
  if (key === state.key) return view;
  state.key = key;
  // While playing there is no text at all: the verdict and the reaction come only with the result.
  const done = g.phase === 'result';
  $('mini-title').textContent = g.phase === 'intro' ? '쿠리만쥬에게 맥주 따라주기' : done ? g.reaction : '';
  $('mini-copy').textContent = g.phase === 'intro' ? '버튼을 꾹 눌러 맥주를 따르고 맥주선에서 떼요. 이어서 꾹 눌러 거품선에서 떼면 끝!'
    : ''; // the result shows only the reaction and the reward, never a score or grade
  $('mini-paused').hidden = !g.paused;
  $('mini-reward').textContent = done && g.reward
    ? `동전 +${g.coinReward} · 체력 +${g.reward.stamina} · ${g.reward.speedMultiplier}배 속도 ${g.reward.seconds}초` : '';
  return view;
}
