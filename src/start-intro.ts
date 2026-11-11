// Keep cinematic playback outside the game loop: no game time passes here.
export function createStartIntro(onComplete: () => void) {
  const screen = document.getElementById('start-intro')!;
  const video = document.getElementById('intro-video') as HTMLVideoElement;
  const skip = document.getElementById('intro-skip') as HTMLButtonElement;
  const resume = document.getElementById('intro-resume') as HTMLButtonElement;
  const loading = document.getElementById('intro-loading')!;
  const home = document.getElementById('home-screen')!;
  let active = false, seen = false, timeout: ReturnType<typeof setTimeout> | undefined;
  function finish() {
    if (!active) return;
    if (document.hidden) { video.pause(); return; }
    active = false;
    clearTimeout(timeout);
    video.pause();
    video.removeAttribute('src');
    video.load();
    screen.hidden = true;
    home.inert = false;
    document.body.style.overflow = '';
    onComplete();
    document.getElementById('pause')?.focus({ preventScroll: true });
  }
  // Only abandon stalled loading/playback; do not cut off a healthy video.
  function watchProgress() {
    clearTimeout(timeout);
    if (active && !document.hidden) timeout = setTimeout(finish, 30000);
  }
  function play() {
    resume.hidden = true;
    clearTimeout(timeout);
    watchProgress();
    void video.play().catch(() => {
      if (!active) return;
      clearTimeout(timeout);
      resume.hidden = false;
    });
  }
  video.addEventListener('playing', () => { loading.hidden = true; });
  video.addEventListener('waiting', () => { loading.hidden = false; });
  video.addEventListener('timeupdate', watchProgress);
  video.addEventListener('ended', finish);
  video.addEventListener('error', finish);
  skip.addEventListener('click', finish);
  resume.addEventListener('click', () => video.ended || video.error ? finish() : play());
  screen.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    (resume.hidden || document.activeElement === resume ? skip : resume).focus();
  });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) {
      clearTimeout(timeout);
      video.pause();
      resume.hidden = false;
    }
  });
  return {
    get active() { return active; },
    start() {
      if (active) return;
      if (seen) { onComplete(); return; }
      seen = active = true;
      home.inert = true;
      loading.hidden = false;
      screen.hidden = false;
      document.body.style.overflow = 'hidden';
      video.src = '/assets/start-intro-720p.mp4';
      skip.focus({ preventScroll: true });
      play();
    },
    skip: finish,
  };
}
