/**
 * Tutorial scenarios and deterministic runner model.
 *
 * Implements the 11-step interactive scenario:
 * 1. Basic Jump
 * 2. Stamina Drain & Speed Slow-down (Food recovery)
 * 3. Double Jump (High food)
 * 4. Hazard Hit & Chaser Pressure (Gap reduction)
 * 5. Low Ceiling Crawl (Crouch hold)
 * 6. Puddle Slow-down & Air Gliding (Jump hold)
 * 7. Branch Platform Traverse & Drop down (Crouch + Jump)
 * 8. Golden Food (Invulnerable Dash)
 * 9. Coin Pickups & Shop introduction
 * 10. Mini-Game Encounter (Tiers, rewards & bad penalty)
 * 11. Final Capture by Dekatsuyo (Game Over rule) -> Tutorial Finish
 */

import { RunnerModel, RULES, TERRAIN, waterWidth, OBSTACLE_WIDTHS, type Item, type Phase, type Encounter } from './model.ts';
import { FAST_PACE } from './fast-pace.ts';

export interface TutorialStep {
  id: number;
  title: string;
  triggerDistance: number;
  message: string;
  subMessage?: string;
  expectedAction?: 'jump' | 'double_jump' | 'crouch' | 'glide' | 'drop' | 'none';
  actionKey?: string;
  pauseOnTrigger?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: '1. 기본 점프',
    triggerDistance: 12,
    message: '앞에 장애물이 있어요!\n[점프] (Space 키 또는 ↑ 버튼)를 눌러 가볍게 뛰어넘어 보세요!',
    expectedAction: 'jump',
    actionKey: 'Space 또는 ↑ 버튼',
    pauseOnTrigger: true,
  },
  {
    id: 2,
    title: '2. 체력과 속도 저하',
    triggerDistance: 28,
    message: '체력이 0이 되면 탈진해 속도가 확 느려져요!\n맛있는 푸딩을 먹어 체력을 12 이상 회복하면 원래 속도로 돌아와요!',
    expectedAction: 'none',
    pauseOnTrigger: true,
  },
  {
    id: 3,
    title: '3. 2단 점프',
    triggerDistance: 44,
    message: '높은 상공에 푸딩이 있어요!\n점프한 상태에서 공중에서 [한 번 더 점프]하면 2단 점프를 해요!',
    expectedAction: 'double_jump',
    actionKey: '공중에서 한 번 더 Space',
    pauseOnTrigger: true,
  },
  {
    id: 4,
    title: '4. 장애물 피격과 데카츠요',
    triggerDistance: 62,
    message: '장애물에 부딪히면 넉백과 함께\n뒤쫓아오는 데카츠요와의 거리가 훅 좁혀져요! 조심하세요!',
    expectedAction: 'none',
    pauseOnTrigger: true,
  },
  {
    id: 5,
    title: '5. 낮은 천장과 기어가기',
    triggerDistance: 78,
    message: '머리 위에 낮은 통나무 천장이 있어요!\n[앉기] (↓ 키 또는 앉기 버튼)를 꾹 누르고 기어가세요!',
    expectedAction: 'crouch',
    actionKey: '↓ 키 또는 앉기 버튼 유지',
    pauseOnTrigger: true,
  },
  {
    id: 6,
    title: '6. 물웅덩이 감속과 활공',
    triggerDistance: 98,
    message: '바닥의 물웅덩이를 밟으면 이동 속도가 25% 느려져요!\n점프 후 [점프]를 길게 누르면 바람을 타고 활공(글라이딩)해요!',
    expectedAction: 'glide',
    actionKey: '공중에서 점프 홀드 (바람 타기)',
    pauseOnTrigger: true,
  },
  {
    id: 7,
    title: '7. 나뭇가지 발판 뛰어내리기',
    triggerDistance: 122,
    message: '발판 위로 올라왔나요?\n발판 위에서 [앉기 + 점프]를 누르면 아래로 안전하게 뛰어내려와요!',
    expectedAction: 'drop',
    actionKey: '↓ 누른 채 Space',
    pauseOnTrigger: true,
  },
  {
    id: 8,
    title: '8. 황금 음식과 무적 부스터',
    triggerDistance: 145,
    message: '반짝이는 황금 슈크림이에요!\n먹으면 체력 +30 회복과 함께 1초 동안 무적 대시를 해요!',
    expectedAction: 'none',
    pauseOnTrigger: true,
  },
  {
    id: 9,
    title: '9. 동전 획득과 상점',
    triggerDistance: 168,
    message: '동전을 모으면 메인 화면 [상점]에서 귀여운 스킨을 살 수 있어요!\n황금 동전은 더 많은 코인을 줘요!',
    expectedAction: 'none',
    pauseOnTrigger: true,
  },
  {
    id: 10,
    title: '10. 미니게임 (보너스와 패널티)',
    triggerDistance: 190,
    message: '친구들을 도와주면 등급별 보너스(치이카와:코인, 쿠리만쥬:체력, 우사기:가속)를 받아요!\n하지만 실패(나쁨) 시 감속 또는 코인 차감 패널티가 있어요!',
    expectedAction: 'none',
    pauseOnTrigger: true,
  },
  {
    id: 11,
    title: '11. 게임오버와 도주 성공',
    triggerDistance: 220,
    message: '체력이 다 떨어지거나 실수가 겹치면…\n데카츠요에게 붙잡혀 게임이 종료돼요! 끝까지 도망쳐 보세요!',
    expectedAction: 'none',
    pauseOnTrigger: true,
  },
];

