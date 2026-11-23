import { ShisaGame, SHISA_RULES, SHISA_TOPPINGS, type ShisaTopping } from './shisa-game';

const LABEL: Record<ShisaTopping, string> = { chashu: '차슈', egg: '달걀', nori: '김' };
const SYMBOL: Record<ShisaTopping, string> = { chashu: '◎', egg: '◒', nori: '▰' };
const FEEDBACK = { success: '주문대로 완성! 서빙했어요', wrong: '토핑 순서가 달라요. 다음 주문에 도전!', timeout: '주문 시간이 끝났어요. 다음 주문에 도전!' };
export interface ShisaPanelActions {
  choose(topping: ShisaTopping): void;
  serve(): void;
  undo(): void;
}
export interface ShisaView { buttonText: string; buttonDisabled: boolean }
let host: HTMLElement | null = null;
let current: ShisaGame | null = null;

const CSS = `
.shisa-prototype{color:#624e49;text-align:center}.shisa-prototype *{box-sizing:border-box}
.shisa-instructions{padding:14px;background:#fff4df;border-radius:16px;line-height:1.6}
.shisa-work{padding:12px;border:2px solid #c9ae87;border-radius:18px;background:#fffaf0}
.shisa-ticket{border:2px dashed #b69d79;border-radius:10px;padding:8px;background:#fffef9}
.shisa-order,.shisa-bowl{display:flex;justify-content:center;align-items:center;gap:12px;min-height:68px}
.shisa-token{display:inline-flex;align-items:center;justify-content:center;flex-direction:column;width:70px;min-height:58px;border-radius:12px;background:#ffefdc;color:#624e49;font-size:14px}
.shisa-token b{font-size:25px;font-weight:normal;line-height:30px}.shisa-token[data-kind=egg]{background:#fff0b8}.shisa-token[data-kind=nori]{background:#e1edce}
.shisa-bowl{margin:10px auto;border:3px solid #9b7961;border-top:0;border-radius:0 0 44px 44px;background:#f8e3bd;max-width:260px;padding:6px}
.shisa-timer{height:6px;border-radius:6px;background:#e7dbca;margin:10px 0;overflow:hidden}.shisa-timer span{display:block;height:100%;background:#8aaa71}
.shisa-choices{display:flex;justify-content:center;gap:8px;margin:12px 0}.shisa-choices button{flex:1;max-width:115px;min-height:68px;border:2px solid #b39373;border-radius:14px;background:#fff4df;color:inherit;font:inherit}
.shisa-choices button b{display:block;font-size:26px}.shisa-actions{display:flex;justify-content:center;gap:10px}.shisa-actions button{min-height:46px;padding:8px 16px;border:2px solid #9f7c64;border-radius:14px;font:inherit;color:inherit;background:#e6efce}.shisa-actions button:first-child{background:#fff1e6}
.shisa-prototype button{touch-action:manipulation;user-select:none;cursor:pointer}.shisa-prototype button:disabled{opacity:.5;cursor:default}.shisa-prototype button:active:not(:disabled){filter:brightness(.95)}
.shisa-progress{min-height:25px;letter-spacing:8px;margin:8px}.shisa-feedback{min-height:44px;padding:8px;color:#527447;font-weight:bold}.shisa-feedback[data-outcome=wrong],.shisa-feedback[data-outcome=timeout]{color:#a45d54}.shisa-help{font-size:13px;margin:8px 0;color:#826e5d}
@media(max-width:420px){.shisa-work{padding:8px}.shisa-token{width:62px}.shisa-choices{gap:5px}.shisa-actions button{padding:6px 12px}}
@media(max-height:520px) and (orientation:landscape){.shisa-order,.shisa-bowl{min-height:42px}.shisa-token{min-height:36px}.shisa-token b{font-size:20px;line-height:22px}.shisa-bowl{margin:5px auto}.shisa-choices{margin:5px 0}.shisa-choices button{min-height:42px}.shisa-choices button b{display:inline;font-size:20px;margin-right:8px}.shisa-feedback{min-height:30px;padding:3px}.shisa-help{margin:3px}.shisa-work{padding:6px}}
`;

