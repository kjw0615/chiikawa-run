# 이미지 제작과 참고 자료

이번 버전의 PNG 9개는 내장 `image_gen`으로 새로 생성한 투명 배경의 팬메이드 에셋이다. 공식 배포 에셋이나 공식 상품 이미지를 그대로 게임에 넣은 것이 아니다. 캐릭터와 세계관의 권리는 원작자에게 있으며, 공개 이용 허가 여부를 확인한 자료는 아니다.

| 파일 (`public/assets/`) | 용도 |
|---|---|
| momonga.png | 모몽가, 홈과 게임 주인공 |
| momonga-crouch.png | 얼굴을 찌그러뜨리지 않고 낮게 엎드린 별도 자세 |
| dekatsuyo.png | 데카츠요, 홈과 추격자 |
| food-pudding.png | 푸딩 |
| food-pancake.png | 핫케이크 |
| food-cream-puff.png | 요구르트 슈크림 |
| obstacle-rock.png | 바위와 높은 바위 |
| obstacle-log.png | 낮고 긴 쓰러진 나무 |
| obstacle-vines.png | 앉아서 통과하는 덩굴 |

황금 음식은 위의 음식 PNG를 그대로 사용하고 Phaser의 금색 tint와 반짝임을 더한다. 음식의 체력 회복과 황금 효과는 게임의 창작 규칙이다. 바위·쓰러진 나무·덩굴은 치이카와의 숲 분위기를 참고한 배경 장애물이며 원작의 특정 고유 장애물을 재현했다고 주장하지 않는다.

생성 원본 PNG의 알파를 보존했다. 사용자 요청에 따라 게임용 크기로 여백 제거·비율 유지 축소·패킹한 `game-atlas.webp`와 `game-atlas.json`을 제공한다. 9개 프레임이 1024×1024 텍스처 한 장에 들어가며 파일은 약 297KB다. 음식은 최대 96px, 캐릭터는 256~320px, 장애물은 쓰임에 따라 최대 416px로 준비한다. 홈 화면용 5개 WebP는 합계 약 336KB다. 원본 PNG를 게임에서 직접 내려받지 않는다.

`frames.json`은 원본의 투명 여백 좌표 기록이고 런타임에서는 아틀라스 JSON을 사용한다. `python scripts/build-assets.py`로 재생성할 수 있다(Python과 Pillow 필요). 생성 PNG 자체는 가공하지 않으며, 배포용 축소본을 무손실 WebP로 인코딩한다. 달리는 포즈와 엎드린 포즈 두 장에 상하 움직임·기울임을 적용하며 다중 프레임 원작 애니메이션이 아니다. 높은 바위는 한 장을 길게 늘이지 않고 여러 개를 쌓아 표현한다.

데카츠요는 초기 회색 두 발 그림을 사용하지 않는다. 사용자가 지정한 문서와 영상의 모습을 확인한 뒤 노란 둥근 몸·흰 얼굴·검은 여러 다리·분홍 혀로 새로 생성했다. 영상은 참고로만 검토했으며 원본 영상과 캡처 프레임을 배포 파일이나 저장소에 포함하지 않는다.

## 공식 참고 자료

- [치이카와 공식 캐릭터 소개 — 모몽가](https://www.chiikawaofficial.com/characters/)
- [치이카와 마켓 — 데카츠요](https://chiikawamarket.jp/collections/dekatsuyo)
- [데카츠요 공식 분류 아이콘 — 이미지 생성의 외형 참고](https://chiikawamarket.jp/cdn/shop/collections/10dekatsuyo.png?v=1766471286)
- [사용자 지정 데카츠요 문서 3.2절](https://namu.wiki/w/몬스터(먼작귀)#s-3.2): 원문 접속 제한으로 동일 문서의 공개 미러와 원작 그림을 함께 확인했다.
- [사용자 지정 영상 — AniBox 27화, 35초부터](https://www.youtube.com/watch?v=YiXvoKtKn2Q&t=35s): 노란 몸·검은 다리의 추격 장면을 확인했다. 다양한 카메라 컷을 게임의 고정 카메라 규칙으로 오인하지 않는다.
- [후지야 공식 발표 — 작중 푸딩과 핫케이크 모티브](https://www.fujiya-peko.co.jp/assets/pdf/press20260325_1.pdf)
- [몽테르 공식 발표 — 작중 요구르트 슈크림](https://www.monteur.co.jp/storage/news/250619_chiikawa.pdf)
- [메인 화면 분위기 참고](https://chiikawa-run.vercel.app/): 파스텔색, 큰 제목, 두꺼운 외곽선의 버튼을 참고했다. 해당 사이트의 이미지·문구·토큰·보상 기능은 복제하지 않는다.

## 사용한 생성 프롬프트

모든 작업에 `transparent_background: true`를 사용했다. 프롬프트 원문은 [asset-prompts.json](asset-prompts.json)에 기록했다. 제작 방식은 내장 도구이며 API/CLI 우회나 API 키를 사용하지 않았다.
