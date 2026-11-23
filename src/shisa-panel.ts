import { ShisaGame, SHISA_RULES, SHISA_TOPPINGS, type ShisaTopping } from './shisa-game';

const LABEL: Record<ShisaTopping, string> = { chashu: '차슈', egg: '달걀', nori: '김', naruto: '나루토 어묵' };
const ART = '/assets/shisa/';
const FEEDBACK = { success: '주문대로 완성! 자동으로 서빙했어요', wrong: '앗, 주문과 다른 재료나 개수예요! 다음 주문에 도전!', timeout: '주문 시간이 끝났어요. 다음 주문에 도전!' };
export interface ShisaPanelActions { serve(): void; choose(topping: ShisaTopping): void }
export interface ShisaView { buttonText: string; buttonDisabled: boolean }
let host: HTMLElement | null = null;
let current: ShisaGame | null = null;
const CSS = `
.mini-card:has(#shisa-panel:not([hidden])) .mini-heading:has(#mini-title:empty),.mini-card:has(#shisa-panel:not([hidden])) .mini-copy:empty,.mini-card:has(#shisa-panel:not([hidden])) .mini-reward:empty{display:none}
.shisa-prototype{color:#624e49;text-align:center}.shisa-prototype *{box-sizing:border-box}
.shisa-helper{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 auto 7px;line-height:1.5;font-weight:bold}.shisa-helper img{width:58px;height:68px;object-fit:contain}.shisa-instructions{padding:10px;background:#fff4df;border-radius:16px;line-height:1.6}
.shisa-work{padding:10px;border:2px solid #c9ae87;border-radius:18px;background:#fffaf0}.shisa-comparison{display:grid;grid-template-columns:1fr 1fr;gap:8px}.shisa-ticket,.shisa-kitchen{min-width:0;border:2px dashed #b69d79;border-radius:12px;padding:6px;background:#fffef9}.shisa-kitchen{border-style:solid;border-color:#c3d4a3;background:#f9fbed}.shisa-heading{display:block;font-size:14px;margin-bottom:2px}
.shisa-ramen{position:relative;width:100%;max-width:260px;aspect-ratio:3/2;margin:auto}.shisa-base{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.shisa-topping{position:absolute;width:34%;height:32%;object-fit:fill;transform:translate(-50%,-50%);pointer-events:none}.shisa-topping[data-slot="0"]{left:32%;top:28%}.shisa-topping[data-slot="1"]{left:68%;top:28%}.shisa-topping[data-slot="2"]{left:32%;top:62%}.shisa-topping[data-slot="3"]{left:68%;top:62%}.shisa-bowl .shisa-topping{animation:shisa-drop .18s ease-out both}.shisa-prototype.is-paused .shisa-topping{animation-play-state:paused}
.shisa-recipe{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;min-height:31px;margin:2px 0}.shisa-recipe-item{display:inline-flex;align-items:center;gap:3px;border:1px solid #dec9a7;border-radius:8px;padding:3px 5px;background:#fff4de;font-size:16px;font-weight:bold}.shisa-recipe-item img{width:28px;height:28px;object-fit:contain}.shisa-filled{font-size:15px;min-height:31px;display:flex;justify-content:center;align-items:center}
.shisa-timer{height:6px;border-radius:6px;background:#e7dbca;margin:8px 0;overflow:hidden}.shisa-timer span{display:block;height:100%;background:#8aaa71}
.shisa-carousel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:9px 0}.shisa-option{min-width:0;min-height:78px;padding:4px 2px;border:3px solid #d4c2ab;border-radius:13px;background:#fff4df;color:#624e49;font:inherit;font-size:13px;touch-action:manipulation;user-select:none;cursor:pointer}.shisa-option img{display:block;margin:auto;width:45px;height:40px;object-fit:contain}.shisa-option[aria-current=true]{border-color:#6c8e4e;background:#e9f3c7;color:#445e35;box-shadow:0 0 0 2px #c5d9a6}.shisa-option:disabled{opacity:.5;cursor:default}
.shisa-current{font-weight:bold;min-height:24px;margin:5px}.shisa-pick{display:block;margin:7px auto;min-width:210px;max-width:100%;min-height:48px;padding:8px 18px;border:3px solid #78915b;border-radius:18px;font:bold 17px sans-serif;color:#4e633e;background:#e6efce;touch-action:manipulation;user-select:none;cursor:pointer}.shisa-pick:disabled{opacity:.5;cursor:default}.shisa-pick:active:not(:disabled){filter:brightness(.95)}
.shisa-progress{min-height:25px;letter-spacing:8px;margin:6px}.shisa-feedback{min-height:40px;padding:6px;color:#527447;font-weight:bold}.shisa-feedback[data-outcome=wrong],.shisa-feedback[data-outcome=timeout]{color:#a45d54}.shisa-help{font-size:12px;margin:6px 0;color:#826e5d}
@keyframes shisa-drop{from{opacity:.3;transform:translate(-50%,-75%) scale(.85)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@media(prefers-reduced-motion:reduce){.shisa-bowl .shisa-topping{animation:none}}
@media(max-width:420px){.shisa-work{padding:7px}.shisa-comparison{gap:5px}.shisa-ticket,.shisa-kitchen{padding:4px}.shisa-carousel{gap:5px}.shisa-recipe-item{font-size:15px;padding:3px}.shisa-heading{font-size:13px}}
@media(max-height:520px) and (orientation:landscape){.shisa-helper{margin:0;font-size:13px}.shisa-helper img{width:34px;height:38px}.shisa-ramen{max-width:155px}.shisa-work{padding:5px}.shisa-option{min-height:44px;font-size:12px}.shisa-option img{display:inline-block;vertical-align:middle;width:30px;height:27px;margin-right:4px}.shisa-carousel{margin:5px 0}.shisa-pick{min-height:36px;margin:4px auto;padding:4px 14px;font-size:14px}.shisa-feedback{min-height:23px;padding:3px}.shisa-help{margin:2px}.shisa-current{min-height:18px;font-size:13px;margin:2px}.shisa-heading{font-size:12px}.shisa-recipe{min-height:22px}.shisa-recipe-item{font-size:15px}.shisa-recipe-item img{width:24px;height:24px}.shisa-filled{min-height:22px}}
`;