/** Mount once. Callbacks must update the model, then call renderShisaPanel; the shell owns keyboard/start/pause/result. */
export function mountShisaPanel(root: HTMLElement, actions: ShisaPanelActions): void {
  if (host === root) return;
  host = root; current = null;
  root.innerHTML = `<style>${CSS}</style><div class="shisa-prototype">
    <p class="shisa-instructions">주문서의 토핑 두 개를 순서대로 담고 서빙해요. 세 주문을 끝까지 도전해요!</p>
    <div class="shisa-work" hidden><div class="shisa-ticket"><strong>주문서 · 왼쪽부터 순서대로</strong><div class="shisa-order"></div></div>
      <div class="shisa-bowl" aria-label="담은 토핑"></div><div class="shisa-timer" aria-hidden="true"><span></span></div>
      <div class="shisa-choices">${SHISA_TOPPINGS.map((key, i) => `<button type="button" data-topping="${key}"><b aria-hidden="true">${SYMBOL[key]}</b>${i + 1} · ${LABEL[key]}</button>`).join('')}</div>
      <div class="shisa-actions"><button type="button" data-action="undo">하나 되돌리기</button><button type="button" data-action="serve">서빙 · Space</button></div>
    </div><p class="shisa-feedback" role="status" aria-live="polite"></p><div class="shisa-progress" aria-label="주문 진행 상황"></div>
    <p class="shisa-help">1 / 2 / 3 토핑 선택 · Space 서빙 · Backspace 되돌리기</p></div>`;
  for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
    const activate = () => {
      if (!current?.interactive || current.paused || button.disabled) return;
      const topping = button.dataset.topping as ShisaTopping | undefined;
      if (topping) actions.choose(topping);
      else if (button.dataset.action === 'serve') actions.serve();
      else actions.undo();
    };
    button.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault(); activate();
    });
    button.addEventListener('click', event => { if (event.detail === 0) activate(); });
  }
}

function tokens(root: HTMLElement, toppings: readonly ShisaTopping[], empty: boolean) {
  const signature = `${toppings.join(',')}:${empty}`;
  if (root.dataset.tokens === signature) return;
  root.dataset.tokens = signature;
  root.replaceChildren();
  const count = empty ? SHISA_RULES.toppingsPerOrder : toppings.length;
  for (let i = 0; i < count; i++) {
    const cell = document.createElement('span'); cell.className = 'shisa-token';
    const key = toppings[i];
    cell.dataset.kind = key ?? '';
    const symbol = document.createElement('b'); symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = key ? SYMBOL[key] : '＋';
    const label = document.createElement('span'); label.textContent = key ? `${i + 1}. ${LABEL[key]}` : `${i + 1}. 빈칸`;
    cell.append(symbol, label); root.append(cell);
  }
}

export function renderShisaPanel(g: ShisaGame): ShisaView {
  const view: ShisaView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '서빙',
    buttonDisabled: g.phase === 'playing' && !g.paused && !g.canServe,
  };
  if (!host) return view;
  current = g;
  const intro = g.phase === 'intro';
  host.querySelector<HTMLElement>('.shisa-instructions')!.hidden = !intro;
  host.querySelector<HTMLElement>('.shisa-work')!.hidden = intro || ['result', 'countdown', 'done'].includes(g.phase);
  host.querySelector<HTMLElement>('.shisa-help')!.hidden = !g.interactive;
  tokens(host.querySelector<HTMLElement>('.shisa-order')!, g.order, false);
  tokens(host.querySelector<HTMLElement>('.shisa-bowl')!, g.selected, true);
  host.querySelector<HTMLElement>('.shisa-timer span')!.style.width = `${100 * g.remaining / SHISA_RULES.orderSeconds}%`;
  const active = g.interactive && !g.paused;
  host.querySelectorAll<HTMLButtonElement>('[data-topping]').forEach(button => { button.disabled = !active || g.selected.length >= SHISA_RULES.toppingsPerOrder; });
  host.querySelector<HTMLButtonElement>('[data-action=serve]')!.disabled = !g.canServe;
  host.querySelector<HTMLButtonElement>('[data-action=undo]')!.disabled = !active || g.selected.length === 0;
  const feedback = host.querySelector<HTMLElement>('.shisa-feedback')!;
  const text = g.paused ? '잠깐 쉬어요' : g.lastOutcome ? FEEDBACK[g.lastOutcome] : g.phase === 'result' ? g.reaction : g.interactive ? `${g.round + 1}번째 주문 · 토핑을 담고 서빙하세요` : '';
  if (feedback.textContent !== text) feedback.textContent = text;
  feedback.dataset.outcome = g.lastOutcome ?? '';
  const progress = host.querySelector<HTMLElement>('.shisa-progress')!;
  const marks = Array.from({ length: SHISA_RULES.orders }, (_, i) => g.outcomes[i] === undefined ? '○' : g.outcomes[i] === 'success' ? '●' : '◇').join(' ');
  if (progress.textContent !== marks) progress.textContent = marks;
  progress.setAttribute('aria-label', `${SHISA_RULES.orders}주문 중 ${g.outcomes.length}주문 완료`);
  return view;
}
