import { authService, AuthUser } from './auth';

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  icon: string; // url or asset frame
  preview: string;
  idleImg: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'momonga-hula',
    name: '하와이안 훌라 스킨',
    desc: '보라색 꽃 화관과 시원한 풀치마를 두른 모몽가 스킨 세트 (달리기/점프/기어가기/활공)',
    price: 50,
    icon: '/assets/momonga-hula-idle.webp',
    preview: '/assets/momonga-hula-run.webp',
    idleImg: '/assets/momonga-hula-idle.webp'
  },
  {
    id: 'momonga-kigurumi-usagi',
    name: '우사기 인형옷 스킨',
    desc: '귀여운 우사기 후드 바디슈트를 뒤집어쓴 특별 모몽가 코스튬 (달리기/점프/기어가기/활공)',
    price: 150,
    icon: '/assets/momonga-usagi-idle.webp',
    preview: '/assets/momonga-usagi-kigurumi-run.webp',
    idleImg: '/assets/momonga-usagi-idle.webp'
  },
  {
    id: 'momonga-kigurumi-dekatsuyo',
    name: '데카츠요 인형옷 스킨',
    desc: '노란 털옷과 뿔 달린 데카츠요 가면을 쓴 모몽가 코스튬 (달리기/점프/기어가기/활공)',
    price: 200,
    icon: '/assets/momonga-dekatsuyo-idle.webp',
    preview: '/assets/momonga-dekatsuyo-run.webp',
    idleImg: '/assets/momonga-dekatsuyo-idle.webp'
  },
  {
    id: 'momonga-kigurumi-anoko',
    name: '아노코 인형옷 스킨',
    desc: '이마의 외뿔, 풍성한 가슴털과 줄무늬 꼬리가 달린 아노코 코스튬 (달리기/점프/기어가기/활공)',
    price: 250,
    icon: '/assets/momonga-anoko-idle.webp',
    preview: '/assets/momonga-anoko-run.webp',
    idleImg: '/assets/momonga-anoko-idle.webp'
  }
];

export class ShopManager {
  public static getItems(): ShopItem[] {
    return SHOP_ITEMS;
  }

  public static buyItem(itemId: string): { ok: boolean; message: string } {
    const user = authService.getUser();
    if (!user) {
      return { ok: false, message: '상점을 이용하려면 먼저 로그인해 주세요.' };
    }

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
      return { ok: false, message: '존재하지 않는 상품입니다.' };
    }

    if (user.ownedSkins.includes(itemId)) {
      return { ok: false, message: '이미 보유 중인 상품입니다.' };
    }

    if (user.coins < item.price) {
      return { ok: false, message: `동전이 부족합니다! (필요: ${item.price}개 / 보유: ${user.coins}개)` };
    }

    if (authService.spendCoins(item.price)) {
      authService.unlockSkin(item.id);
      authService.equipSkin(item.id);
      return { ok: true, message: `"${item.name}"을(를) 구매하고 장착했습니다!` };
    }

    return { ok: false, message: '구매 처리에 실패했습니다.' };
  }

  public static toggleEquip(skinId: string): { ok: boolean; message: string; equipped: boolean } {
    const user = authService.getUser();
    if (!user) {
      return { ok: false, message: '로그인이 필요합니다.', equipped: false };
    }

    if (!user.ownedSkins.includes(skinId)) {
      return { ok: false, message: '보유하지 않은 스킨입니다.', equipped: false };
    }

    const item = SHOP_ITEMS.find(i => i.id === skinId);
    const itemName = item ? item.name : skinId;

    // 이미 장착 중인 경우 -> 해제하고 기본 스킨으로 복귀
    if (user.equippedSkin === skinId) {
      authService.unequipSkin();
      return { ok: true, message: `"${itemName}" 장착을 해제하고 기본 스킨으로 변경했습니다.`, equipped: false };
    }

    // 다른 스킨이 장착되어 있거나 기본 스킨인 경우 -> 해당 스킨으로 단일 교체 장착
    authService.equipSkin(skinId);
    return { ok: true, message: `"${itemName}"을(를) 장착했습니다!`, equipped: true };
  }

  public static equip(skinId: string): { ok: boolean; message: string } {
    const res = this.toggleEquip(skinId);
    return { ok: res.ok, message: res.message };
  }
}
