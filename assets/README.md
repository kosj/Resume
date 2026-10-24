# 게임 기술 적용 흐름 영상

`career-overview.mp4`는 작동하는 별도 3D 게임 데모의 장면을 렌더링한 90초 무음 영상입니다.
캐릭터가 이동·공격하고, 투사체가 도착하면 실제 시뮬레이션의 HP·피해·풀 슬롯이 바뀝니다.
원래 회사 프로젝트의 소스나 녹화, Unreal 실행 화면이 아닙니다. 수치와 계산 규칙은 예시입니다.

## 구성

| 구간 | 내용 |
| --- | --- |
| 00:00–00:08 | 이동·공격·명중이 실행되는 훈련장 |
| 00:08–00:22 | 입력 → 투사체 비행 → HP 반영 |
| 00:22–00:35 | 같은 입력·데이터·시드로 독립 계산한 두 모델 비교 |
| 00:35–00:55 | 강화 상태 → 스탯·피해·오라 효과 |
| 00:55–01:15 | 투사체 슬롯의 대여·반환·재사용 |
| 01:15–01:30 | 입력 기록 재생과 직접 조작 안내 |

## 직접 조작

저장소 루트에서 `python3 tools/serve.py`를 실행하고,
로컬 브라우저에서 `/demo/index.html` 경로를 엽니다. ES 모듈을 사용하므로 데모는 HTTP로 제공합니다.
‘직접 조작하기’를 누르면 WASD·방향키 이동, Space 공격, E 강화, R 초기화가 가능합니다.
모바일용 이동·공격·강화 버튼도 제공합니다. 영상 재생과 데모 실행에는 별도 빌드가 필요하지 않습니다.
기본 포트는 8000이며 `--port`로 변경합니다. 영상 구간 탐색은 바이트 범위 응답이 필요하므로 제공한 서버를 사용합니다. GitHub Pages는 해당 응답을 지원합니다.

## 제작과 검증

게임 상태는 `demo/combat-sim.mjs`, 3D 장면은 `demo/game.mjs`, 장면 설명·목차는
`demo/index.html`의 HEAD와 notes에 있습니다. 모션은 임의 프레임으로 탐색해도 같은 결과가 나옵니다.
클라이언트·서버 모델은 같은 브라우저에서 각각 계산하며 실제 네트워크 통신은 하지 않습니다.
이 데모의 기록 재생은 판테라의 미구현 일반 대전 리플레이와 무관합니다.

제작 도구는 Node.js 18+, Playwright Chromium, FFmpeg가 필요합니다.
렌더러는 Node Playwright를 우선 사용하고, 없으면 현재 환경의 Python Playwright에 포함된 Node 드라이버를 사용합니다.
Chromium 기본 경로는 `/usr/bin/chromium`이고 `CHROMIUM_PATH`로 변경할 수 있습니다.

저장소 루트에서 실행합니다.

```bash
node --test tools/test-combat.mjs
node tools/motion/render.mjs demo/index.html /tmp/combat-stills --stills 4.2,13,28,42,63,81
node tools/motion/check-player.mjs demo/index.html
node tools/motion/build-articles.mjs --site https://kosj.github.io/Resume/
node tools/motion/render.mjs demo/index.html assets/career-overview.mp4 --fps 24 --crf 24
```

MP4는 1920×1080·24fps H.264/yuv420p·faststart로 저장합니다.
3D 월드는 모바일·소프트웨어 WebGL을 고려해 내부 1280×720으로 렌더링하고,
텍스트·HUD는 1920×1080 캔버스에 그립니다. 게임 화면 자체에는 별도 후처리 블룸을 적용하지 않습니다.

포스터는 4.2초 프레임을 JPEG로 저장하며, 한국어 WebVTT 자막은 같은 목차 구간에 맞춥니다.
설명·용어집은 notes를 수정한 후 생성기로 다시 만듭니다. 생성된 페이지를 직접 편집하지 않습니다.
구간이 바뀌면 이력서의 영상 링크와 자막도 함께 수정합니다.

## 출처

[jungrok5/motion-skills의 tech-motion-explainer](https://github.com/jungrok5/motion-skills/tree/main/tech-motion-explainer)를 적용했습니다.
고정한 소스 커밋은 `b13d9caeed49d21c16f11c7502071dec96cd25d3`입니다.
`assets/kits/game-scene.js`는 해당 스킬의 게임 장면 엔진이며,
`tools/motion/`은 제공된 렌더·플레이어 검증·설명 생성 도구를 이 저장소에 맞게 조정한 것입니다.
조정 내용은 Chromium 경로·기존 Playwright 드라이버 지원, 모듈 MIME, 단일 주제 메타데이터, FFmpeg 실패 전파입니다.

Three.js와 글꼴의 출처·라이선스는 [THIRD-PARTY.md](THIRD-PARTY.md)에 있습니다.
