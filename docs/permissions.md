# 권한 매트릭스

`backend/src/routes/*.routes.ts` 의 인증/권한 정책을 사람이 읽을 수 있는 매트릭스로 정리.
**이 문서가 진실 공급원이고, `tests/project-guardrails.test.ts` 의 `ROUTE_AUTH_POLICY` 가 코드와의 일치를 정적으로 검증한다.** 둘 중 하나만 바꾸면 가드레일 테스트가 실패.

## 역할 (Roles)

| Role | 설명 | 비고 |
|---|---|---|
| `admin` | 시스템 관리자. 사용자 CRUD 가능 | 첫 가입자 자동 admin (signup 시 `userCount === 0` 체크) |
| `customer` | 일반 사용자. 자기 소유(owner_id) 데이터만 R/W | 기본값 |
| `vendor` | 업체 사용자. 향후 분기 예정. 현재는 customer 와 동일 동작 | 도메인 분리만 표기, 권한 차이 미구현 |

추가 플래그:

- `can_login` (BOOLEAN): `false` 면 로그인 차단 + 활성 세션도 다음 요청에서 무력화 (`requireAuth` 가 매번 DB 재검사)

## 인증 정책 (route-level)

라우트 파일 단위로 plugin preHandler 등록 정책. 신규 라우트 추가 시 `tests/project-guardrails.test.ts` 의 `ROUTE_AUTH_POLICY` 에도 함께 등록 (둘 다 안 하면 가드레일 실패).

| 라우트 파일 | 정책 | preHandler 가드 | 비고 |
|---|---|---|---|
| `health.routes.ts` | **public** | 없음 | 헬스체크 |
| `auth.routes.ts` | **public** | 없음 (핸들러 안에서 self-check) | signup/login 은 미인증, me/logout/password 는 핸들러 안에서 `req.session.userId` 검증 |
| `users.routes.ts` | **admin** | `requireAuth` + `requireAdmin` | admin 만 다른 사용자 CRUD |
| `projects.routes.ts` | **auth** | `requireAuth` | owner_id 격리 |
| `vendors.routes.ts` | **auth** | `requireAuth` | owner_id 격리 |
| `phases.routes.ts` | **auth** | `requireAuth` | 부모 project 가 owner 인지 검증 |
| `spaces.routes.ts` | **auth** | `requireAuth` | 〃 |
| `line-items.routes.ts` | **auth** | `requireAuth` | 부모 phase → project owner |
| `quotes.routes.ts` | **auth** | `requireAuth` | 부모 line_item → phase → project owner |
| `contracts.routes.ts` | **auth** | `requireAuth` | 〃 |
| `payments.routes.ts` | **auth** | `requireAuth` | 〃 |
| `change-orders.routes.ts` | **auth** | `requireAuth` | 〃 |
| `as-tickets.routes.ts` | **auth** | `requireAuth` | 〃 |
| `attachments.routes.ts` | **auth** | `requireAuth` | 〃, 다형 owner_type 별 추가 검증 |
| `review-materials.routes.ts` | **auth** | `requireAuth` | 〃 |

## 라우트별 상세 (admin / auth 분기점)

### 인증 (auth)

| 메소드 | path | 인증 | 비고 |
|---|---|---|---|
| POST | `/api/auth/signup` | public | rate-limit 10/10min, 첫 가입자 자동 admin |
| POST | `/api/auth/login` | public | rate-limit 10/10min, `can_login=false` 차단 |
| POST | `/api/auth/logout` | self (session) | 본인만 |
| GET | `/api/auth/me` | self (session) | 매 호출 시 `can_login` DB 재검사 |
| POST | `/api/auth/password` | self (session) | 본인 비번 변경. rate-limit 5/10min, 현재 비번 verify 필수, audit `user.password_change` |

### 사용자 관리 (admin)

| 메소드 | path | 인증 | 비고 |
|---|---|---|---|
| GET | `/api/users` | admin | 전체 사용자 조회 |
| POST | `/api/users` | admin | 사용자 생성 |
| PATCH | `/api/users/:id` | admin | role/canLogin/email **diff audit**, password 변경 시 `user.password_reset` audit (self-service `auth/password` 와 구분) |
| DELETE | `/api/users/:id` | admin | 본인 삭제 차단 (`req.params.id === userId(req)`), 마지막 로그인 admin 보호 |

### 자식 리소스 (auth + owner_id 격리)

| 도메인 | 격리 방식 |
|---|---|
| projects | `owner_id = userId(req)` 직접 |
| vendors | `owner_id = userId(req)` 직접 |
| phases / spaces | 부모 project_id → `projectExistsForOwner(projectId, userId)` 확인 |
| line_items | 부모 phase_id → project_id → owner |
| quotes | 부모 line_item_id → phase_id → project_id → owner |
| contracts / payments / change_orders / as_tickets | project_id → owner |
| attachments | project_id → owner + owner_type 별 추가 검증 (`ownerBelongsToProject`) |
| review_materials | project_id → owner |

격리 헬퍼: `lib/access.ts` 의 `projectExistsForOwner`, `ensureChildAccess`, `getLineItemProjectId`, `getQuoteProjectId`.

## 감사 로그 액션 매핑

| Action | 발생 시점 | 기록 내용 |
|---|---|---|
| `signup` | 회원가입 성공 | user.id |
| `login.success` | 로그인 성공 | user.id |
| `login.fail` | 로그인 실패 (no_user / login_disabled / bad_password / password_change_bad_current) | email + reason |
| `logout` | 로그아웃 | user.id (session destroy 직전 기록) |
| `user.create` | admin 이 사용자 생성 | user.id |
| `user.update` | admin 이 사용자 수정 | role/canLogin/email **before/after diff** |
| `user.password_reset` | admin 이 다른(또는 자기) 사용자 비번 재설정 | target email + self 여부 |
| `user.password_change` | 본인 비번 변경 (`/api/auth/password`) | user.id |
| `delete` | 모든 리소스 삭제 (가드레일 강제) | resource id |
| `contract.status_change` | 계약 상태 변경 | status before/after |
| `payment.update` | 결제 변경 | status / amount delta |
| `change_order.update` | 변경오더 변경 | status / amountDelta |
| `quote.select` | 견적 채택 | line_item_id, quote_id |

## 정적 강제

이 문서가 코드와 일치하는지 `tests/project-guardrails.test.ts` 가 검증:

- `[meta] 모든 라우트 파일이 ROUTE_AUTH_POLICY 에 등록되어 있다`
- `[meta] 라우트 파일이 인증 정책에 맞는 가드를 등록한다`
- `every DELETE route writes an audit entry`
- `auth routes record login/signup/logout in audit log`

신규 라우트 추가 시 체크리스트:

1. 라우트 파일에 `app.addHook("preHandler", requireAuth)` (또는 `requireAdmin`) 추가
2. `tests/project-guardrails.test.ts` 의 `ROUTE_AUTH_POLICY` 매핑 추가
3. **이 문서의 "인증 정책" 표에 한 줄 추가** (사람이 읽는 진실 공급원)
4. 새 mutation 이면 fastify schema 등록 (가드레일이 강제)
5. delete 면 `audit(req, "delete", ...)` 호출 (가드레일이 강제)

## 향후 권한 분리 (현재 미구현)

`vendor` role 은 도메인 분리만 표기되어 있고 실제 권한 차이는 없다. 향후 다음 분기 검토:

- vendor: 자신과 관련된 견적/계약만 read-only
- customer: 현재 owner 모델 그대로
- admin: 전체 + 사용자 CRUD

도입 시점은 가족 외 외부 사용자 추가 단계. 그 전엔 YAGNI.
