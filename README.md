# 인테리어 견적 관리 v2

프런트 / 백엔드 / DB 경계가 선명한 단일 사용자 CRM.

## 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | Vanilla JS + HTML + CSS (빌드 없음, JSDoc + `tsc --checkJS`) |
| Backend | Fastify + TypeScript (tsx watch, ESM) |
| DB | PostgreSQL (직접 SQL, ORM 없음) |
| 세션 | `connect-pg-simple` (PG 영속, 재시작에도 로그인 유지) |
| API 계약 | OpenAPI YAML (`docs/api-contract.openapi.yaml`) |

## 디렉토리

```
frontend/   화면, DOM, fetch만
backend/    JSON API, 인증, 비즈니스 로직, SQL
database/   schema, migration, seed
docs/       API 계약, 아키텍처 문서
```

자세한 룰은 [CLAUDE.md](./CLAUDE.md) 참조.

## 관련 문서

| 문서 | 내용 |
| --- | --- |
| [아키텍처](./docs/architecture.md) | 데이터 흐름, 도메인 규칙, 보안/가드레일 |
| [프로젝트 구조 지도](./docs/project-map.md) | 폴더별 책임과 변경 기준 |
| [로컬 Docker / DB 운영 메모](./docs/docker-local.md) | Docker의 역할, DB 데이터 위치, Compose 전환 방향 |
| [OpenAPI 계약](./docs/api-contract.openapi.yaml) | API path, request/response 계약 |

## 빠른 시작

### 1. PostgreSQL 준비

선택 1 — Docker Compose (Docker Desktop 실행 후, 권장):

```sh
docker compose up -d db
```

선택 2 — Docker 수동 실행:

```sh
docker run -d --name interior-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=interior \
  -p 5432:5432 postgres:16-alpine
```

선택 3 — 네이티브 설치 (Windows 인스톨러 / brew / apt 등) 후:

```sh
psql -U postgres -c "CREATE DATABASE interior;"
```

### 2. 환경 변수

```sh
cd backend
cp ../.env.example .env
# .env 의 DATABASE_URL, SESSION_SECRET 채우기
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/interior
#   SESSION_SECRET=충분히-긴-32자-이상-랜덤
#   TRUST_PROXY=false  # nginx/cloudflare 같은 reverse proxy 뒤에서만 true
```

`NODE_ENV=production` 일 때 `SESSION_SECRET` 이 `dev-only…` 또는 32자 미만이면 부팅이 거부됩니다.

### 3. 마이그레이션

```sh
cd backend
npm install
npm run migrate
```

`schema_migrations` 테이블에 적용 이력이 남고 재실행은 무시됩니다.
새 SQL 은 `database/migrations/{NNN}_{name}.sql` 형식으로 추가한 뒤 같은 명령으로 적용.

> ⚠ **`schema.sql` 직접 적용 주의** — `database/schema.sql` 은 최신 전체 스키마의 **참조용**입니다. `psql -f schema.sql` 로 한 번만 적용하면 `schema_migrations` 가 비어있어 이후 `npm run migrate` 가 모든 마이그레이션을 다시 실행하려 시도해 충돌합니다. **새 환경은 항상 `npm run migrate` 로 시작하세요.**

### 4. 백엔드 실행

```sh
cd backend
npm run dev
```

→ `http://127.0.0.1:3001` 에서 프런트 정적파일 + `/api/*` 통합 서빙.

### 5. 프런트 타입 체크 (선택)

```sh
cd frontend
npm install
npm run typecheck
```

빌드 도구 없음 — 브라우저는 `<script type="module">` 로 ES module 직접 로드.

## 데모 계정

시드 후 다음 계정으로 로그인 가능:

```
email:    demo@example.com
password: demo1234
```

(시드 스크립트가 만든 계정. 직접 가입하려면 `/signup`)

## 도메인

