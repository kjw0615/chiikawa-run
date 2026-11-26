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
    id: 'momonga-kigurumi-chiikawa',
    name: '치이카와 인형옷 스킨',
    desc: '하얗고 둥근 곰 귀 후드와 치이카와 얼굴 자수가 새겨진 귀여운 모몽가 코스튬',
    price: 100,
    icon: '/assets/momonga-chiikawa-idle.webp',
    preview: '/assets/momonga-chiikawa-run.webp',
    idleImg: '/assets/momonga-chiikawa-idle.webp'
  },
  {
    id: 'momonga-kigurumi-hachiware',
    name: '하치와레 인형옷 스킨',
    desc: '푸른 귀와 시그니처 가르마 패턴 후드를 입은 밝고 활기찬 모몽가 코스튬',
    price: 100,
    icon: '/assets/momonga-hachiware-idle.webp',
    preview: '/assets/momonga-hachiware-run.webp',
    idleImg: '/assets/momonga-hachiware-idle.webp'
  },
  {
    id: 'momonga-kigurumi-usagi',
    name: '우사기 인형옷 스킨',
    desc: '귀여운 우사기 후드 바디슈트를 뒤집어쓴 특별 모몽가 코스튬',
    price: 100,
    icon: '/assets/momonga-usagi-idle.webp',
    preview: '/assets/momonga-usagi-kigurumi-run.webp',
    idleImg: '/assets/momonga-usagi-idle.webp'
  },
  {
    id: 'momonga-hula',
    name: '인어섬의 비밀 스킨',
    desc: '극장판 인어섬의 비밀 속 보라색 꽃 화관과 시원한 풀치마를 두른 모몽가 코스튬',
    price: 150,
    icon: '/assets/momonga-hula-idle.webp',
    preview: '/assets/momonga-hula-run.webp',
    idleImg: '/assets/momonga-hula-idle.webp'
  },
  {
    id: 'momonga-kigurumi-anoko',
    name: '아노코 인형옷 스킨',
    desc: '이마의 외뿔, 풍성한 가슴털과 줄무늬 꼬리가 달린 아노코 코스튬',
    price: 200,
    icon: '/assets/momonga-anoko-idle.webp',
    preview: '/assets/momonga-anoko-run.webp',
    idleImg: '/assets/momonga-anoko-idle.webp'
  },
  {
    id: 'momonga-kigurumi-dekatsuyo',
    name: '데카츠요 인형옷 스킨',
    desc: '노란 털옷과 뿔 달린 데카츠요 가면을 쓴 모몽가 코스튬',
    price: 200,
    icon: '/assets/momonga-dekatsuyo-idle.webp',
    preview: '/assets/momonga-dekatsuyo-run.webp',
    idleImg: '/assets/momonga-dekatsuyo-idle.webp'
  },
  {
    id: 'momonga-magical',
    name: '매지컬 차지 스킨',
    desc: '보라색 리본과 뒤집힌 분홍 하트, 온화한 미소의 노란 별과 프릴 드레스를 입은 매지컬 모몽가 코스튬',
    price: 300,
    icon: '/assets/momonga-magical-idle.webp',
    preview: '/assets/momonga-magical-run.webp',
    idleImg: '/assets/momonga-magical-idle.webp'
  },
  {
    id: 'momonga-magical-dark',
    name: '매지컬 차지 다크모드 스킨',
    desc: '분노의 이 악문 표정과 검정 리본, 찡그린 회색 별과 다크 프릴 드레스를 입은 다크모드 매지컬 코스튬',
    price: 300,
    icon: '/assets/momonga-magical-dark-idle.webp',
    preview: '/assets/momonga-magical-dark-run.webp',
    idleImg: '/assets/momonga-magical-dark-idle.webp'
  },
  {
    id: 'momonga-super-magical',
    name: '초매지컬 파워업 스킨',
    desc: '작은 악마 뿔과 박쥐 날개 망토, 앙증맞은 메롱 표정과 글썽이는 눈망울의 초매지컬 모몽가 코스튬',
    price: 400,
    icon: '/assets/momonga-super-magical-idle.webp',
    preview: '/assets/momonga-super-magical-run.webp',
    idleImg: '/assets/momonga-super-magical-idle.webp'
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
