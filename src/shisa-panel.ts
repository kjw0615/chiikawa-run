import { ShisaGame, SHISA_RULES, SHISA_TOPPINGS, type ShisaTopping } from './shisa-game';

const LABEL: Record<ShisaTopping, string> = { chashu: '차슈', egg: '달걀', nori: '김' };
const SYMBOL: Record<ShisaTopping, string> = { chashu: '◎', egg: '◒', nori: '▰' };
const FEEDBACK = { success: '주문대로 완성! 자동으로 서빙했어요', wrong: '토핑 순서가 달라요. 다음 주문에 도전!', timeout: '주문 시간이 끝났어요. 다음 주문에 도전!' };
export interface ShisaPanelActions {
  /** Confirm the cursor or take a clicked/tapped topping directly, then redraw. */
  serve(): void;
  choose(topping: ShisaTopping): void;
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
.shisa-token{display:inline-flex;align-items:center;justify-content:center;flex-direction:column;width:70px;min-height:58px;border:2px solid transparent;border-radius:12px;background:#ffefdc;color:#624e49;font-size:14px}
.shisa-token b{font-size:25px;font-weight:normal;line-height:30px}.shisa-token[data-kind=egg]{background:#fff0b8}.shisa-token[data-kind=nori]{background:#e1edce}.shisa-token.is-next{border-color:#b18235}
.shisa-bowl{margin:10px auto;border:3px solid #9b7961;border-top:0;border-radius:0 0 44px 44px;background:#f8e3bd;max-width:260px;padding:6px}
.shisa-timer{height:6px;border-radius:6px;background:#e7dbca;margin:10px 0;overflow:hidden}.shisa-timer span{display:block;height:100%;background:#8aaa71}
.shisa-carousel{display:flex;justify-content:center;gap:8px;margin:10px 0}.shisa-option{flex:1;max-width:115px;min-height:68px;padding:5px;border:3px solid #d4c2ab;border-radius:14px;background:#fff4df;color:#624e49;font:inherit;touch-action:manipulation;user-select:none;cursor:pointer}.shisa-option b{display:block;font-size:26px}.shisa-option[aria-current=true]{border-color:#6c8e4e;background:#e9f3c7;color:#445e35;box-shadow:0 0 0 2px #c5d9a6}.shisa-option:disabled{opacity:.5;cursor:default}
.shisa-current{font-weight:bold;min-height:24px;margin:5px}.shisa-pick{display:block;margin:8px auto;min-width:220px;max-width:100%;min-height:56px;padding:10px 18px;border:3px solid #78915b;border-radius:18px;font:bold 19px sans-serif;color:#4e633e;background:#e6efce;touch-action:manipulation;user-select:none;cursor:pointer}.shisa-pick:disabled{opacity:.5;cursor:default}.shisa-pick:active:not(:disabled){filter:brightness(.95)}
.shisa-progress{min-height:25px;letter-spacing:8px;margin:8px}.shisa-feedback{min-height:44px;padding:8px;color:#527447;font-weight:bold}.shisa-feedback[data-outcome=wrong],.shisa-feedback[data-outcome=timeout]{color:#a45d54}.shisa-help{font-size:13px;margin:8px 0;color:#826e5d}
@media(max-width:420px){.shisa-work{padding:8px}.shisa-token{width:62px}.shisa-carousel{gap:5px}.shisa-option{min-height:62px}}
@media(max-height:520px) and (orientation:landscape){.shisa-order,.shisa-bowl{min-height:38px}.shisa-token{min-height:32px}.shisa-token b{font-size:18px;line-height:20px}.shisa-bowl{margin:4px auto}.shisa-carousel{margin:5px 0}.shisa-option{min-height:40px}.shisa-option b{display:inline;font-size:20px;margin-right:8px}.shisa-feedback{min-height:26px;padding:3px}.shisa-help{margin:3px}.shisa-work{padding:6px}.shisa-pick{min-height:40px;margin:4px auto;padding:5px 18px}.shisa-current{font-size:14px;min-height:18px;margin:2px}}
`;

/** Mount once. The shell routes arrows to moveCursor and Space to press(); buttons handle direct choices. */
export function mountShisaPanel(root: HTMLElement, actions: ShisaPanelActions): void {
  if (host === root) return;
  host = root; current = null;
  root.innerHTML = `<style>${CSS}</style><div class="shisa-prototype">
    <p class="shisa-instructions">← / →로 토핑을 골라 Space로 담아요. 원하는 토핑을 클릭하거나 터치하면 바로 담겨요. 두 개를 담으면 자동 서빙!</p>
    <div class="shisa-work" hidden><div class="shisa-ticket"><strong>주문서 · 왼쪽부터 순서대로</strong><div class="shisa-order"></div></div>
      <div class="shisa-bowl" aria-label="담은 토핑"></div><div class="shisa-timer" aria-hidden="true"><span></span></div>
      <div class="shisa-carousel" role="group" aria-label="원하는 토핑을 누르면 바로 담아요">${SHISA_TOPPINGS.map(key => `<button type="button" class="shisa-option" data-topping="${key}" aria-label="${LABEL[key]} 바로 담기"><b aria-hidden="true">${SYMBOL[key]}</b>${LABEL[key]}</button>`).join('')}</div>
      <p class="shisa-current"></p><button type="button" class="shisa-pick">담기 · Space</button>
    </div><p class="shisa-feedback" role="status" aria-live="polite"></p><div class="shisa-progress" aria-label="주문 진행 상황"></div>
    <p class="shisa-help">← / → 선택 · Space 담기 · 토핑 직접 클릭/터치도 바로 담기</p></div>`;
  for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
    const activate = () => {
      if (!current?.canPress || button.disabled) return;
      const topping = button.dataset.topping as ShisaTopping | undefined;
      if (topping) actions.choose(topping); else actions.serve();
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
  root.dataset.tokens = signature; root.replaceChildren();
  const count = empty ? SHISA_RULES.toppingsPerOrder : toppings.length;
  for (let i = 0; i < count; i++) {
    const cell = document.createElement('span'); cell.className = 'shisa-token';
    const key = toppings[i]; cell.dataset.kind = key ?? '';
    const symbol = document.createElement('b'); symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = key ? SYMBOL[key] : '＋';
    const label = document.createElement('span'); label.textContent = key ? `${i + 1}. ${LABEL[key]}` : `${i + 1}. 빈칸`;
    cell.append(symbol, label); root.append(cell);
  }
}

export function renderShisaPanel(g: ShisaGame): ShisaView {
  const view: ShisaView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '담기',
    buttonDisabled: g.phase === 'playing' && !g.paused && !g.canPress,
  };
  if (!host) return view;
  current = g;
  const intro = g.phase === 'intro';
  host.querySelector<HTMLElement>('.shisa-instructions')!.hidden = !intro;
  host.querySelector<HTMLElement>('.shisa-work')!.hidden = intro || ['result', 'countdown', 'done'].includes(g.phase);
  host.querySelector<HTMLElement>('.shisa-help')!.hidden = !g.interactive;
  const order = host.querySelector<HTMLElement>('.shisa-order')!;
  tokens(order, g.order, false); tokens(host.querySelector<HTMLElement>('.shisa-bowl')!, g.selected, true);
  [...order.children].forEach((cell, i) => cell.classList.toggle('is-next', g.interactive && i === g.selected.length));
  host.querySelector<HTMLElement>('.shisa-timer span')!.style.width = `${100 * g.remaining / SHISA_RULES.orderSeconds}%`;
  host.querySelectorAll<HTMLButtonElement>('[data-topping]').forEach(cell => {
    cell.setAttribute('aria-current', String(cell.dataset.topping === g.highlightedTopping)); cell.disabled = !g.canPress;
  });
  const pick = host.querySelector<HTMLButtonElement>('.shisa-pick')!; pick.disabled = !g.canPress;
  const highlighted = g.highlightedTopping;
  const text = highlighted ? `지금 선택: ${LABEL[highlighted]}` : '서빙 중…';
  const currentLabel = host.querySelector<HTMLElement>('.shisa-current')!;
  if (currentLabel.textContent !== text) currentLabel.textContent = text;
  const feedback = host.querySelector<HTMLElement>('.shisa-feedback')!;
  const feedbackText = g.paused ? '잠깐 쉬어요' : g.lastOutcome ? FEEDBACK[g.lastOutcome] : g.phase === 'result' ? g.reaction : g.interactive ? `${g.round + 1}번째 주문 · 주문 순서대로 골라 담기!` : '';
  if (feedback.textContent !== feedbackText) feedback.textContent = feedbackText;
  feedback.dataset.outcome = g.lastOutcome ?? '';
  const progress = host.querySelector<HTMLElement>('.shisa-progress')!;
  const marks = Array.from({ length: SHISA_RULES.orders }, (_, i) => g.outcomes[i] === undefined ? '○' : g.outcomes[i] === 'success' ? '●' : '◇').join(' ');
  if (progress.textContent !== marks) progress.textContent = marks;
  progress.setAttribute('aria-label', `${SHISA_RULES.orders}주문 중 ${g.outcomes.length}주문 완료`);
  return view;
}