| 엔티티 | 테이블 | 라우트 (대표) |
| --- | --- | --- |
| 프로젝트 | `projects` | `/api/projects` |
| 업체 | `vendors` | `/api/vendors` |
| 공정 | `phases` | `/api/projects/:id/phases` |
| 공간 | `spaces` | `/api/projects/:id/spaces` |
| 견적 항목 | `line_items` | `/api/phases/:id/line-items` |
| 견적 | `quotes` | `/api/line-items/:id/quotes` |
| 계약 / 결제 / 변경오더 / AS | `contracts`, `payments`, `change_orders`, `as_tickets` | `/api/contracts` 외 |
| 첨부 / 검토자료 | `attachments`, `review_materials` | `/api/projects/:id/attachments` 외 |
| 워크스페이스 번들 | (조합) | `/api/projects/:id/workspace` |

응답 규격:

- 성공 — `{ ok: true, data: T }`
- 실패 — `{ ok: false, error: string, fieldErrors?: Record<string, string> }`

## 작업 디렉토리 룰

| 영역 | 가능 | 금지 |
| --- | --- | --- |
| `frontend/**` | DOM, 화면, `fetch()` 호출 (단 `frontend/public/src/api.js` 만) | 백엔드/DB 임의 수정, 빌드 도구, React/Vue, inline `onclick` |
| `backend/**` | JSON API, 비즈니스 로직, SQL (단 `repos/*.repo.ts` 만) | 프런트 수정, HTML 응답, `/api/*` 외 라우트 |
| `database/**` | schema, migration, seed | OpenAPI 미반영 변경 |

## 보안 / 운영

- 모든 `/api/*` 는 세션 검증 (예외: `/api/auth/login`, `/api/auth/signup`, `/api/health`).
- 로그인/가입은 `@fastify/rate-limit` 로 10분 10회 제한.
- 첨부 `blobUrl` 5MB 가드 (현재 base64 data URL → DB 직접 저장. 추후 디스크/S3 전환 예정).
- 세션 쿠키: `httpOnly`, `sameSite=lax`. 운영 시 `COOKIE_SECURE=true` 필수.
- `TRUST_PROXY=true` 일 때만 `X-Forwarded-Host` 를 Origin 검증에 사용한다.

## 변경 절차

API 변경:
1. `docs/api-contract.openapi.yaml` 수정 (계약 우선)
2. 백엔드 라우트 + repo 구현 + Fastify schema 추가
3. 프런트 `api.js` 함수 + JSDoc typedef 추가

DB 변경:
1. OpenAPI 영향 검토 후 먼저 수정
2. `database/migrations/{NNN}_{name}.sql` 추가
3. `database/schema.sql` 갱신 (항상 최신 전체 스키마)
4. `backend/src/repos/` 수정
5. `npm run migrate` 로 적용

## 명령어 요약

```sh
# DB
docker compose up -d db      # Docker Compose 로 PostgreSQL 시작
npm run migrate              # backend/ 에서 실행. 미적용 마이그레이션 적용
npm run migrate:test         # 테스트 DB 에 마이그레이션 적용 (.env.test 필요)

# 백엔드
npm run dev                  # tsx watch (코드 변경 시 자동 재시작)
npm run typecheck            # tsc --noEmit
npm run build                # dist/ 생성 (tsconfig.build.json)
npm run start                # production 실행
npm test                     # 정적 가드레일 (node:test, DB 불필요)
npm run test:integration     # DB 통합 테스트 (vitest, .env.test 필요)

# 프런트
npm run typecheck            # JSDoc + checkJS
```

Windows 로컬 편의 스크립트:

```bat
tools\서버실행.bat       # DB 확인/시작 → migrate → backend dev server 실행
tools\서버종료.bat       # backend dev server 종료 (DB 는 유지)
tools\db-backup.bat      # 현재 PostgreSQL DB 를 backups/ 로 pg_dump
```

## 통합 테스트 셋업 (선택)

`npm test` 는 정적 가드레일만 돌려 DB 가 없어도 통과합니다.
실제 repo / access / selectQuote 등의 회귀 보호는 `npm run test:integration` 에서 검증되며 별도 테스트 DB 가 필요합니다.

```sh
# 1) 테스트 전용 DB 생성
psql -U postgres -c "CREATE DATABASE interior_test;"

# 2) repo root 에 .env.test 작성
cp .env.test.example .env.test
# DATABASE_URL 에 'test' 키워드 필수 (운영 DB 보호 가드)

# 3) 테스트 DB 에 schema 적용
cd backend && npm run migrate:test

# 4) 통합 테스트 실행
npm run test:integration
```
