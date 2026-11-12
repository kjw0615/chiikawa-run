// Briefly reveal the loaded course before starting its clock. No numeric countdown.
export const START_TRANSITION_SECONDS = .5;
export function createRunReady() {
  const screen = document.getElementById('run-ready')!;
  const message = document.getElementById('ready-message')!;
  const resume = document.getElementById('ready-resume') as HTMLButtonElement;
  let active = false, paused = false, remaining = START_TRANSITION_SECONDS, last = 0, frame = 0;
  let complete = () => {};
  function tick(now: number) {
    if (!active) return;
    if (!paused && !document.hidden && last) remaining -= Math.min((now - last) / 1000, .1);
    last = now;
    screen.style.opacity = String(paused ? 1 : Math.max(0, remaining / START_TRANSITION_SECONDS));
    if (remaining <= 0) {
      active = false; screen.hidden = true; complete(); return;
    }
    frame = requestAnimationFrame(tick);
  }
  function pause() {
    if (!active) return;
    paused = true; resume.hidden = false; message.textContent = '잠깐 쉬어요'; screen.style.opacity = '1';
  }
  resume.addEventListener('click', () => {
    if (!active) return;
    paused = false; last = 0; resume.hidden = true; message.textContent = '출발!';
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  screen.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    screen.focus();
  });
  return {
    get active() { return active; },
    pause,
    start(onComplete: () => void) {
      cancelAnimationFrame(frame);
      complete = onComplete; remaining = START_TRANSITION_SECONDS; last = 0; active = true;
      paused = document.hidden; screen.hidden = false; resume.hidden = !paused;
      message.textContent = paused ? '잠깐 쉬어요' : '출발!'; screen.style.opacity = '1';
      screen.focus({ preventScroll: true });
      frame = requestAnimationFrame(tick);
    },
    cancel() { active = false; cancelAnimationFrame(frame); screen.hidden = true; },
  };
}
