# 인테리어 견적 관리 v2 — 코딩 표준

## 프로젝트 개요

- **이름**: 인테리어 견적 관리 (Interior Quote & Vendor CRM)
- **운영 형태**: 단일 사용자 → 향후 가족 3~5명 공유
- **목표**: 프런트 / 백엔드 / DB 경계가 선명한 구조. AI도 그 경계를 넘지 않게.

## 기술 스택 (확정)

| 영역 | 기술 | 비고 |
|---|---|---|
| Frontend | **Vanilla JS + HTML + CSS** | 빌드 없음. JSDoc + `tsc --checkJS`로 타입 체크 |
| Backend | **Fastify + TypeScript** | 의존성: fastify, pg, bcryptjs, @fastify/cookie, @fastify/session, @fastify/multipart, @fastify/static |
| DB | **PostgreSQL** | 직접 SQL. ORM 없음 |
| API 계약 | **OpenAPI YAML** | `docs/api-contract.openapi.yaml` 가 단일 진실 공급원 |

## 절대 금지 — AI는 이 룰을 절대 어기지 않는다

### 디렉토리 영역

```
frontend/  ← 화면, DOM, fetch만
backend/   ← JSON API, 인증, 비즈니스 로직, SQL
database/  ← schema, migration, seed
docs/      ← API 계약, 아키텍처 문서
```

### 프론트엔드 AI

- **만질 수 있는 파일**: `frontend/**` 만
- **금지**: `backend/**`, `database/**` 임의 수정
- **`fetch()` 호출은 `frontend/public/src/api.js` 에서만**. 다른 파일에서 직접 fetch 금지
- **HTML 안에 inline 스크립트 금지** (`onclick="..."`, `<script>` 본문 등)
- **`data-action` 패턴 사용** — 이벤트는 위임 방식으로 한 곳에서 처리
- **모듈 분리**: 화면 단위로 `frontend/public/src/modules/{name}.js`
- **빌드 도구 금지**: webpack, Vite, esbuild 등 모두 금지. `<script type="module" src="...">` 직접 로드
- **React/Vue/Svelte 등 프레임워크 금지**
- **`document.querySelector` 결과는 `null` 가능성 인식**

### 백엔드 AI

- **만질 수 있는 파일**: `backend/**`
- **금지**: `frontend/**` 임의 수정
- **응답은 JSON만**. HTML 렌더 금지. `Content-Type: application/json`
- **라우트 prefix**: 모든 API는 `/api/*` 아래
- **SQL은 `backend/src/repos/*.repo.ts` 에만**. `routes/*` 안에서 SQL 작성 금지
- **라우트는 repo 함수만 호출** + 입력 검증 + 응답 형성
- **인증**: 모든 `/api/*` 요청은 세션 검증 (예외: `/api/auth/login`, `/api/auth/signup`, `/api/health`)
- **에러 응답 형식**: `{ ok: false, error: string, fieldErrors?: Record<string, string> }`
- **성공 응답 형식**: `{ ok: true, data: T }`
- **파일 업로드는 `@fastify/multipart`** + `uploads/` 에 저장

### DB 영역

- **변경은 양측 합의 후** `database/migrations/{NNN}_{name}.sql` 추가
- **`database/schema.sql`은 항상 최신 스키마 전체** (migrations 적용 결과)
- **컬럼/테이블 변경 시 `docs/api-contract.openapi.yaml` 함께 갱신**

### 공유 계약

- **`docs/api-contract.openapi.yaml`이 단일 진실 공급원**
- 코드 수정 *전에* 계약 먼저 수정
- 프런트는 이 문서 보고 `api.js` 작성, 백엔드는 이 문서 보고 라우트 작성
- 어긋나면 빌드/실행 시 즉시 발견되어야 함

## 코드 품질

- **파일 500줄 이하**, 함수 50줄 이하 권장
- **들여쓰기 2칸**
- **들여쓰기 / 따옴표는 prettier 기본**
- **변수/함수 의도가 이름에 드러나야** — 주석은 WHY만
- **하드코딩 금지** — DB id, URL, 임계값 등은 상수로

