# Cloudflare 방문 분석 API 연결

관리자 화면은 `/Resume/admin/`에 있으며 GitHub Pages가 정적으로 제공합니다.
실제 방문 기록은 별도의 Cloudflare Worker가 수집하고 D1에 저장합니다.
운영 `API_BASE`는 `https://resume-analytics.godkosj.workers.dev`이며 APAC D1에 연결되어 있습니다.
관리자 키와 세션 해시 키는 Cloudflare Worker secret에 설정되어 있습니다.
관리자 페이지의 API 주소는 자동으로 채워지며 관리자 키로 인증해 조회합니다.
연결 전 관리자 화면의 ‘예시 데이터’는 명시적으로 생성한 샘플이며 방문 기록이 아닙니다.

## 다른 계정에서 최초 배포

Node.js 22 이상이 설치된 컴퓨터에서 저장소를 받은 뒤 실행합니다.
Cloudflare의 Workers·D1 사용 권한이 있는 계정이 필요합니다.

```bash
cd backend
npx wrangler@4 login
npx wrangler@4 d1 create resume-analytics
```

반환된 `database_id`를 `backend/wrangler.toml`의 `database_id`에 넣습니다. 운영 DB ID를 다른 계정 배포에 재사용하지 마세요.
D1 ID와 API URL은 공개 설정이며 비밀 키가 아닙니다.

```bash
npx wrangler@4 d1 migrations apply resume-analytics --remote
```

관리자 키와 세션 해시용 비밀값을 **각각 별도로** 32바이트 이상 무작위로 생성해
비밀번호 관리자 등에 안전하게 보관합니다. 관리자 키는 나중에 관리자 화면에 입력합니다.
다음 명령을 각각 실행하고 표시되는 비밀 입력 프롬프트에 값을 넣습니다.
실제 키를 저장소·공개 JS·Issue·명령행 인자에 넣지 마세요.

```bash
npx wrangler@4 secret put ADMIN_TOKEN
npx wrangler@4 secret put SESSION_SALT
npx wrangler@4 deploy
```

배포 결과의 Worker URL을 저장소 루트의 `analytics/config.mjs`에 넣습니다.

```js
export const API_BASE = 'https://resume-analytics.<계정의-하위도메인>.workers.dev';
```

이 공개 설정과 실제 D1 ID가 담긴 `wrangler.toml`을 커밋·푸시하여 Pages를 갱신합니다.
관리자 페이지에서 같은 API URL과 `ADMIN_TOKEN`을 입력하면 실제 데이터가 조회됩니다.
UTM 생성기로 테스트 링크를 만들고 새 탭에서 방문한 뒤 관리자 화면을 조회해 확인합니다.
새 탭이므로 관리자 탭의 sessionStorage와 별개입니다.

`SITE_ORIGIN = "https://kosj.github.io"`, `BASE_PATH = "/Resume/"`가 현재 사이트와 일치해야 합니다.
커스텀 도메인으로 바꾸면 두 설정도 함께 변경하고 Worker를 재배포합니다.
API는 `/collect` POST, `/report` GET, CORS preflight만 제공합니다.
조회 시 반드시 사이트 Origin과 Bearer 관리자 키가 필요합니다.

## 집계와 데이터

- 세션: 탭별 sessionStorage 임의 UUID, 마지막 페이지 이동 후 30분 만료. 사람 수가 아닙니다.
- 최초 유입 정보는 세션 동안 유지합니다. UTM source 우선, 그다음 외부 Referrer 호스트를 분류합니다.
- 유입/진입 페이지/기기/캠페인 표는 기간 내 시작한 세션을 세고, 페이지 조회는 기간 내 발생한 조회를 셉니다.
- 쿼리·앵커·원본 Referrer·IP·User-Agent를 DB에 저장하지 않습니다.
- 허용한 정적 페이지 경로와 제한된 UTM 필드만 기록하며 관리자·안내 페이지·렌더링 요청은 제외합니다.
- 세션 UUID는 SESSION_SALT를 키로 HMAC 처리한 값만 DB에 보관합니다.
- 원본 요청은 Cloudflare 네트워크를 통과합니다. Worker 호출 로그는 설정에서 끕니다.
- 일일 Cron은 90일이 지난 조회와 남은 조회가 없는 오래된 세션을 삭제합니다.
- 관리자 키는 Worker secret이며 브라우저에서는 탭의 메모리에만 유지합니다. API 주소만 localStorage에 남습니다.
- 데이터가 있는 API 응답은 Cache-Control: no-store이며 인증 없이 통계를 읽을 수 없습니다.
- 수집 엔드포인트는 공개입니다. Origin 검사는 브라우저 범위를 제한하지만 봇/조작 방지 인증은 아닙니다.
  트래픽이 늘면 Cloudflare 측 속도 제한과 사용량 알림을 설정하세요. 이 통계는 정확한 사람 수/감사 로그가 아닙니다.
- Do Not Track·Global Privacy Control·방문 분석 끄기를 존중합니다. 과거 데이터 소급 수집은 하지 않습니다.

## 로컬 검증

외부 계정 없이 Node.js 24의 내장 SQLite로 API를 검증할 수 있습니다.

```bash
node --test tools/test-analytics.mjs
python3 tools/serve.py --port 8009
```

다른 터미널에서 `ADMIN_TOKEN`에 로컬 개발용 32자 이상의 키를 환경 변수로 설정하고 실행합니다.
운영 키를 사용하지 마세요. OS/셸의 비밀 입력 방식을 사용하고 셸 기록에 남기지 마세요.

```bash
node backend/local.mjs
```

로컬 API는 `127.0.0.1:8787`에만 바인딩합니다. 기본 DB는 프로세스 메모리이며 종료하면 삭제됩니다.
`ANALYTICS_DB` 환경 변수로 SQLite 파일 경로를 지정할 수 있습니다(`*.sqlite`는 gitignore).
기본 허용 Origin은 `http://127.0.0.1:8009`이며 `SITE_ORIGIN` 환경 변수로 변경할 수 있습니다.
로컬 관리자 페이지에서 로컬 API와 개발 키를 입력해 연결합니다.
실제 tracker 동작까지 로컬에서 확인하려면 공개 설정 `API_BASE`를 로컬 API URL로 임시 변경한 뒤 복구합니다.
로컬 URL을 운영 설정으로 커밋하지 마세요.

테스트는 인증 실패·Origin 차단·중복 조회·최초 유입 유지·세션 해시·KST 날짜·채널 필터·본문 제한·경로 검증·보관 기간을 검증합니다.
SQLite 어댑터는 동일 SQL을 실행하지만 Cloudflare의 실제 배포·제한·네트워크를 대신 검증하지 않습니다.

## 운영 변경

관리자 키를 바꾸려면 `wrangler secret put ADMIN_TOKEN`을 다시 실행합니다.
SESSION_SALT 변경은 이후 들어오는 세션의 연결을 끊으므로 정기 키 교체 시 집계 영향을 고려하세요.
전체 수집을 끄려면 `API_BASE`를 빈 문자열로 바꾸어 Pages에 배포합니다.
