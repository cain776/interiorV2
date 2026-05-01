# 프로젝트 구조 지도

이 문서는 폴더를 먼저 크게 갈아엎기 위한 문서가 아니라, 현재 구조의 책임 경계를 고정하기 위한 지도다.
정리는 "필요할 때 작게 이동"하고, 기본값은 현재 구조 유지다.

## 최상위 책임

| 경로 | 책임 | 변경 기준 |
|---|---|---|
| `frontend/` | 브라우저 화면, DOM 상태, 사용자 입력, 백엔드 API 호출 | 화면/상호작용 변경 |
| `backend/` | Fastify API, 인증/세션, 입력 검증, 비즈니스 규칙, DB 접근 조립 | API/업무 규칙 변경 |
| `database/` | PostgreSQL schema, migration, seed, DB 참조 SQL | 테이블/인덱스/제약 변경 |
| `docs/` | API 계약, 아키텍처, 운영/구조 결정 기록 | 규칙/계약/운영 방식 변경 |
| `tools/` | 로컬 실행, 종료, 백업 같은 운영 보조 스크립트 | 개발자 실행 흐름 변경 |
| `backups/` | 로컬 DB dump 보관 위치 | 생성물 보관, git 추적 금지 |
| `uploads/`, `tmp/`, `.tmp/` | 생성물/임시 파일 | 앱 핵심 로직 배치 금지 |

## Frontend

현재 방향은 Vanilla JS 유지다. React/Vue 전환은 구조적 압력이 실제로 커졌을 때 검토한다.

| 경로 | 책임 |
|---|---|
| `frontend/public/index.html` | 앱 shell, root element, modal/toast root |
| `frontend/public/src/main.js` | 라우팅, 로그인 상태 복원, 전역 click action |
| `frontend/public/src/api.js` | 백엔드 HTTP 호출 단일 출입구 |
| `frontend/public/src/state.js` | 작은 전역 상태 |
| `frontend/public/src/dom.js` | DOM helper, escaping |
| `frontend/public/src/modules/` | 화면 단위 모듈 |
| `frontend/public/css/` | 기능/화면 단위 CSS |

### Frontend 규칙

- 백엔드/DB 파일 import 금지. 외부 통신은 `api.js`를 통한다.
- inline `onclick` 금지. `data-action` + event delegation 사용.
- API 응답 shape 변경 시 `api.js` JSDoc typedef를 먼저 맞춘다.
- 모달/토스트 같은 공통 UI는 `modules/modal.js`, `modules/toast.js`를 우선 재사용한다.
- 파일 줄 수만 맞추기 위해 의미 없는 분리는 하지 않는다. 분리 기준은 "책임이 달라졌는가"다.

## Backend

| 경로 | 책임 |
|---|---|
| `backend/src/server.ts` | Fastify 앱 조립, 보안 hook, plugin/register, error handler |
| `backend/src/routes/*.routes.ts` | HTTP route, schema, access check, repo 호출, 응답 shape |
| `backend/src/repos/*.repo.ts` | SQL과 row mapping. DB 접근은 여기로 모은다 |
| `backend/src/lib/` | 공통 helper. `db.ts`를 제외하고 SQL 금지 |
| `backend/src/types/` | 도메인 타입 |
| `backend/src/scripts/` | migrate, import, backfill 같은 실행 스크립트 |
| `backend/src/tests/` | 정적 가드레일 및 통합 테스트 |

### Backend 규칙

- `routes/*`는 SQL을 직접 쓰지 않는다.
- `lib/*`도 `db.ts`를 제외하고 SQL을 직접 쓰지 않는다.
- SQL은 `repos/*.repo.ts`에 둔다.
- 라우트는 `{ ok: true, data }` / `{ ok: false, error, fieldErrors? }` 응답 규격을 유지한다.
- 5xx 상세 메시지는 클라이언트에 노출하지 않는다.
- 삭제/민감 상태 변경은 audit 정책을 확인한다.

## Database

| 경로 | 책임 |
|---|---|
| `database/migrations/` | 순차 migration. 적용 이력은 `schema_migrations` |
| `database/schema.sql` | 최신 전체 스키마 참조본 |
| `database/seed.sql` | 초기/데모 데이터 |
| `database/import-v1-mock-to-v2.ts` | v1 mock 데이터 이전 도구 |

### Database 규칙

- 새 DB 변경은 migration 추가 + `schema.sql` 갱신을 함께 한다.
- 이미 적용된 migration 수정은 피한다. 필요하면 새 migration을 추가한다.
- 대량/환경 의존 데이터 보정은 migration보다 `backend/src/scripts/backfill-*.ts`가 기본 후보.
- `008/009/010`의 기존 데이터 보정 UPDATE 는 역사적 예외로 둔다. 새 migration 에서는 DDL/DML 을 다시 섞지 않는다.
- 다형 association은 DB FK로 완전 보장되지 않으므로 라우트/repo 검증을 함께 봐야 한다.

## Tools

| 경로 | 책임 |
|---|---|
| `tools/서버실행.bat` | 로컬 DB 확인/서버 실행 |
| `tools/서버종료.bat` | 로컬 서버 종료 |
| `tools/db-backup.bat` | PostgreSQL dump 생성 |
| `tools/*.mjs` | 일회성 수집/변환 도구 |

### Tools 규칙

- 도구는 앱 런타임 로직을 품지 않는다.
- DB를 건드리는 도구는 대상 DB를 명확히 출력하고, destructive 작업은 별도 확인을 둔다.
- Docker Compose 도입 시 `tools/`는 compose를 호출하는 얇은 wrapper 역할만 한다.
- 백업 결과물은 `backups/`에 두되, `.gitkeep` 외 dump 파일은 git에 올리지 않는다.

## 최소 변경 원칙

1. 먼저 문서로 책임 경계를 적는다.
2. 실제로 커진 파일이나 중복된 흐름만 분리한다.
3. 파일 이동보다 테스트/가드레일을 우선한다.
4. 구조 변경 후에는 `backend npm test`, `backend npm run build`, `frontend npm run typecheck`로 확인한다.