## 폴더 구조

```
interior-v2/
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── src/
│   │       ├── main.js              # 부팅, 라우팅 초기화
│   │       ├── api.js               # 유일하게 fetch 사용 가능
│   │       ├── dom.js               # DOM 헬퍼
│   │       ├── state.js             # 화면 상태 (작은 store)
│   │       └── modules/
│   │           ├── auth.js
│   │           ├── projects.js
│   │           ├── phases.js
│   │           ├── vendors.js
│   │           ├── line-items.js
│   │           ├── quotes.js
│   │           ├── photos.js
│   │           └── settings.js
│   ├── jsconfig.json                # JSDoc + checkJS 활성화
│   └── package.json                 # 정적 dev 서버용 (선택)
│
├── backend/
│   ├── src/
│   │   ├── server.ts                # 진입점
│   │   ├── routes/                  # HTTP 입출력만
│   │   │   ├── auth.routes.ts
│   │   │   ├── projects.routes.ts
│   │   │   └── ...
│   │   ├── repos/                   # SQL은 여기만
│   │   │   ├── users.repo.ts
│   │   │   ├── projects.repo.ts
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── db.ts                # pg Pool
│   │   │   ├── auth.ts              # bcrypt, 세션 헬퍼
│   │   │   └── env.ts               # 환경 변수 검증
│   │   └── types/
│   │       └── domain.ts            # Project, Vendor 등 도메인 타입
│   ├── package.json
│   └── tsconfig.json
│
├── database/
│   ├── schema.sql                   # 항상 최신 전체 스키마
│   ├── migrations/
│   │   └── 001_init.sql
│   └── seed.sql
│
├── docs/
│   ├── api-contract.openapi.yaml    # 단일 진실 공급원
│   └── architecture.md
│
├── uploads/                         # 사진 저장소 (gitignore)
├── .env.example
├── .gitignore
├── CLAUDE.md
└── README.md
```

## React 전환 기준 (미리 정해둠)

다음 중 **2개 이상** 충족 시 `frontend/` 만 React로 마이그레이션 검토:

1. 같은 데이터를 3개 이상 화면 조각에서 동시에 갱신 필요
2. `render*()` 함수 간 의존성이 꼬이기 시작 (한 곳 바꾸면 다른 곳도 손봐야)
3. 모달/탭/필터/inline edit 상태가 너무 많아져서 `state.js`가 300줄 초과
4. 폼 검증·동기화 코드가 라이브러리 도움 없이 감당 안 됨

→ 이 기준 충족 *전*에 React 도입 금지. 충족 시 백엔드는 그대로 두고 프런트만 교체.

## 작업 원칙

### 5원칙

1. **계약 우선**: API 변경은 `docs/api-contract.openapi.yaml` 먼저 수정
2. **영역 침범 금지**: 자기 디렉토리 외 임의 수정 금지
3. **기존 파일 우선 확인**: 신규 파일 만들기 전 유사 구현 확인
4. **검증 책임**: 백엔드는 zod 또는 fastify schema로 입력 검증
5. **diff 무결성**: `git add -A` 금지. 의도한 파일만 스테이지

### Done 직전 체크

- [ ] 영역 룰 위반 없는가
- [ ] OpenAPI 계약과 코드 일치하는가
- [ ] 백엔드: SQL은 repos에만 있는가
- [ ] 프런트: fetch는 api.js에만 있는가
- [ ] backend: `npm run build` 통과
- [ ] frontend: `npm run typecheck` 통과 (JSDoc + tsc)

## Anti-Patterns

| 패턴 | 방지 |
|---|---|
| 라우트에서 SQL 직접 작성 | repos에 함수 만들고 호출 |
| `<button onclick="...">` | `<button data-action="...">` + 이벤트 위임 |
| 모듈에서 직접 `fetch()` | `api.js` 함수만 호출 |
| OpenAPI 안 고치고 응답 형식 변경 | 계약 먼저 → 코드 |
| `frontend/` 안에 빌드 도구 추가 | 절대 금지 |
| TypeScript on frontend | JSDoc + checkJS만 사용 |
