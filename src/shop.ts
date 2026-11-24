import { authService, AuthUser } from './auth';

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  icon: string; // url or asset frame
  preview: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'momonga-hula',
    name: '하와이안 훌라 스킨',
    desc: '보라색 꽃 화관과 시원한 풀치마를 두른 모몽가 스킨 세트 (달리기/점프/기어가기/활공)',
    price: 50,
    icon: '/assets/momonga-hula-base.webp',
    preview: '/assets/momonga-hula-run.webp'
  },
  {
    id: 'momonga-kigurumi-usagi',
    name: '우사기 인형옷 스킨',
    desc: '귀여운 우사기 후드 바디슈트를 뒤집어쓴 특별 모몽가 코스튬 (출시 예정)',
    price: 150,
    icon: '/assets/momonga.webp',
    preview: '/assets/momonga.webp'
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

    if (item.id === 'momonga-kigurumi-usagi') {
      return { ok: false, message: '현재 제작 중인 코스튬입니다. 곧 출시됩니다!' };
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

  public static equip(skinId: string): { ok: boolean; message: string } {
    const user = authService.getUser();
    if (!user) {
      return { ok: false, message: '로그인이 필요합니다.' };
    }

    if (!user.ownedSkins.includes(skinId)) {
      return { ok: false, message: '보유하지 않은 스킨입니다.' };
    }

    authService.equipSkin(skinId);
    return { ok: true, message: '스킨을 장착했습니다.' };
  }
}
