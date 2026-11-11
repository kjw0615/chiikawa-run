# 이미지 제작과 참고 자료

이번 버전의 PNG 8개는 내장 `image_gen`으로 새로 생성한 투명 배경의 팬메이드 에셋이다. 공식 배포 에셋이나 공식 상품 이미지를 그대로 게임에 넣은 것이 아니다. 캐릭터와 세계관의 권리는 원작자에게 있으며, 공개 이용 허가 여부를 확인한 자료는 아니다.

| 파일 (`public/assets/`) | 용도 |
|---|---|
| momonga.png | 모몽가, 홈과 게임 주인공 |
| dekatsuyo.png | 데카츠요, 홈과 추격자 |
| food-pudding.png | 푸딩 |
| food-pancake.png | 핫케이크 |
| food-cream-puff.png | 요구르트 슈크림 |
| obstacle-rock.png | 바위와 높은 바위 |
| obstacle-log.png | 낮고 긴 쓰러진 나무 |
| obstacle-vines.png | 앉아서 통과하는 덩굴 |

황금 음식은 위의 음식 PNG를 그대로 사용하고 Phaser의 금색 tint와 반짝임을 더한다. 음식의 체력 회복과 황금 효과는 게임의 창작 규칙이다. 바위·쓰러진 나무·덩굴은 치이카와의 숲 분위기를 참고한 배경 장애물이며 원작의 특정 고유 장애물을 재현했다고 주장하지 않는다.

PNG 원본의 알파를 보존했다. `frames.json`은 투명한 여백을 제외해 Phaser의 프레임으로 읽는 좌표 메타데이터다. 파일 자체를 잘라내거나 배경을 새로 칠하지 않는다. 캐릭터 애니메이션은 한 장의 달리는 포즈에 상하 움직임·기울임·앉기 변형을 적용한 것이며 다중 프레임 원작 애니메이션이 아니다.

## 공식 참고 자료

- [치이카와 공식 캐릭터 소개 — 모몽가](https://www.chiikawaofficial.com/characters/)
- [치이카와 마켓 — 데카츠요](https://chiikawamarket.jp/collections/dekatsuyo)
- [데카츠요 공식 분류 아이콘 — 이미지 생성의 외형 참고](https://chiikawamarket.jp/cdn/shop/collections/10dekatsuyo.png?v=1766471286)
- [후지야 공식 발표 — 작중 푸딩과 핫케이크 모티브](https://www.fujiya-peko.co.jp/assets/pdf/press20260325_1.pdf)
- [몽테르 공식 발표 — 작중 요구르트 슈크림](https://www.monteur.co.jp/storage/news/250619_chiikawa.pdf)
- [메인 화면 분위기 참고](https://chiikawa-run.vercel.app/): 파스텔색, 큰 제목, 두꺼운 외곽선의 버튼을 참고했다. 해당 사이트의 이미지·문구·토큰·보상 기능은 복제하지 않는다.

## 사용한 생성 프롬프트

모든 작업에 `transparent_background: true`를 사용했다. 프롬프트 원문은 [asset-prompts.json](asset-prompts.json)에 기록했다. 제작 방식은 내장 도구이며 API/CLI 우회나 API 키를 사용하지 않았다.
