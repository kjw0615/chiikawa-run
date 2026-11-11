import Phaser from 'phaser';
import './style.css';
import { RunnerModel, RULES } from './model';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let model = new RunnerModel();
let best = 0; try { best = Number(localStorage.getItem('little-escape-best') || 0); } catch { /* Storage optional. */ }
let accumulator = 0, crouchHeld = false, lastPhase = '', lastEvent = '', toastTime = 0;
const overlay = $('overlay'), start = $('start'), pause = $<HTMLButtonElement>('pause');
function begin() { model = new RunnerModel(Date.now()); model.start(); accumulator = 0; crouchHeld = false; lastPhase = ''; lastEvent = ''; toastTime = 0; updateHud(); }
function togglePause() { if (model.phase === 'running') model.pause(); else if (model.phase === 'paused') { model.start(); accumulator = 0; } updateHud(); }
function endOverlay() {
  const over = model.phase === 'over';
  $('modal-kicker').textContent = over ? 'CAUGHT! TRY ONE MORE?' : 'TAKE A LITTLE BREATH';
  $('modal-title').innerHTML = over ? '앗, 붙잡혔다!' : '잠깐 쉬어 가요.';
  $('modal-copy').innerHTML = over ? '음식을 챙기고, 장애물을 넘으면<br>이번에는 더 멀리 갈 수 있어요.' : '추격자도, 체력도 함께 멈췄어요.<br>준비되면 다시 달려요.';
  $('result').hidden = !over;
  $('result').textContent = `${Math.floor(model.distance)} m · 최고 ${best} m`;
  start.innerHTML = over ? '다시 도주하기 <span>↗</span>' : '계속 달리기 <span>→</span>';
}
function updateHud() {
  $('stamina-number').textContent = String(Math.ceil(model.stamina));
  $('stamina-fill').style.width = `${model.stamina}%`;
  $('stamina-fill').style.background = model.stamina < 25 ? '#d38366' : '#3e9f83';
  $('distance').textContent = String(Math.floor(model.distance));
  $('gap-number').textContent = `${model.gap.toFixed(1)} m`;
  $('gap-fill').style.width = `${model.gap / RULES.maxGap * 100}%`;
  $('gap-fill').style.background = model.gap < 12 ? '#ed9b8c' : '#b2e4ce';
  $('gap-marker').style.left = `${model.gap / RULES.maxGap * 100}%`;
  $('chase-hint').textContent = model.gap < 12 ? '바로 뒤예요! 음식을 챙기세요' : '거리가 0이 되면 붙잡혀요';
  const status = $('status');
  status.textContent = model.rescue ? '자동 점프로 안전한 길에 복귀 중!' : model.boost > 0 ? `무적 가속 ×1.5 · ${model.boost.toFixed(1)}초` : model.exhausted ? '탈진! 음식을 먹으면 다시 빨라져요' : toastTime > 0 ? lastEvent : model.distance < 14 ? '파란 음식 +16 · 황금은 +20 체력' : model.distance < 23 ? '낮은 장애물은 점프로 넘어요 ↑' : model.distance < 35 ? '천장 아래는 ↓ 앉기만 가능해요' : model.distance < 58 ? '높은 벽은 점프 후 한 번 더 ↑↑' : model.distance < 85 ? '긴 장애물은 2단 점프 타이밍을 조절하세요' : '구덩이도 점프! 빠지면 자동으로 올라와요';
  status.className = `status ${model.boost > 0 ? 'boost' : model.exhausted || model.gap < 12 ? 'danger' : ''}`;
  pause.disabled = model.phase === 'ready' || model.phase === 'over';
  pause.textContent = model.phase === 'paused' ? '▶' : 'Ⅱ';
  pause.setAttribute('aria-label', model.phase === 'paused' ? '계속하기' : '일시정지');
  if (lastPhase !== model.phase) {
    if (model.phase === 'over') { best = Math.max(best, Math.floor(model.distance)); try { localStorage.setItem('little-escape-best', String(best)); } catch { /* Storage optional. */ } }
    overlay.hidden = model.phase === 'running';
    if (model.phase === 'paused' || model.phase === 'over') endOverlay();
    lastPhase = model.phase;
  }
}
class RunnerScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  create() {
    this.g = this.add.graphics();
    for (let i = 0; i < 4; i++) this.labels.push(this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '11px', color: '#607f74', fontStyle: 'bold' }).setOrigin(.5));
  }
  update(_time: number, delta: number) {
    if (model.phase === 'running') {
      accumulator += Math.min(delta / 1000, .05);
      while (accumulator >= 1 / 120) { model.crouch = crouchHeld; model.step(1 / 120); accumulator -= 1 / 120; }
      toastTime = Math.max(0, toastTime - delta / 1000);
      while (model.events.length) { const e = model.events.shift()!; if (e !== '점프' && e !== '더블 점프') { lastEvent = e; toastTime = 1.1; } }
    }
    updateHud(); this.draw();
  }
  private draw() {
    const g = this.g, floor = RULES.floor, x = 560, progress = model.distance * RULES.scale;
    g.clear(); g.fillStyle(0xe7f0eb).fillRect(0, 0, 1120, 630);
    g.fillStyle(0xf5edd5).fillCircle(913, 127, 49); g.fillStyle(0xffffff, .46).fillCircle(913, 127, 65);
    // Distant rounded terrain moves slower than the running ground.
    for (let i = -1; i < 6; i++) { const hx = i * 310 - (progress * .14 % 310); g.fillStyle(i % 2 ? 0xcbded6 : 0xd7e4dc).fillEllipse(hx + 140, 406, 440, 260); }
    for (let i = -1; i < 11; i++) { const tx = i * 145 - (progress * .38 % 145); g.fillStyle(0xadcabb, .5).fillRoundedRect(tx + 17, 333 + i % 3 * 13, 16, 110, 8); g.fillStyle(0xbdd6c5, .7).fillCircle(tx + 25, 322 + i % 3 * 13, 34); }
    g.fillStyle(0x799a81).fillRect(0, floor, 1120, 8); g.fillStyle(0x426754).fillRect(0, floor + 8, 1120, 40); g.fillStyle(0x233f36).fillRect(0, floor + 48, 1120, 200);
    for (let i = 0; i < 25; i++) { const gx = i * 53 - progress % 53; g.fillStyle(0x557760).fillRoundedRect(gx, floor + 22 + i % 2 * 6, 20, 3, 2); }
    g.lineStyle(1, 0x436453, .4).lineBetween(0, 485, 1120, 485);
    for (const label of this.labels) label.setVisible(false);
    let labelIndex = 0;
    for (const item of model.items) {
      if (item.used && item.kind !== 'pit') continue;
      const ix = x + (item.x - model.distance) * RULES.scale;
      if (ix < -100 || ix > 1230) continue;
      if (item.kind === 'food') {
        g.fillStyle(0x80bda9, .12).fillCircle(ix, item.y + 16, 28);
        g.fillStyle(0x5ba9ba).fillCircle(ix, item.y + 16, 16); g.fillStyle(0xe5f6eb).fillCircle(ix - 4, item.y + 11, 4);
      } else if (item.kind === 'gold') {
        const iy = item.y + 16; g.fillStyle(0xe9c565, .15).fillCircle(ix, iy, 36 + Math.sin(model.elapsed * 5) * 3);
        g.fillStyle(0xf0c45d).fillTriangle(ix, iy - 23, ix + 21, iy, ix, iy + 23).fillTriangle(ix, iy - 23, ix - 21, iy, ix, iy + 23);
        g.lineStyle(2, 0xffefb2).lineBetween(ix, iy - 10, ix + 8, iy);
      } else if (item.kind === 'pit') {
        const bx = ix - item.w / 2;
        g.fillStyle(0x142e2b).fillRect(bx, floor, item.w, 170);
        g.fillStyle(0x091f20).fillRect(bx + 9, floor + 20, item.w - 18, 150);
        g.lineStyle(4, 0xe9bc76).lineBetween(bx, floor, bx, floor + 24).lineBetween(bx + item.w, floor, bx + item.w, floor + 24);
        if (labelIndex < 4 && ix > 610) this.labels[labelIndex++].setText('↑ 끊어진 길').setPosition(ix, floor - 50).setVisible(true);
      } else {
        const bx = ix - item.w / 2;
        g.fillStyle(0x153a30, .10).fillEllipse(ix, floor + 3, item.w + 15, 11);
        g.fillStyle(item.kind === 'tower' ? 0xb69bc9 : item.kind === 'beam' ? 0xcf947b : 0xde9b7f).fillRoundedRect(bx, item.y, item.w, item.h, 6);
        g.fillStyle(0xffffff, .22).fillRoundedRect(bx + 5, item.y + 5, item.w - 10, 6, 3);
        g.lineStyle(2, 0xffffff, .3); for (let j = 11; j < item.w - 6; j += 16) g.lineBetween(bx + j, item.y + 16, bx + j + 7, item.y + 25);
        if (item.kind === 'beam') { g.fillStyle(0xad755f).fillRect(bx, 0, item.w, item.y + 5); }
        if (labelIndex < 4 && ix > 610) { this.labels[labelIndex++].setText(item.kind === 'beam' ? '↓ 앉아서 통과' : item.kind === 'tower' ? '↑↑ 높은 벽' : item.kind === 'long' ? '↑…↑ 긴 장애물' : '↑ 점프').setPosition(ix, item.kind === 'beam' ? item.y + 78 : item.y - 22).setVisible(true); }
      }
    }
    // The pursuer enters from the left only as the logical distance closes.
    const cx = x - model.gap * RULES.scale;
    if (cx > -120) {
      const bob = Math.sin(model.elapsed * 13) * 4;
      g.fillStyle(0x21382e, .13).fillEllipse(cx, floor + 3, 97, 13);
      g.fillStyle(0x745c85).fillTriangle(cx - 50, floor, cx + 51, floor, cx + 10, floor - 94 + bob);
      g.fillStyle(0x856b95).fillTriangle(cx - 29, floor - 33, cx + 69, floor - 10, cx + 42, floor - 78 + bob);
      g.fillStyle(0xfbe5d5).fillCircle(cx + 20, floor - 45 + bob, 5).fillCircle(cx + 39, floor - 41 + bob, 5);
      g.fillStyle(0x2c293e).fillCircle(cx + 22, floor - 45 + bob, 2).fillCircle(cx + 41, floor - 41 + bob, 2);
    }
    const heroX = x - 34 * Math.sin(Math.PI * Math.min(1, model.hitFlash / RULES.hitInvulnerability));
    const h = model.height, top = model.y - h, stride = model.phase === 'running' && model.grounded ? Math.sin(model.elapsed * 19) * 7 : 0;
    g.fillStyle(0x1d4e3d, .15).fillEllipse(heroX, floor + 3, model.grounded ? 85 : 55, 15);
    if (model.boost > 0) {
      for (let i = 1; i < 5; i++) { g.fillStyle(0xf3d073, .3 / i).fillRoundedRect(heroX - 32 - i * 24, top + 6, 64, h - 8, 14); }
      g.lineStyle(3, 0xf5dd90).strokeRoundedRect(heroX - 38, top - 6, 76, h + 12, 19);
    }
    if (!(model.hitFlash > 0 && Math.floor(model.hitFlash * 18) % 2)) {
      g.fillStyle(model.exhausted ? 0xd1b18b : 0x79c8aa).fillRoundedRect(heroX - 32, top, 64, h - 5, 15);
      g.fillStyle(0xffffff, .25).fillRoundedRect(heroX - 25, top + 7, 48, 9, 5);
      g.fillStyle(0x244c42).fillCircle(heroX + 4, top + Math.min(33, h / 2), 4).fillCircle(heroX + 23, top + Math.min(33, h / 2), 4);
      g.lineStyle(3, 0x244c42).lineBetween(heroX + 9, top + Math.min(49, h - 9), heroX + 19, top + Math.min(49, h - 9));
      g.fillStyle(0x306b56).fillRoundedRect(heroX - 21 + stride, model.y - 10, 18, 11, 4).fillRoundedRect(heroX + 8 - stride, model.y - 10, 18, 11, 4);
    }
  }
}
new Phaser.Game({ type: Phaser.AUTO, width: 1120, height: 630, parent: 'game', backgroundColor: '#e7f0eb', scene: RunnerScene, render: { antialias: true, roundPixels: false }, audio: { noAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });
start.addEventListener('click', () => { if (model.phase === 'paused') { model.start(); accumulator = 0; updateHud(); } else begin(); });
$('restart').addEventListener('click', begin); pause.addEventListener('click', togglePause);
const jumpButton = $('jump'), crouchButton = $('crouch');
jumpButton.addEventListener('pointerdown', e => { e.preventDefault(); model.jump(); });
crouchButton.addEventListener('pointerdown', e => { e.preventDefault(); crouchHeld = true; crouchButton.classList.add('held'); crouchButton.setPointerCapture(e.pointerId); });
function release() { crouchHeld = false; crouchButton.classList.remove('held'); }
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) crouchButton.addEventListener(event, release);
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp') { if (model.phase === 'ready' || model.phase === 'over') begin(); else if (model.phase === 'paused') togglePause(); else model.jump(); }
  if (e.code === 'ArrowDown') { crouchHeld = true; crouchButton.classList.add('held'); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', e => { if (e.code === 'ArrowDown') release(); });
function backgroundPause() { release(); model.pause(); updateHud(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundPause(); });
window.addEventListener('blur', backgroundPause);
window.addEventListener('orientationchange', backgroundPause);
