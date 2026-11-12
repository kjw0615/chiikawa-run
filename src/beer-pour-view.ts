import type { KurimanjuGame } from './kurimanju-game';

type Bubble = { el: HTMLElement; x: number; speed: number; offset: number };
type Layers = { beer: HTMLElement; foam: HTMLElement; body: HTMLElement; surface: HTMLElement; foamBody: HTMLElement; cap: HTMLElement; stream: HTMLElement; wrap: HTMLElement; glass: HTMLElement; bubbles: Bubble[] };
let layers: Layers | undefined;
let reducedMotion: MediaQueryList | undefined;
let current: KurimanjuGame | undefined, visualTime = 0, lastAt = 0, wasActive = false;

function mount(): Layers {
  const beer = document.getElementById('kuri-beer')!, foam = document.getElementById('kuri-foam')!, glass = document.getElementById('kuri-glass')!, wrap = glass.parentElement!;
  const add = (parent: HTMLElement, name: string) => {
    const el = document.createElement('span'); el.className = name; el.setAttribute('aria-hidden', 'true'); parent.append(el); return el;
  };
  const body = add(beer, 'kuri-beer-body'), surface = add(beer, 'kuri-beer-surface');
  const foamBody = add(foam, 'kuri-foam-body'), cap = add(foam, 'kuri-foam-cap');
  add(wrap, 'kuri-handle'); add(wrap, 'kuri-lip');
  add(glass, 'kuri-shine'); add(glass, 'kuri-shine small');
  const stream = add(wrap, 'kuri-stream');
  const bubbles = Array.from({ length: 14 }, (_, n) => {
    const el = add(beer, 'kuri-bubble'), size = 2 + n % 4 * .65;
    el.style.width = el.style.height = `${size}px`;
    return { el, x: 8 + n * 29 % 84, speed: 15 + n % 5 * 5, offset: n * 17.3 };
  });
  return { beer, foam, body, surface, foamBody, cap, stream, wrap, glass, bubbles };
}

/** Presentation only. Fill/guide values always come directly from the model;
 * the separate clock animates textures and pauses with the existing game rules. */
export function renderBeerPour(g: KurimanjuGame) {
  const v = layers ??= mount(), now = performance.now(), active = !g.paused && !document.hidden;
  if (current !== g) { current = g; visualTime = 0; lastAt = now; wasActive = false; }
  if (active && wasActive) visualTime += Math.min(.05, Math.max(0, (now - lastAt) / 1000));
  lastAt = now; wasActive = active;

  // Collect geometry before writing styles; bubbles use the same numeric fill
  // height, so no second layout read is needed after changing the liquid level.
  const innerHeight = v.glass.clientHeight, innerWidth = v.glass.clientWidth, bottomInset = v.wrap.clientHeight - innerHeight;
  const height = g.beer * innerHeight;
  v.beer.style.height = `${g.beer * 100}%`;
  v.foam.style.bottom = `${g.beer * 100}%`; v.foam.style.height = `${g.foam * 100}%`;
  v.body.style.backgroundSize = `100% ${innerHeight}px`;
  const capHeight = innerWidth * 1.02 * 96 / 512;
  v.cap.style.height = `${capHeight}px`; v.foamBody.style.top = `${Math.max(0, capHeight - 4)}px`;
  // Include the glass's bottom border, so the guide and visible liquid use
  // the same inner-glass coordinate system at every responsive size.
  document.getElementById('kuri-beer-line')!.style.bottom = `${bottomInset + g.beerLine * innerHeight}px`;
  document.getElementById('kuri-foam-line')!.style.bottom = `${bottomInset + g.foamLine * innerHeight}px`;

  const reduced = (reducedMotion ??= window.matchMedia('(prefers-reduced-motion: reduce)')).matches;
  const t = reduced ? 0 : visualTime, pouring = g.phase.endsWith('pour'), wave = pouring ? 1 : .3;
  v.surface.style.transform = `translateY(${1 + Math.sin(t * 5.2) * wave}px) scaleX(${1.015 + Math.sin(t * 3) * .007})`;
  v.cap.style.transform = `translateY(${Math.sin(t * 3.1) * .65}px) scaleX(${1.008 + Math.sin(t * 2.3) * .006})`;
  for (const b of v.bubbles) {
    const y = (t * b.speed + b.offset) % Math.max(1, height + 12);
    b.el.hidden = reduced;
    b.el.style.left = `${b.x + Math.sin(t * 1.5 + b.offset) * 1.1}%`; b.el.style.bottom = `${y - 6}px`;
    b.el.style.opacity = String(g.beer > .025 ? .12 + .38 * Math.sin(Math.PI * Math.min(1, y / Math.max(1, height))) : 0);
  }
  v.glass.classList.toggle('pouring', pouring && active);
  v.stream.classList.toggle('white', g.phase === 'foam-pour'); v.stream.classList.toggle('on', pouring && active);
  v.stream.style.height = `${24 + (1 - (g.phase === 'foam-pour' ? g.foamTop : g.beer)) * innerHeight}px`;
  v.stream.style.backgroundPosition = `center ${t * 85}px`;
  v.stream.style.transform = `translateX(${Math.sin(t * 12) * .4}px)`;
}
