import Phaser from 'phaser';
import './style.css';
import './minigame.css';
import { createStartIntro } from './start-intro';
import { createRunReady } from './run-ready';
import { RunnerModel, RULES } from './model';
import { Background } from './background';
import { StickerGame, MINI_RULES, CHARACTERS, type Character } from './sticker-game';
import { SlottedMiniGame, ROSTER, type RosterEntry } from './mini-roster';
import { KurimanjuGame } from './kurimanju-game';
import { renderKurimanju } from './kurimanju-panel';
import { MONSTER_HEIGHT, MONSTER_WIDTH, monsterX, smoothGap, chaseMarkerPercent } from './presentation';
let displayGap = RULES.initialGap;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ATLAS = 'game-art';
const EVENT_ATLAS = 'event-art';
const OBSTACLE_ATLAS = 'meadow-obstacles';
const FOOD = ['food-pudding', 'food-pancake', 'food-cream-puff'];
let model = new RunnerModel(), game: Phaser.Game | null = null, best = 0, accumulator = 0, crouchHeld = false, lastPhase = '';
let mini: SlottedMiniGame | null = null, encounterId: number | null = null, miniViewKey = '';
try { best = Number(localStorage.getItem('little-escape-best') || 0); } catch { /* optional */ }
const overlay = $('overlay'), start = $('start'), pause = $<HTMLButtonElement>('pause');
const home = $('home-screen'), play = $('play-screen');
const introSwitches = [$('show-intro'), $('overlay-show-intro')];
let showIntro = true;
for (const button of introSwitches) button.addEventListener('click', () => {
  showIntro = !showIntro;
  for (const peer of introSwitches) peer.setAttribute('aria-checked', String(showIntro));
});
// This dedicated game page owns Tab in every screen, including modal focus traps.
// Keyboard never selects or presses buttons: arrows and Enter lose their default action everywhere
// (the game's own key handler below still sees them), and no code moves focus onto a button.
const dropFocus = () => (document.activeElement as HTMLElement | null)?.blur?.();
window.addEventListener('keydown', e => {
  if (e.key === 'Tab' || e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
  if (e.code === 'Enter' || e.code === 'NumpadEnter' || (!typing && e.code.startsWith('Arrow'))) e.preventDefault();
}, { capture: true });
const loading = document.createElement('div');
loading.setAttribute('role', 'status'); loading.textContent = '모몽가가 숲으로 가는 중…';
Object.assign(loading.style, { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', background: '#fffdf6', color: '#624b4b', zIndex: '20', fontSize: '18px' });
const intro = createStartIntro(beginRun);
const ready = createRunReady();
let preparing = false;
let sceneReady = false;
function armStart() {
  if (!preparing) return;
  preparing = false;
  ready.start(() => {
    release(); releaseJump(); accumulator = 0;
    model.start(); updateHud(); dropFocus();
  });
}
function begin() {
  if (intro.active || ready.active || preparing) return;
  if (showIntro) {
    release(); releaseJump(); model.pause(); mini?.pause(); game?.loop.sleep();
    if (mini) { mini = null; encounterId = null; updateMini(); }
    intro.start();
  } else beginRun();
}
function beginRun() {
  mini = null; encounterId = null; miniViewKey = ''; updateMini();
  model = new RunnerModel(Date.now(), true, { coins: true, foodFreeDistance: 30, separateSpawns: true }); accumulator = 0; crouchHeld = false; lastPhase = ''; preparing = true;
  home.hidden = true; play.hidden = false; displayGap = model.gap; release(); releaseJump();
  if (!game) { play.appendChild(loading); game = new Phaser.Game({ type: Phaser.AUTO, width: 1120, height: 630, parent: 'game', backgroundColor: '#edf4e7', scene: RunnerScene, render: { antialias: true }, audio: { noAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } }); }
  else { game.loop.wake(); if (sceneReady) armStart(); }
  requestAnimationFrame(() => game?.scale.refresh());
  updateHud(); play.scrollIntoView({ block: 'center' });
}
function togglePause() {
  if (ready.active) { ready.pause(); return; }
  if (play.hidden) return;
  if (mini) { if (mini.paused) mini.resume(); else { mini.release(); mini.pause(); } release(); releaseJump(); accumulator = 0; updateMini(); updateHud(); return; }
  if (model.phase === 'running') { model.pause(); release(); releaseJump(); } else if (model.phase === 'paused') { model.start(); accumulator = 0; }
  updateHud();
}
function endOverlay() {
  const over = model.phase === 'over';
  $('pause-home').hidden = false;
  $('modal-kicker').textContent = over ? '한 번 더 달려볼까요?' : '모몽가도 잠깐 쉬어요';
  $('modal-title').textContent = over ? '앗, 붙잡혔다!' : '잠깐 쉬어 가요.';
  $('modal-copy').textContent = over ? '다음에는 조금 더 멀리 갈 수 있을 거예요.' : '준비되면 다시 달려요.';
  $('result').hidden = !over; $('result').textContent = `${Math.floor(model.distance)} m · 최고 ${best} m · 동전 ${model.coins}`;
  start.innerHTML = over ? '다시 달리기 <span>↗</span>' : '계속 달리기 <span>→</span>';
}
function updateHud() {
  $('stamina-fill').style.width = `${model.stamina}%`;
  $('stamina-fill').style.background = model.stamina < 25 ? '#e59992' : '#8bbf90';
  $('distance').textContent = String(Math.floor(model.distance));
  $('coin-count').textContent = String(model.coins);
  const gapFraction = (chaseMarkerPercent(model.phase === 'over' ? model.gap : displayGap) - 8) / 84;
  const chaserPercent = 100 - 92 * gapFraction;
  $('gap-fill').style.left = `${chaserPercent}%`; $('gap-fill').style.width = `${100 - chaserPercent}%`;
  $('gap-fill').style.background = model.gap < 12 ? '#ed9b8c' : '#9acbad';
  $('chase-monster').style.left = `${chaserPercent}%`;
  // Gameplay contains gauges, not tutorial prompts or obstacle labels.
  $('status').hidden = true; $('status').textContent = '';
  pause.disabled = model.phase === 'ready' || model.phase === 'over'; pause.classList.toggle('paused', model.phase === 'paused' || !!mini?.paused);
  play.classList.toggle('is-running', model.phase === 'running');
  pause.setAttribute('aria-label', model.phase === 'paused' || mini?.paused ? '계속하기' : '일시정지');
  if (lastPhase !== model.phase) {
    if (model.phase === 'over') { best = Math.max(best, Math.floor(model.distance)); try { localStorage.setItem('little-escape-best', String(best)); } catch { /* optional */ } }
    overlay.hidden = model.phase === 'ready' || model.phase === 'running' || model.phase === 'minigame';
    if (model.phase === 'paused' || model.phase === 'over') endOverlay(); lastPhase = model.phase;
  }
}
class RunnerScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hero!: Phaser.GameObjects.Image;
  private chaser!: Phaser.GameObjects.Image;
  private pool: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  private loadFailed = false;
  private world!: Phaser.GameObjects.Container;
  private playfield!: Phaser.GameObjects.Container;
  private cameraLift = 0;
  private bg = new Background(this);
  preload() {
    this.load.on('progress', (p: number) => { loading.textContent = `모몽가가 숲으로 가는 중… ${Math.round(p * 100)}%`; });
    this.load.on('loaderror', (file: { key: string }) => { if (!Background.owns(file.key)) this.loadFailed = true; });
    Background.preload(this);
    this.load.atlas(ATLAS, '/assets/game-atlas.webp', '/assets/game-atlas.json');
    this.load.atlas(EVENT_ATLAS, '/assets/event-atlas.webp', '/assets/event-atlas.json');
    this.load.atlas(OBSTACLE_ATLAS, '/assets/meadow-obstacles.webp', '/assets/meadow-obstacles.json');
    this.load.spritesheet('coin-spin', '/assets/coin-spin.webp', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('coin-gold-spin', '/assets/coin-gold-spin.webp', { frameWidth: 128, frameHeight: 128 });
  }
  create() {
    if (this.loadFailed) { preparing = false; model.pause(); loading.textContent = '이미지를 불러오지 못했어요. 새로고침해 주세요.'; this.scene.pause(); return; }
    this.world = this.add.container(0, 0);
    const scenery = this.add.container(0, 0);
    this.playfield = this.add.container(0, 0);
    this.world.add([scenery, this.playfield]);
    this.g = this.add.graphics(); this.hero = this.add.image(560, RULES.floor, ATLAS, 'momonga').setOrigin(.5, 1).setDepth(5);
    this.chaser = this.add.image(0, RULES.floor, ATLAS, 'dekatsuyo').setOrigin(.5, 1).setDepth(4);
    this.playfield.add([this.g, this.chaser, this.hero]);
    this.bg.build(scenery);
    this.scale.refresh(); loading.remove();
    sceneReady = true;
    armStart();
  }
  update(_time: number, delta: number) {
    if (model.phase === 'running') {
      accumulator += Math.min(delta / 1000, .05);
      while (accumulator >= 1 / 120) { model.crouch = crouchHeld; model.step(1 / 120); accumulator -= 1 / 120; }
    }
    if (model.activeEncounter && !mini) {
      encounterId = model.activeEncounter.id; mini = new SlottedMiniGame(model.activeEncounter.seed);
      miniViewKey = ''; accumulator = 0; release(); releaseJump();
    }
    if (mini) {
      mini.step(Math.min(delta / 1000, .05));
      if (mini.phase === 'done' && mini.reward && encounterId !== null) {
        model.completeEncounter(encounterId, { ...mini.reward, coins: mini.coinReward }); mini = null; encounterId = null; accumulator = 0;
      }
      updateMini();
    }
    if (model.phase === 'running') displayGap = smoothGap(displayGap, model.gap, Math.min(delta / 1000, .05));
    const targetLift = Math.max(0, 120 - (model.y - RULES.playerHeight));
    if (model.elapsed < .05) this.cameraLift = 0;
    if (model.phase === 'running') this.cameraLift = smoothGap(this.cameraLift, targetLift, Math.min(delta / 1000, .05));
    this.world.y = this.cameraLift;
    model.events.length = 0; updateHud(); this.draw();
  }
  private sprite(key: string | number, x: number, y: number, w: number, h: number, atlas = ATLAS) {
    let s = this.pool[this.cursor++];
    if (!s) { s = this.add.image(0, 0, atlas, key).setDepth(2); this.pool.push(s); this.playfield.addAt(s, this.playfield.length - 2); }
    return s.setTexture(atlas, key).setCrop().setPosition(x, y).setDisplaySize(w, h).setOrigin(.5).setRotation(0).setAlpha(1).clearTint().setVisible(true);
  }
  private obstaclePart(key: string, left: number, top: number, width: number, height: number, visibleWidth = width, visibleHeight = height) {
    const frame = this.textures.get(OBSTACLE_ATLAS).get(key);
    return this.sprite(key, left, top, width, height, OBSTACLE_ATLAS).setOrigin(0, 0)
      .setCrop(0, 0, frame.width * visibleWidth / width, frame.height * visibleHeight / height);
  }
  private curtain(x: number, top: number, bottom: number, width: number, gate = false) {
    const prefix = gate ? 'gate' : 'beam', bodyTop = top + 56, bodyBottom = bottom - 48;
    this.obstaclePart(`${prefix}-top`, x - width / 2, top, width, 56);
    // Repeat complete middle modules. Evenly distributing the final partial
    // height keeps both connection rows intact instead of cutting across leaves.
    const count = Math.max(1, Math.ceil((bodyBottom - bodyTop) / 160));
    const height = (bodyBottom - bodyTop) / count;
    for (let i = 0; i < count; i++)
      this.obstaclePart(`${prefix}-middle`, x - width / 2, bodyTop + i * height, width, height);
    this.obstaclePart(`${prefix}-bottom`, x - width / 2, bodyBottom, width, 48);
  }
  private drawFallbackBackdrop(g: Phaser.GameObjects.Graphics, floor: number, progress: number) {
    g.fillStyle(0xeff6e9).fillRect(0, -240, 1120, 1100);
    g.fillStyle(0xffe4ad).fillCircle(913, 127, 49); g.fillStyle(0xffffff, .4).fillCircle(913, 127, 65);
    for (let i = -1; i < 6; i++) { const hx = i * 310 - progress * .14 % 310; g.fillStyle(0xd7e7c4).fillEllipse(hx + 140, 406, 440, 260); }
    for (let i = -1; i < 11; i++) {
      const tx = i * 145 - progress * .38 % 145;
      g.fillStyle(0xc5cfab, .7).fillRoundedRect(tx + 17, 333, 16, 130, 8);
      g.fillStyle(0xc0d9b1, .85).fillCircle(tx + 25, 322, 38);
    }
  }
  private drawGround(g: Phaser.GameObjects.Graphics, floor: number, progress: number) {
    g.fillStyle(0xa9c78c).fillRect(0, floor, 1120, 9); g.fillStyle(0x8caa76).fillRect(0, floor + 9, 1120, 39); g.fillStyle(0x68876a).fillRect(0, floor + 48, 1120, 400);
    for (let i = -1; i < 25; i++) g.fillStyle(0xb0c597).fillRoundedRect(i * 53 - progress % 53, floor + 25, 20, 3, 2);
  }
  private draw() {
    const g = this.g, floor = RULES.floor, center = 560, progress = model.distance * RULES.scale;
    this.cursor = 0; for (const s of this.pool) s.setVisible(false);
    g.clear(); this.bg.update(progress);
    if (!this.bg.ready) this.drawFallbackBackdrop(g, floor, progress);
    if (!this.bg.ready) this.drawGround(g, floor, progress);
    // A single repeating moss-covered branch, painted at world coordinates.
    // Its shape and grain never depend on the slot currently occupying the screen.
    for (const p of model.platforms) {
      const left = center + (p.start - model.distance) * RULES.scale, width = (p.end - p.start) * RULES.scale;
      if (left > 1140 || left + width < -20) continue;
      if (p.required) {
        for (let y = p.y + 24; y < floor; y += 46)
          this.obstaclePart('platform-support', left - 10, y, 46, 46, 46, Math.min(46, floor - y));
      }
      const middleWidth = width - 128, count = Math.max(1, Math.ceil(middleWidth / 128)), tileWidth = middleWidth / count;
      for (let i = 0; i < count; i++) {
        const x = left + 64 + i * tileWidth;
        if (x > -128 && x < 1140) this.obstaclePart('platform-middle', x, p.y - 3, tileWidth, 32);
      }
      this.obstaclePart('platform-left', left, p.y - 3, 64, 32);
      this.obstaclePart('platform-right', left + width - 64, p.y - 3, 64, 32);
    }
    // Vine gate (platform.gateX, set by the model): a solid hanging curtain from above the view down to the branch.
    for (const p of model.platforms) {
      const gx = (p as { gateX?: number }).gateX; if (gx === undefined) continue;
      const gxs = center + (gx - model.distance) * RULES.scale; if (gxs < -80 || gxs > 1200) continue;
      this.curtain(gxs, -300, p.y + 10, RULES.gateWidth, true);
    }
    for (const item of model.items) {
      if (item.used && item.kind !== 'pit') continue;
      const ix = center + (item.x - model.distance) * RULES.scale;
      if (ix + item.w / 2 < -20 || ix - item.w / 2 > 1140) continue;
      if (item.kind === 'coin') {
        const frame = Math.floor(model.elapsed * 10) % 12;
        this.sprite(frame, ix, item.y + item.h / 2, 38, 38, item.coinValue === 3 ? 'coin-gold-spin' : 'coin-spin');
      } else if (item.kind === 'food' || item.kind === 'gold') {
        const iy = item.y + item.h / 2, golden = item.kind === 'gold';
        const key = FOOD[item.variant ?? item.id % FOOD.length], frame = this.textures.get(ATLAS).get(key), fit = 54 / Math.max(frame.width, frame.height);
        const s = this.sprite(key, ix, iy, frame.width * fit, frame.height * fit);
        if (golden) {
          s.setTint(0xffd252); g.fillStyle(0xffd468, .24).fillCircle(ix, iy, 29 + Math.sin(model.elapsed * 6) * 3);
          g.lineStyle(2, 0xfff3b8, .9);
          for (let k = 0; k < 4; k++) {
            const a = model.elapsed * 1.4 + k * Math.PI / 2, sx = ix + Math.cos(a) * 29, sy = iy + Math.sin(a) * 26, r = 3 + Math.sin(model.elapsed * 8 + k) * 1.5;
            g.lineBetween(sx - r, sy, sx + r, sy).lineBetween(sx, sy - r, sx, sy + r);
          }
        }
      } else if (item.kind === 'pit') {
        // The original painted banks, cliff walls and textured depth are one
        // fixed-size object. Its 160px opening matches the actual fall zone.
        this.obstaclePart('pit', ix - 108, floor - 8, 216, 200);
      } else {
        const overhead = item.kind === 'beam' || item.kind === 'crawl';
        const obstacleFloor = item.y + item.h + (overhead ? 44 : 0);
        g.fillStyle(0x294b31, .1).fillEllipse(ix, obstacleFloor + 3, item.w + 15, 10);
        if (item.kind === 'beam') this.curtain(ix, -300, item.y + item.h, item.w);
        else if (item.kind === 'crawl') this.obstaclePart('crawl', ix - item.w / 2, item.y, item.w, item.h);
        else if (item.kind === 'block' && item.variant === 1) {
          // Rock variant: same hitbox as the stump, drawn at its own aspect (160x91) and sitting on the ground.
          const rw = 100, rh = rw * 91 / 160;
          this.sprite('obstacle-rock', ix, item.y + item.h - rh / 2, rw, rh, ATLAS);
        } else this.sprite(item.kind === 'block' ? 'block' : item.kind === 'tower' ? 'tower' : 'obstacle-log',
          ix, item.y + item.h / 2, item.w, item.h, item.kind === 'long' ? ATLAS : OBSTACLE_ATLAS);
      }
    }
    for (const npc of model.encounters) {
      if (npc.used) continue;
      const x = center + (npc.x - model.distance) * RULES.scale;
      if (x < -80 || x > 1200) continue;
      g.fillStyle(0x355340, .15).fillEllipse(x, npc.y + 6, 62, 10);
      this.sprite('mob', x, npc.y - 51.5, 88, 103, EVENT_ATLAS);
      g.fillStyle(0xfff5cb).fillCircle(x + 28, npc.y - 110, 13);
      g.lineStyle(2, 0x94745c).strokeCircle(x + 28, npc.y - 110, 13);
      g.lineStyle(3, 0x94745c).lineBetween(x + 28, npc.y - 118, x + 28, npc.y - 109);
      g.fillStyle(0x94745c).fillCircle(x + 28, npc.y - 103, 1.8);
    }
    const cx = monsterX(displayGap), moving = model.phase === 'running';
    const runFrame = Math.floor(model.elapsed * 12) % 4;
    const monsterFrame = `dekatsuyo-run-${Math.floor(model.elapsed * 14) % 4}`;
    this.chaser.setTexture(ATLAS, monsterFrame).setVisible(cx + MONSTER_WIDTH/2 > 0).setPosition(cx, floor + (moving ? Math.sin(model.elapsed * 14) * 3 : 0)).setDisplaySize(MONSTER_WIDTH, MONSTER_HEIGHT).setRotation(moving ? Math.sin(model.elapsed * 7) * .012 : 0);
    const hx = center - 34 * Math.sin(Math.PI * Math.min(1, model.hitFlash / RULES.hitInvulnerability));
    const gliding = (model as { gliding?: boolean }).gliding === true;
    const duck = model.crouch && model.grounded, bob = gliding ? Math.sin(model.elapsed * 7) * 1.5
      : moving && model.grounded && !duck ? Math.abs(Math.sin(model.elapsed * 13)) * 3 : 0;
    const shadowFloor = model.platforms.find(p => model.distance >= p.start && model.distance <= p.end && model.y <= p.y + .1)?.y ?? floor;
    const height = Math.max(0, shadowFloor-model.y);
    g.fillStyle(0x355340, .16/(1+height/200)).fillEllipse(hx, shadowFloor + 7, Math.max(42, 88-height*.12), 12);
    g.fillStyle(0x355340, .18).fillEllipse(cx, floor+7, MONSTER_WIDTH*.55, 14);
    const crawlFrame = Math.floor(model.elapsed * 10) % 4;
    const heroFrame = gliding ? 'momonga-glide' : duck ? moving ? `momonga-crouch-${crawlFrame}` : 'momonga-crouch'
      : moving && model.grounded ? `momonga-run-${runFrame}` : 'momonga';
    // Preserve the glide artwork's aspect ratio while matching the running head/body scale.
    this.hero.setTexture(ATLAS, heroFrame).setPosition(hx, model.y + 4 - bob).setDisplaySize(duck ? 120 : 110, gliding ? 81 : duck ? 43 : 98).setRotation(gliding ? -.04 + Math.sin(model.elapsed * 5) * .025 : duck ? 0 : !model.grounded ? -.08 : moving ? Math.sin(model.elapsed * 13) * .025 : 0).setVisible(!(model.hitFlash > 0 && Math.floor(model.hitFlash * 18) % 2)).clearTint();
    if (gliding) {
      for (let j = 0; j < 3; j++) {
        const y = model.y - 56 + j * 18 - bob;
        g.lineStyle(2, 0xa8cbdc, .55).lineBetween(hx - 82 - j * 6, y, hx - 62 - j * 3, y);
      }
    }
    if (model.eventBoost > 0 && model.boost === 0) {
      for (let j = 1; j < 4; j++) g.lineStyle(3, 0x98bf90, .5 / j).lineBetween(hx - 60 - j * 18, model.y - j * 19, hx - 30 - j * 18, model.y - j * 19);
    }
    if (model.boost > 0) {
      this.hero.setTint(0xffeec1); g.lineStyle(3, 0xffe393).strokeEllipse(hx, model.y - model.height / 2, 132, model.height + 30);
      for (let j = 1; j < 4; j++) g.lineStyle(3, 0xffd979, .5 / j).lineBetween(hx - 60 - j * 18, model.y - j * 19, hx - 30 - j * 18, model.y - j * 19);
    }
  }
}
start.addEventListener('click', () => { if (model.phase === 'paused') { model.start(); accumulator = 0; updateHud(); } else begin(); });
$('home-play').addEventListener('click', begin); $('restart').addEventListener('click', begin); pause.addEventListener('click', togglePause);
const jumpButton = $('jump'), crouchButton = $('crouch');
jumpButton.addEventListener('pointerdown', e => { e.preventDefault(); jumpButton.classList.add('held'); jumpButton.setPointerCapture(e.pointerId); model.crouch = crouchHeld; model.jump(); });
function releaseJump() { jumpButton.classList.remove('held'); model.releaseJump(); }
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) jumpButton.addEventListener(event, releaseJump);
crouchButton.addEventListener('pointerdown', e => { e.preventDefault(); crouchHeld = true; model.crouch = true; crouchButton.classList.add('held'); crouchButton.setPointerCapture(e.pointerId); });
function release() { crouchHeld = false; model.crouch = false; crouchButton.classList.remove('held'); }
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) crouchButton.addEventListener(event, release);
function returnHome() {
  preparing = false; ready.cancel();
  release(); releaseJump(); model.pause(); mini = null; encounterId = null; updateMini(); updateHud();
  play.hidden = true; home.hidden = false; game?.loop.sleep(); dropFocus(); window.scrollTo({ top: 0 });
}
$('home-return').addEventListener('click', returnHome);
$('pause-home').addEventListener('click', returnHome);
$('countdown-home').addEventListener('click', returnHome);
window.addEventListener('keydown', e => {
  // Horizontal navigation is suppressed while playing; Tab is handled globally.
  const live = intro.active || ready.active || preparing
    || !play.hidden && model.phase === 'running' && !mini
    || !!mini && !mini.paused && mini.inPlay;
  if (live && !e.ctrlKey && !e.metaKey && !e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault(); return;
  }
  if (home.hidden === false && e.target instanceof HTMLInputElement) return;
  if (e.target instanceof HTMLElement && e.target.closest('[role="switch"]') && ['Space', 'Enter'].includes(e.code)) return;
  if (e.target instanceof HTMLButtonElement && e.target.classList.contains('stop-running') && ['Space', 'Enter'].includes(e.code)) return;
  if (intro.active) {
    if (e.code === 'Escape') { e.preventDefault(); intro.skip(); }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && e.target instanceof HTMLVideoElement) e.preventDefault();
    return;
  }
  if (ready.active || preparing) {
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); ready.pause(); }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    return;
  }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); if (e.repeat) return;
  if (mini) { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); miniAction(); } if (e.code === 'KeyP' || e.code === 'Escape') togglePause(); return; }
  if (e.code === 'Space' || e.code === 'ArrowUp') { jumpButton.classList.add('held'); if (home.hidden === false || model.phase === 'ready' || model.phase === 'over') begin(); else if (model.phase === 'paused') togglePause(); else { model.crouch = crouchHeld; model.jump(); } }
  if (e.code === 'ArrowDown' && !play.hidden) { crouchHeld = true; model.crouch = true; crouchButton.classList.add('held'); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', e => { if (mini && (e.code === 'Space' || e.code === 'Enter')) { mini.release(); updateMini(); } if (e.code === 'ArrowDown') release(); if (e.code === 'Space' || e.code === 'ArrowUp') releaseJump(); });
function backgroundPause() { ready.pause(); release(); releaseJump(); model.pause(); mini?.release(); mini?.pause(); updateMini(); if (!play.hidden) updateHud(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundPause(); });
window.addEventListener('blur', backgroundPause); window.addEventListener('orientationchange', backgroundPause);
document.querySelectorAll<HTMLElement>('.control small,.modal-help').forEach(el => { el.hidden = true; });
$('status').hidden = true;

const miniScreen = $('mini-screen'), miniActionButton = $<HTMLButtonElement>('mini-action');
const characterNames: Record<Character, string> = { chiikawa: '치이카와', hachiware: '하치와레', usagi: '우사기' };
const eventKeys = [...CHARACTERS, 'mob', 'lemon'];
function portrait(el: HTMLElement, key: string, width: number) {
  const scale = width / 192, x = eventKeys.indexOf(key) * 196 + 2;
  Object.assign(el.style, { width: `${width}px`, height: `${224 * scale}px`, backgroundSize: `${1024 * scale}px ${256 * scale}px`, backgroundPosition: `${-x * scale}px ${-2 * scale}px` });
}
// The reel repeats the roster; it lands on cell REEL_BASE + winner, so enough cells follow the base.
const REEL_BASE = ROSTER.length * Math.ceil(12 / ROSTER.length);
function portraitEntry(el: HTMLElement, entry: RosterEntry, width: number) {
  if ('atlas' in entry.portrait) { el.style.backgroundImage = ''; portrait(el, entry.portrait.atlas, width); return; }
  const h = width * 224 / 192;
  Object.assign(el.style, { width: `${width}px`, height: `${h}px`, backgroundImage: `url('${entry.portrait.url}')`, backgroundSize: `${width}px ${h}px`, backgroundPosition: '0 0' });
}
for (let i = 0; i < REEL_BASE + ROSTER.length; i++) {
  const cell = document.createElement('div'), image = document.createElement('span');
  cell.className = 'slot-cell'; image.className = 'event-sprite'; portraitEntry(image, ROSTER[i % ROSTER.length], 104);
  cell.append(image); $('slot-reel').append(cell);
}
const lemons = Array.from({ length: 5 }, (_, n) => {
  const cell = document.createElement('div'), image = document.createElement('span'), mark = document.createElement('span');
  cell.className = 'lemon-cell'; image.className = 'event-sprite'; portrait(image, 'lemon', 88);
  mark.className = 'lemon-mark'; mark.hidden = true; cell.setAttribute('aria-label', `레몬 ${n + 1}`); cell.append(image, mark); $('lemon-tray').append(cell);
  return { cell, image, mark };
});
function layoutMiniArt() {
  const compact = window.innerHeight <= 520 && window.innerWidth > window.innerHeight;
  const inside = Math.min(740, window.innerWidth - 24) - (window.innerWidth <= 500 ? 30 : 58);
  const small = Math.min(compact ? 30 : 40, (inside - 32) / 5);
  for (const {image} of lemons) portrait(image, 'lemon', Math.max(24, small));
  // The centre lemon is exactly the success band: its width is the band's share of the stage.
  const stage = $('stage-lemon'), box = $('stage-lemon').parentElement as HTMLElement, w = box.clientWidth || Math.min(480, inside);
  const lw = w * (MINI_RULES.targetMax - MINI_RULES.targetMin); portrait(stage, 'lemon', lw);
  // The full lemon (including its leaf) fits in atlas rows84..223; trim only empty space.
  stage.style.height = `${140 * lw / 192}px`; stage.style.backgroundPositionY = `${-84 * lw / 192}px`;
}
layoutMiniArt(); window.addEventListener('resize', layoutMiniArt);
function miniAction() {
  if (!mini) return;
  if (mini.paused) mini.resume();
  else if (mini.phase === 'intro') mini.start();
  else if (mini.phase === 'result') { release(); releaseJump(); mini.continue(); }
  else mini.press();
  updateMini();
}
// Hold games need the pointer's down and up. In an interactive phase the button acts on pointerdown and
// releases on pointerup/cancel/capture loss; the click that follows is ignored. Every other phase keeps click.
let pointerPressed = false, swallowClick = false, swallowTimer = 0;
miniActionButton.addEventListener('pointerdown', e => {
  swallowClick = false;
  if (!mini || mini.paused || !mini.interactive || e.button > 0) return;
  e.preventDefault(); miniActionButton.setPointerCapture(e.pointerId);
  pointerPressed = true; swallowClick = true; mini.press(); updateMini();
});
const pointerRelease = () => {
  if (!pointerPressed) return;
  pointerPressed = false; mini?.release(); updateMini();
  clearTimeout(swallowTimer); swallowTimer = window.setTimeout(() => { swallowClick = false; }, 400); // the click of this press, if any, arrives first
};
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) miniActionButton.addEventListener(type, pointerRelease);
miniActionButton.addEventListener('click', () => { if (swallowClick) { swallowClick = false; return; } miniAction(); });
$('countdown-resume').addEventListener('click', togglePause);
// The kurimanju portrait is the separate image /assets/event-kurimanju.webp (192x224), shown next to the glass.
const KURI_ART = true, kuriState = { key: '' };
function updateMini() {
  // Called by begin/background handlers only after the module's DOM setup has finished.
  if (!mini) {
    $('mini-screen').hidden = true; $('mini-countdown').hidden = true; document.querySelector<HTMLElement>('.hud-buttons')!.hidden = false;
    play.inert = false; document.body.style.overflow = '';
    $<HTMLButtonElement>('jump').disabled = false; $<HTMLButtonElement>('crouch').disabled = false; return;
  }
  const g = mini, countdown = g.phase === 'countdown';
  $('countdown-home').hidden = !g.paused;
  document.querySelector<HTMLElement>('.hud-buttons')!.hidden = true;
  miniScreen.hidden = countdown; $('mini-countdown').hidden = !countdown;
  play.inert = !countdown; document.body.style.overflow = countdown ? '' : 'hidden';
  $<HTMLButtonElement>('jump').disabled = true; $<HTMLButtonElement>('crouch').disabled = true;
  if (countdown) {
    $('countdown-number').textContent = g.paused ? 'Ⅱ' : String(Math.max(1, Math.ceil(g.countdownRemaining)));
    $('countdown-resume').hidden = !g.paused; return;
  }
  if (g.phase === 'selecting') {
    // Slot reel: only the roster's characters spin by, and it lands on the winner.
    const t = Math.min(1, g.elapsed / MINI_RULES.selectionSeconds), steps = REEL_BASE + g.index;
    $('slot-reel').style.transform = `translateY(${-132 * steps * (1 - (1 - t) ** 3)}px)`;
    if (miniViewKey !== 'selecting') {
      miniViewKey = 'selecting'; layoutMiniArt();
      $('slot-panel').hidden = false; $('kuri-panel').hidden = true;
      for (const id of ['lemon-tray', 'sticker-timing', 'mini-portrait']) $(id).hidden = true;
      $('mini-character').textContent = ''; $('mini-title').textContent = '오늘의 일손을 찾는 중…'; $('mini-copy').textContent = '이번에는 누구와 일하게 될까요?'; $('mini-reward').textContent = '';
    }
    $('mini-paused').hidden = !g.paused;
    miniActionButton.hidden = !g.paused; miniActionButton.disabled = false; miniActionButton.textContent = '계속하기';
    return;
  }
  const inner = g.inner;
  $('slot-panel').hidden = true;
  $('kuri-panel').hidden = !(inner instanceof KurimanjuGame);
  if (inner instanceof KurimanjuGame) {
    for (const id of ['lemon-tray', 'sticker-timing', 'mini-portrait']) $(id).hidden = true;
    $('mini-character').textContent = ''; $('kuri-portrait').hidden = !KURI_ART;
    const view = renderKurimanju(inner, kuriState);
    miniActionButton.hidden = false; miniActionButton.disabled = view.buttonDisabled; miniActionButton.textContent = view.buttonText;
    if (['intro', 'result'].includes(inner.phase)) dropFocus();
    miniViewKey = ''; return;
  }
  if (!(inner instanceof StickerGame)) return;
  const sg = inner;
  if (sg.phase === 'selecting') {
    const t = Math.min(1, sg.elapsed / MINI_RULES.selectionSeconds), steps = 12 + CHARACTERS.indexOf(sg.selected);
    $('slot-reel').style.transform = `translateY(${-132 * steps * (1 - (1 - t) ** 3)}px)`;
  }
  $('sticker-cursor').style.left = `${sg.cursor * 100}%`;
  $('mini-time-fill').style.width = `${sg.phase === 'playing' ? Math.max(0, 1 - sg.elapsed / MINI_RULES.roundSeconds) * 100 : 100}%`;
  const key = `${encounterId}:${sg.phase}:${sg.round}:${sg.results.join()}:${sg.paused}`;
  if (key === miniViewKey) return;
  miniViewKey = key; layoutMiniArt();
  $('slot-panel').hidden = sg.phase !== 'selecting';
  $('mini-portrait').hidden = sg.phase === 'selecting'; portrait($('mini-portrait'), sg.selected, 65);
  $('mini-character').textContent = sg.phase === 'selecting' ? '' : `${characterNames[sg.selected]}와 함께`;
  $('mini-paused').hidden = !sg.paused;
  $('lemon-tray').hidden = sg.phase === 'selecting';
  $('sticker-timing').hidden = !['playing', 'feedback'].includes(sg.phase);
  $('mini-reward').textContent = '';
  const titles = { selecting: '오늘의 일손을 찾는 중…', intro: '레몬에 스티커 붙이기', playing: '스티커가 레몬에 겹칠 때!', feedback: sg.lastHit ? '착! 잘 붙었어요' : '앗, 다음 레몬에 도전해요', result: `${sg.successes}개 성공!`, countdown: '', done: '' };
  $('mini-title').textContent = titles[sg.phase];
  $('mini-copy').textContent = sg.phase === 'intro' ? '스티커가 레몬 위에 겹칠 때 버튼이나 Space를 한 번 눌러요. 레몬은 모두 5개!'
    : sg.phase === 'result' ? '작은 일을 마쳤어요. 달리기 화면으로 돌아가 준비한 뒤 출발해요.'
    : sg.phase === 'selecting' ? '이번에는 누구와 일하게 될까요?' : '레몬마다 한 번씩, 타이밍에 맞춰 붙여주세요.';
  $('sticker-round').textContent = `레몬 ${sg.round + 1} / 5`;
  for (let n = 0; n < lemons.length; n++) {
    const {cell, mark} = lemons[n], result = sg.results[n];
    cell.className = `lemon-cell${n === sg.round && sg.phase === 'playing' ? ' current' : ''}${result !== undefined ? ' done' : ''}${result === false ? ' missed' : ''}`;
    mark.hidden = result === undefined; mark.textContent = result ? '✓' : '×';
    cell.setAttribute('aria-label', `레몬 ${n + 1}${result === undefined ? '' : result ? ' 성공' : ' 실패'}`);
  }
  miniActionButton.hidden = sg.phase === 'selecting' && !sg.paused;
  miniActionButton.disabled = sg.phase === 'feedback' && !sg.paused;
  miniActionButton.textContent = sg.paused ? '계속하기' : sg.phase === 'intro' ? '준비됐어요! 시작' : sg.phase === 'result' ? '달리기로 돌아가기' : '스티커 붙이기';
  if (sg.phase === 'result' && sg.reward) $('mini-reward').textContent = `동전 +${sg.coinReward} · 체력 +${sg.reward.stamina} · ${sg.reward.speedMultiplier}배 속도 ${sg.reward.seconds}초`;
  if (['intro','result'].includes(sg.phase)) dropFocus();
}