/** The shell owns the clock and keyboard input; pointer choices are atomic, one topping per gesture. */
export function mountShisaPanel(root: HTMLElement, actions: ShisaPanelActions): void {
  if (host === root) return;
  host = root; current = null;
  root.innerHTML = `<style>${CSS}</style><div class="shisa-prototype">
    <div class="shisa-helper"><img src="/assets/event-shisa.webp" alt="라멘을 든 시사"><span>주문과 같은 라멘을 만들어요!</span></div>
    <p class="shisa-instructions">주문서의 재료와 개수를 보고 담아요.<br>← / → 선택 후 Space 또는 재료 터치, 순서는 자유예요.</p>
    <div class="shisa-work" hidden><div class="shisa-comparison">
      <div class="shisa-ticket"><strong class="shisa-heading">완성 목표</strong><div class="shisa-ramen shisa-target" role="img"></div><div class="shisa-recipe"></div></div>
      <div class="shisa-kitchen"><strong class="shisa-heading">내 라멘</strong><div class="shisa-ramen shisa-bowl" role="img"></div><div class="shisa-filled"></div></div>
    </div><div class="shisa-timer" aria-hidden="true"><span></span></div>
      <div class="shisa-carousel" role="group" aria-label="원하는 재료를 누르면 바로 담아요">${SHISA_TOPPINGS.map(key => `<button type="button" class="shisa-option" data-topping="${key}" aria-label="${LABEL[key]} 바로 담기"><img src="${ART}${key}.webp" alt="">${LABEL[key]}</button>`).join('')}</div>
      <p class="shisa-current"></p><button type="button" class="shisa-pick">담기 · Space</button>
    </div><p class="shisa-feedback" role="status" aria-live="polite"></p><div class="shisa-progress" aria-label="주문 진행 상황"></div>
    <p class="shisa-help">← / → 선택 · Space 담기 · 클릭/터치도 바로 담기</p></div>`;
  // Warm the bowl during the intro, before it is revealed on the first order.
  const preload = new Image(); preload.src = `${ART}ramen-bowl.webp`;
  root.querySelectorAll<HTMLImageElement>('img').forEach(img => img.addEventListener('error', () => { img.hidden = true; }));
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

function describe(toppings: readonly ShisaTopping[]) {
  return SHISA_TOPPINGS.flatMap(key => {
    const count = toppings.filter(t => t === key).length;
    return count ? [`${LABEL[key]} ${count}개`] : [];
  }).join(', ');
}

/** Fixed recipe slots keep duplicates separate and both bowls spatially identical, regardless of input order. */
function ramen(root: HTMLElement, order: readonly ShisaTopping[], selected: readonly ShisaTopping[]) {
  const signature = `${order.join(',')}:${selected.join(',')}`;
  if (root.dataset.recipe === signature) return;
  root.dataset.recipe = signature;
  if (!root.querySelector('.shisa-base')) {
    const base = document.createElement('img'); base.className = 'shisa-base'; base.src = `${ART}ramen-bowl.webp`; base.alt = '';
    root.append(base);
  }
  const available = new Map<ShisaTopping, number>();
  for (const t of selected) available.set(t, (available.get(t) ?? 0) + 1);
  order.forEach((key, slot) => {
    const count = available.get(key) ?? 0;
    const old = root.querySelector<HTMLImageElement>(`[data-slot="${slot}"]`);
    if (!count) { old?.remove(); return; }
    available.set(key, count - 1);
    if (old?.dataset.kind === key) return;
    old?.remove();
    const img = document.createElement('img'); img.className = 'shisa-topping'; img.dataset.slot = String(slot); img.dataset.kind = key;
    img.src = `${ART}${key}.webp`; img.alt = ''; root.append(img);
  });
  root.querySelectorAll<HTMLElement>('[data-slot]').forEach(img => { if (Number(img.dataset.slot) >= order.length) img.remove(); });
  root.setAttribute('aria-label', selected.length ? describe(selected) : '아직 재료를 담지 않은 라멘');
}

export function renderShisaPanel(g: ShisaGame): ShisaView {
  const view: ShisaView = {
    buttonText: g.paused ? '계속하기' : g.phase === 'intro' ? '준비됐어요! 시작' : g.phase === 'result' ? '달리기로 돌아가기' : '담기',
    buttonDisabled: g.phase === 'playing' && !g.paused && !g.canPress,
  };
  if (!host) return view;
  current = g;
  host.querySelector('.shisa-prototype')!.classList.toggle('is-paused', g.paused);
  const intro = g.phase === 'intro';
  host.querySelector<HTMLElement>('.shisa-instructions')!.hidden = !intro;
  host.querySelector<HTMLElement>('.shisa-work')!.hidden = intro || ['result', 'countdown', 'done'].includes(g.phase);
  host.querySelector<HTMLElement>('.shisa-help')!.hidden = !g.interactive;
  ramen(host.querySelector<HTMLElement>('.shisa-target')!, g.order, g.order);
  ramen(host.querySelector<HTMLElement>('.shisa-bowl')!, g.order, g.selected);
  const recipe = host.querySelector<HTMLElement>('.shisa-recipe')!;
  const signature = g.order.join(',');
  if (recipe.dataset.recipe !== signature) {
    recipe.dataset.recipe = signature;
    recipe.innerHTML = SHISA_TOPPINGS.flatMap(key => {
      const count = g.order.filter(t => t === key).length;
      return count ? [`<span class="shisa-recipe-item" data-kind="${key}" data-count="${count}"><img src="${ART}${key}.webp" alt="">${LABEL[key]} ×${count}</span>`] : [];
    }).join('');
  }
  host.querySelector<HTMLElement>('.shisa-filled')!.textContent = `${g.selected.length} / ${g.order.length}개 · 다 담으면 서빙!`;
  host.querySelector<HTMLElement>('.shisa-timer span')!.style.width = `${100 * g.remaining / SHISA_RULES.orderSeconds}%`;
  host.querySelectorAll<HTMLButtonElement>('[data-topping]').forEach(cell => {
    cell.setAttribute('aria-current', String(cell.dataset.topping === g.highlightedTopping)); cell.disabled = !g.canPress;
  });
  host.querySelector<HTMLButtonElement>('.shisa-pick')!.disabled = !g.canPress;
  const text = g.highlightedTopping ? `지금 선택: ${LABEL[g.highlightedTopping]}` : '서빙 중…';
  const currentLabel = host.querySelector<HTMLElement>('.shisa-current')!;
  if (currentLabel.textContent !== text) currentLabel.textContent = text;
  const feedback = host.querySelector<HTMLElement>('.shisa-feedback')!;
  const feedbackText = g.paused ? '잠깐 쉬어요' : g.lastOutcome ? FEEDBACK[g.lastOutcome] : g.interactive ? `${g.round + 1}번째 주문 · 재료와 개수만 맞으면 돼요!` : '';
  if (feedback.textContent !== feedbackText) feedback.textContent = feedbackText;
  feedback.dataset.outcome = g.lastOutcome ?? '';
  const progress = host.querySelector<HTMLElement>('.shisa-progress')!;
  const marks = Array.from({ length: SHISA_RULES.orders }, (_, i) => g.outcomes[i] === undefined ? '○' : g.outcomes[i] === 'success' ? '●' : '◇').join(' ');
  if (progress.textContent !== marks) progress.textContent = marks;
  progress.setAttribute('aria-label', `${SHISA_RULES.orders}주문 중 ${g.outcomes.length}주문 완료`);
  return view;
}
