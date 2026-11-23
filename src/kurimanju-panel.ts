// Screen for the kurimanju mini game. It only draws from the game's state; input goes through main.ts.
import { KurimanjuGame } from './kurimanju-game';
import { renderBeerPour } from './beer-pour-view';
import { describeReward } from './mini-tier';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
export interface KuriView { buttonText: string; buttonDisabled: boolean }

/** Draws the cheap part (fill levels, guide lines) every frame and rewrites text only when the state key changes. */
export function renderKurimanju(g: KurimanjuGame, state: { key: string }): KuriView {
  renderBeerPour(g);
  $('kuri-beer-line').hidden = g.phase === 'intro';
  $('kuri-foam-line').hidden = g.phase === 'intro';
  const view: KuriView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '꾹 눌러서 따르기',
    buttonDisabled: false,
  };
  const key = `${g.phase}:${g.paused}`;
  if (key === state.key) return view;
  state.key = key;
  // Results show only the reward; character dialogue will be added after it is decided.
  const done = g.phase === 'result';
  $('mini-title').textContent = g.phase === 'intro' ? '쿠리만쥬에게 맥주 따라주기' : '';
  $('mini-copy').textContent = g.phase === 'intro' ? 'Space나 버튼을 누르고 있다가 맥주선에서 놓아요. 한 번 더 눌러 거품선까지 채워요.' : '';
  $('mini-paused').hidden = !g.paused;
  $('mini-reward').textContent = done && g.reward
    ? describeReward(g.reward) : '';
  return view;
}
