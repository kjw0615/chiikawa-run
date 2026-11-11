// Start only after assets are ready and three visible seconds have elapsed.
export function createRunReady() {
  const screen = document.getElementById('run-ready')!;
  const number = document.getElementById('ready-number')!;
  const resume = document.getElementById('ready-resume') as HTMLButtonElement;
  let active = false, paused = false, remaining = 3, last = 0, frame = 0;
  let complete = () => {};
  function tick(now: number) {
    if (!active) return;
    if (!paused && !document.hidden && last) remaining -= Math.min((now - last) / 1000, .1);
    last = now;
    const label = paused ? 'Ⅱ' : String(Math.max(1, Math.ceil(remaining)));
    if (number.textContent !== label) number.textContent = label;
    if (remaining <= 0) {
      active = false; screen.hidden = true; complete(); return;
    }
    frame = requestAnimationFrame(tick);
  }
  function pause() {
    if (!active) return;
    paused = true; resume.hidden = false; number.textContent = 'Ⅱ';
  }
  resume.addEventListener('click', () => {
    if (!active) return;
    paused = false; last = 0; resume.hidden = true;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  screen.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    (resume.hidden ? screen : resume).focus();
  });
  return {
    get active() { return active; },
    pause,
    start(onComplete: () => void) {
      cancelAnimationFrame(frame);
      complete = onComplete; remaining = 3; last = 0; active = true;
      paused = document.hidden; screen.hidden = false; resume.hidden = !paused;
      number.textContent = paused ? 'Ⅱ' : '3';
      screen.focus({ preventScroll: true });
      frame = requestAnimationFrame(tick);
    },
    cancel() { active = false; cancelAnimationFrame(frame); screen.hidden = true; },
  };
}
