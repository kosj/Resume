# 고성종 이력서

Unreal Engine·Unity 게임 개발 경력과 주요 프로젝트를 정리한 GitHub Pages 정적 사이트입니다.

## 구성

- `index.html`: 이력서 내용
- `style.css`: 웹 포트폴리오의 반응형 스타일
- `print.css`, `resume.html`, `assets/ko-seongjong-resume.pdf`: 제출용 2쪽 이력서
- `navigation.js`: 프로젝트 상세를 펼치는 앵커 이동
- `.nojekyll`: 정적 파일을 그대로 제공
- `assets/career-overview.mp4`: 90초 핵심 개발 경험 소개 영상
- `video.js`: 대표 영상의 구간 이동과 재생 처리
- `demo/`: 직접 조작할 수 있는 3D 전투 데모와 기술 설명·용어집
- `fps-demo/`: FPS 기술 시연과 설명·용어집
- `dedicated-demo/`: 언리얼 서버 권한·이동 예측과 보정·RPC·HP 복제·재접속 설명 영상과 용어집
- `zenonia-demo/`: A* 자동 길찾기·서버/클라이언트 락스텝 시연과 설명·용어집

상단 경력 요약과 대표 기술 사례 3개를 먼저 보여주고, 전체 프로젝트 담당 업무는 접어서 제공합니다.
직접 링크로 이동하면 해당 프로젝트 상세를 펼칩니다. The Last 실제 플레이는 대표 사례에 배치하고,
별도 기술 시연에는 출처 구분을 표시했습니다. 공통 전투 구조와 위젯 재사용 방향은 도식으로 설명합니다.
확인되지 않은 팀 규모·개선율은 추가하지 않습니다.

모든 MP4 영상은 마우스를 올리면 음소거로 재생되고 벗어나도 계속 재생됩니다.
다른 영상을 재생하면 이전 영상은 정지합니다. 터치 환경과 움직임 감소 설정에서는 재생 버튼으로 시작합니다.
영상 구성·출처·재생성 방법은 [assets/README.md](assets/README.md)에 정리했습니다.

상단 PDF 링크에서 제출용 이력서를 바로 내려받을 수 있습니다. 웹페이지의 브라우저 인쇄도 동일한 2쪽 요약을 사용합니다.
인쇄용 내용의 원본은 `index.html`의 `.print-resume`이며, 내용을 수정한 뒤 아래 명령으로 별도 페이지·PDF를 갱신합니다.
Python Playwright와 Chromium이 필요하며 개발 환경의 `/usr/bin/chromium`을 사용합니다.

```bash
python3 tools/build-resume.py
python3 tools/check-resume.py
```

3D 데모는 ES 모듈을 사용하므로 HTTP 서버에서 실행합니다. 저장소 루트에서 `python3 tools/serve.py`를 실행한 뒤 `/demo/index.html` 경로를 엽니다. 이 서버는 영상 구간 이동에 필요한 HTTP 바이트 범위를 지원하며 기본 포트는 8000입니다(`--port`로 변경). WASD·방향키 이동, Space 공격, E 강화, R 초기화를 지원합니다.

GitHub Pages 게시 소스는 `main` 브랜치의 루트(`/`)입니다.


## 방문 분석 관리자

`admin/`에 기간·유입 유형별 방문 분석, CSV 내보내기와 UTM 링크 생성기를 제공합니다.
Cloudflare Workers + D1용 수집·인증 조회 API는 `backend/`에 있습니다.
`analytics/config.mjs`는 운영 API `https://resume-analytics.godkosj.workers.dev`에 연결되어 있습니다.
관리자 페이지에서 관리자 키로 로그인하면 연결 이후의 실제 데이터를 조회합니다.
운영 구성과 다른 계정에 설치하는 방법은 `admin/setup.html`과 [Cloudflare 연결 안내](backend/README.md)에 정리했습니다.
관리자 키와 세션 해시 키는 Worker secret에만 저장하고 공개 저장소에 넣지 않습니다.
데이터는 90일 보관하며 원본 IP·전체 URL·User-Agent는 분석 DB에 보관하지 않습니다.
수집 방식과 참여 선택은 `privacy/`에서 안내합니다.

```bash
node --test tools/test-analytics.mjs
```
