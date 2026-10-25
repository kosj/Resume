# 고성종 이력서

Unreal Engine·Unity 게임 개발 경력과 주요 프로젝트를 정리한 GitHub Pages 정적 사이트입니다.

## 구성

- `index.html`: 이력서 내용
- `style.css`: 반응형 화면과 A4 인쇄 스타일
- `.nojekyll`: 정적 파일을 그대로 제공
- `assets/career-overview.mp4`: 90초 핵심 개발 경험 소개 영상
- `video.js`: 대표 영상의 구간 이동과 재생 처리
- `demo/`: 직접 조작할 수 있는 3D 전투 데모와 기술 설명·용어집
- `fps-demo/`: FPS 기술 시연과 설명·용어집
- `dedicated-demo/`: 언리얼 서버 권한·이동 예측과 보정·RPC·HP 복제·재접속 설명 영상과 용어집
- `zenonia-demo/`: A* 자동 길찾기·서버/클라이언트 락스텝 시연과 설명·용어집

소개와 경력 사이에 대표 영상을 배치했습니다. 모든 MP4 영상은 마우스를 올리면 음소거로 재생되고 마우스가 벗어나도 계속 재생됩니다. 재생 컨트롤로 직접 일시정지할 수 있습니다. 터치 환경과 움직임 감소 설정에서는 재생 버튼으로 시작합니다. 작동하는 별도 3D 전투 데모로 전투 계산·버프·투사체 풀링을 보여 줍니다. 실제 프로젝트의 녹화나 Unreal 실행 화면은 아닙니다. 관련 프로젝트에서 해당 구간으로 이동할 수 있고, 인쇄 시에는 데모 링크를 표시합니다. 영상 구성·출처·재생성 방법은 [assets/README.md](assets/README.md)에 정리했습니다.

별도의 설치나 빌드가 필요하지 않습니다. `index.html`을 브라우저에서 열 수 있으며, 상단 인쇄 / PDF 버튼으로 출력할 수 있습니다.

3D 데모는 ES 모듈을 사용하므로 HTTP 서버에서 실행합니다. 저장소 루트에서 `python3 tools/serve.py`를 실행한 뒤 `/demo/index.html` 경로를 엽니다. 이 서버는 영상 구간 이동에 필요한 HTTP 바이트 범위를 지원하며 기본 포트는 8000입니다(`--port`로 변경). WASD·방향키 이동, Space 공격, E 강화, R 초기화를 지원합니다.

GitHub Pages 게시 소스는 `main` 브랜치의 루트(`/`)입니다.


## 방문 분석 관리자

`admin/`에 기간·유입 유형별 방문 분석, CSV 내보내기와 UTM 링크 생성기를 제공합니다.
Cloudflare Workers + D1용 수집·인증 조회 API는 `backend/`에 있습니다.
초기 `analytics/config.mjs`의 API 주소는 비어 있으므로 실제 수집은 비활성 상태입니다.
`admin/setup.html`과 [Cloudflare 연결 안내](backend/README.md)에 따라 계정에 배포한 뒤 API 주소를 설정합니다.
관리자 키와 세션 해시 키는 Worker secret에만 저장하고 공개 저장소에 넣지 않습니다.
데이터는 90일 보관하며 원본 IP·전체 URL·User-Agent는 분석 DB에 보관하지 않습니다.
수집 방식과 참여 선택은 `privacy/`에서 안내합니다.

```bash
node --test tools/test-analytics.mjs
```