export class TutorialRunnerModel extends RunnerModel {
  isTutorial = true;
  currentStepIndex = -1;
  tutorialCompleted = false;

  constructor() {
    super(42, false, { platforms: false, encounters: false, coins: false, separateSpawns: true });
    this.gap = 20;
    this.stamina = 100;
    this.setupFixedScenario();
  }

  private setupFixedScenario() {
    this.items = [];
    this.platforms = [];
    this.encounters = [];

    // Step 1: Block obstacle at x = 16m
    this.items.push({
      id: 1,
      x: 16,
      y: RULES.floor - 64,
      w: OBSTACLE_WIDTHS.block,
      h: 64,
      kind: 'block',
      used: false,
    });

    // Step 2: Food on floor at x = 34m
    this.items.push({
      id: 2,
      x: 34,
      y: RULES.floor - 36,
      w: 32,
      h: 32,
      kind: 'food',
      used: false,
    });

    // Step 3: High Food (double jump required) at x = 50m
    this.items.push({
      id: 3,
      x: 50,
      y: RULES.floor - 130,
      w: 32,
      h: 32,
      kind: 'food',
      used: false,
    });

    // Step 4: Ground obstacle at x = 68m
    this.items.push({
      id: 4,
      x: 68,
      y: RULES.floor - 64,
      w: OBSTACLE_WIDTHS.block,
      h: 64,
      kind: 'block',
      used: false,
    });

    // Step 5: Low ceiling beam at x = 84m
    this.items.push({
      id: 5,
      x: 84,
      y: 84,
      w: OBSTACLE_WIDTHS.beam,
      h: RULES.floor - 44 - 84,
      kind: 'beam',
      used: false,
    });

    // Step 6: Puddle at x = 104m, air coin line for glide
    const puddleWidth = waterWidth('puddle', 2);
    this.items.push({
      id: 6,
      x: 104,
      y: RULES.floor,
      w: puddleWidth,
      h: TERRAIN.puddle.height,
      kind: 'puddle',
      used: false,
      modules: 2,
    });
    for (let c = 0; c < 4; c++) {
      this.items.push({
        id: 100 + c,
        x: 101 + c * 2,
        y: RULES.floor - 90,
        w: 28,
        h: 28,
        kind: 'coin',
        coinValue: 1,
        used: false,
      });
    }

    // Step 7: Platform at x = 126m ~ 138m
    this.platforms.push({
      id: 700,
      start: 126,
      end: 138,
      y: RULES.floor - RULES.platformHeight,
    });

    // Step 8: Golden Food at x = 150m
    this.items.push({
      id: 8,
      x: 150,
      y: RULES.floor - 40,
      w: 32,
      h: 32,
      kind: 'gold',
      used: false,
    });

    // Step 9: Coin line at x = 172m ~ 180m
    this.items.push(
      { id: 201, x: 172, y: RULES.floor - 36, w: 28, h: 28, kind: 'coin', coinValue: 1, used: false },
      { id: 202, x: 174, y: RULES.floor - 36, w: 28, h: 28, kind: 'coin', coinValue: 1, used: false },
      { id: 203, x: 176, y: RULES.floor - 46, w: 28, h: 28, kind: 'coin', coinValue: 3, used: false },
      { id: 204, x: 178, y: RULES.floor - 36, w: 28, h: 28, kind: 'coin', coinValue: 1, used: false },
    );

    // Step 10: Fixed Chiikawa Mini-game Encounter at x = 196m
    this.encounters.push({
      id: 10,
      x: 196,
      y: RULES.floor,
      seed: 12345,
      used: false,
    });
  }

  checkStepTrigger(): TutorialStep | null {
    const nextStep = TUTORIAL_STEPS[this.currentStepIndex + 1];
    if (nextStep && this.distance >= nextStep.triggerDistance) {
      this.currentStepIndex++;
      if (nextStep.id === 2) {
        this.stamina = 0;
        this.exhausted = true;
      }
      if (nextStep.id === 4) {
        this.gap = Math.min(this.gap, 8);
      }
      if (nextStep.id === 11) {
        this.stamina = 0;
        this.exhausted = true;
      }
      return nextStep;
    }
    return null;
  }

  override step(dt: number) {
    if (this.phase !== 'running') return;

    // Step 11 final capture animation
    if (this.currentStepIndex === 10) {
      this.gap = Math.max(0, this.gap - 8 * dt);
      if (this.gap <= 0) {
        this.gap = 0;
        this.phase = 'over';
        this.tutorialCompleted = true;
        return;
      }
    }

    super.step(dt);

    // Maintain fixed items without random noise
    this.items = this.items.filter(i => i.x + i.w / RULES.scale / 2 > this.distance - 20);
    this.platforms = this.platforms.filter(p => p.end > this.distance - 20);
    this.encounters = this.encounters.filter(e => e.x > this.distance - 20);
  }
}
