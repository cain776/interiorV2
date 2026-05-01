-- 항상 최신 전체 스키마. migrations 적용 결과와 동일.
-- 변경 시 docs/api-contract.openapi.yaml 도 함께 갱신.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT,
  size_kr       NUMERIC,
  start_date    DATE,
  end_date      DATE,
  total_budget  BIGINT,
  status        TEXT NOT NULL DEFAULT 'planning',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);

CREATE TABLE IF NOT EXISTS vendors (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  ceo         TEXT,
  phone       TEXT,
  email       TEXT,
  specialty   TEXT,
  rating      INTEGER CHECK (rating IS NULL OR (rating BETWEEN 0 AND 5)),
  memo        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendors_owner_idx ON vendors(owner_id);
-- (owner_id, name) 인덱스는 vendors_owner_name_unique UNIQUE 제약이 자동 생성하는 인덱스로 대체.

CREATE TABLE IF NOT EXISTS phases (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  template_key    TEXT,
  scheduled_start DATE,
  scheduled_end   DATE,
  status          TEXT NOT NULL DEFAULT 'planned',
  sort_order      INTEGER NOT NULL,
  considerations  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, sort_order)
);
CREATE INDEX IF NOT EXISTS phases_project_idx ON phases(project_id);

CREATE TABLE IF NOT EXISTS spaces (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  area_sqm    NUMERIC,
  sort_order  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, sort_order)
);
CREATE INDEX IF NOT EXISTS spaces_project_idx ON spaces(project_id);

CREATE TABLE IF NOT EXISTS line_items (
  id                 TEXT PRIMARY KEY,
  phase_id           TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  space_id           TEXT REFERENCES spaces(id) ON DELETE SET NULL,
  location_label     TEXT,
  work_item_label    TEXT,
  label              TEXT NOT NULL,
  memo               TEXT,
  selected_quote_id  TEXT,
  sort_order         INTEGER NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (phase_id, sort_order)
);
CREATE INDEX IF NOT EXISTS line_items_phase_idx ON line_items(phase_id);
CREATE INDEX IF NOT EXISTS line_items_space_idx ON line_items(space_id);
CREATE INDEX IF NOT EXISTS line_items_space_location_item_idx ON line_items(space_id, location_label, work_item_label);

CREATE TABLE IF NOT EXISTS quotes (
  id            TEXT PRIMARY KEY,
  line_item_id  TEXT NOT NULL REFERENCES line_items(id) ON DELETE CASCADE,
  vendor_id     TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  mode          TEXT NOT NULL CHECK (mode IN ('turnkey', 'self')),
  price         BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'negotiating', 'contracted', 'cancelled')),
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  memo          TEXT,
  selected_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quotes_line_item_idx ON quotes(line_item_id);
CREATE INDEX IF NOT EXISTS quotes_vendor_idx ON quotes(vendor_id);

-- 순환 FK: line_items.selected_quote_id ↔ quotes.line_item_id.
-- quotes 가 먼저 만들어진 뒤에야 추가 가능해서 별도 ALTER 로 분리.
ALTER TABLE line_items
  ADD CONSTRAINT line_items_selected_quote_fk
  FOREIGN KEY (selected_quote_id) REFERENCES quotes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS contracts (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id            TEXT REFERENCES phases(id) ON DELETE SET NULL,
  vendor_id           TEXT REFERENCES vendors(id) ON DELETE RESTRICT,
  parent_contract_id  TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  type                TEXT NOT NULL DEFAULT 'standalone'
                        CHECK (type IN ('standalone', 'subcontract')),
  status              TEXT NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned', 'contracted', 'in_progress', 'done', 'disputed', 'cancelled')),
  title               TEXT NOT NULL,
  amount              BIGINT NOT NULL DEFAULT 0,
  scheduled_start     DATE,
  scheduled_end       DATE,
  actual_start        DATE,
  actual_end          DATE,
  memo                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contracts_project_idx ON contracts(project_id);
CREATE INDEX IF NOT EXISTS contracts_phase_idx ON contracts(phase_id);
CREATE INDEX IF NOT EXISTS contracts_vendor_idx ON contracts(vendor_id);
CREATE INDEX IF NOT EXISTS contracts_parent_idx ON contracts(parent_contract_id);
CREATE INDEX IF NOT EXISTS contracts_project_status_idx ON contracts(project_id, status);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_id  TEXT REFERENCES contracts(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('deposit', 'progress', 'final', 'extra', 'refund')),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  amount       BIGINT NOT NULL DEFAULT 0,
  due_date     DATE,
  paid_at      TIMESTAMPTZ,
  memo         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_project_idx ON payments(project_id);
CREATE INDEX IF NOT EXISTS payments_contract_idx ON payments(contract_id);
CREATE INDEX IF NOT EXISTS payments_project_status_idx ON payments(project_id, status);

CREATE TABLE IF NOT EXISTS change_orders (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_id   TEXT REFERENCES contracts(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL DEFAULT 'other'
                  CHECK (reason IN ('site_change', 'additional_request', 'defect', 'other')),
  status        TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled')),
  title         TEXT NOT NULL,
  amount_delta  BIGINT NOT NULL DEFAULT 0,
  approved_at   TIMESTAMPTZ,
  memo          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS change_orders_project_idx ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS change_orders_contract_idx ON change_orders(contract_id);
CREATE INDEX IF NOT EXISTS change_orders_project_status_idx ON change_orders(project_id, status);

CREATE TABLE IF NOT EXISTS as_tickets (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contract_id          TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  phase_id             TEXT REFERENCES phases(id) ON DELETE SET NULL,
  line_item_id         TEXT REFERENCES line_items(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'received'
                         CHECK (status IN ('received', 'confirmed', 'in_progress', 'done', 'on_hold')),
  priority             TEXT NOT NULL DEFAULT 'normal'
                         CHECK (priority IN ('normal', 'urgent')),
  title                TEXT NOT NULL,
  content              TEXT,
  occurred_at          DATE,
  resolved_at          DATE,
  warranty_expires_at  DATE,
  memo                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS as_tickets_project_idx ON as_tickets(project_id);
CREATE INDEX IF NOT EXISTS as_tickets_contract_idx ON as_tickets(contract_id);
CREATE INDEX IF NOT EXISTS as_tickets_phase_idx ON as_tickets(phase_id);
CREATE INDEX IF NOT EXISTS as_tickets_line_item_idx ON as_tickets(line_item_id);
CREATE INDEX IF NOT EXISTS as_tickets_project_status_idx ON as_tickets(project_id, status);

CREATE TABLE IF NOT EXISTS attachments (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_type     TEXT NOT NULL
                   CHECK (owner_type IN ('project', 'vendor', 'phase', 'space', 'lineItem', 'quote', 'contract', 'payment', 'changeOrder', 'asTicket')),
  owner_id       TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'photo'
                   CHECK (kind IN ('photo', 'pdf', 'drawing', 'document', 'other')),
  photo_kind     TEXT CHECK (photo_kind IS NULL OR photo_kind IN ('before', 'during', 'after', 'reference', 'defect', 'floorplan', 'naver_floorplan', 'fixture')),
  filename       TEXT NOT NULL,
  content_type   TEXT,
  byte_size      BIGINT,
  blob_url       TEXT NOT NULL,
  blob_pathname  TEXT,
  caption        TEXT,
  taken_at       DATE,
  link_url       TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  uploaded_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attachments_project_idx ON attachments(project_id);
CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS attachments_owner_sort_idx ON attachments(owner_type, owner_id, sort_order);
CREATE INDEX IF NOT EXISTS attachments_uploaded_by_idx ON attachments(uploaded_by_id);

CREATE TABLE IF NOT EXISTS review_materials (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  source      TEXT,
  memo        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, sort_order),
  UNIQUE (project_id, url)
);
CREATE INDEX IF NOT EXISTS review_materials_project_idx ON review_materials(project_id);

-- 세션 스토어 (connect-pg-simple).
CREATE TABLE IF NOT EXISTS "session" (
  sid    TEXT NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON "session" (expire);

-- 감사 로그. 라우트가 lib/audit.ts 의 audit() 으로 INSERT.
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  diff          JSONB,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action, created_at DESC);

-- 마이그레이션 추적 테이블 (backend/src/scripts/migrate.ts 가 사용).
-- schema.sql 만 적용한 새 환경에서도 마이그레이션 러너가 같은 테이블을 기대하므로 명시.
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 자주 필터링되는 컬럼 단일 인덱스 (013_query_indexes.sql)
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes(status);
CREATE INDEX IF NOT EXISTS payments_due_date_idx ON payments(due_date);
CREATE INDEX IF NOT EXISTS as_tickets_warranty_expires_idx ON as_tickets(warranty_expires_at);
CREATE INDEX IF NOT EXISTS attachments_photo_kind_idx
  ON attachments(photo_kind) WHERE photo_kind IS NOT NULL;

-- 무결성 보강 (012_integrity_indexes.sql)
-- line_item 당 contracted 견적은 1개만 허용.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_one_contracted_per_line
  ON quotes (line_item_id)
  WHERE status = 'contracted';

-- attachments 정렬 충돌 방지. (owner_type, owner_id, kind) 단위로 sort_order 유일.
-- DEFERRABLE 로 reorder 의 단일 UPDATE 중간 상태 허용.
ALTER TABLE attachments
  ADD CONSTRAINT attachments_owner_sort_unique
  UNIQUE (owner_type, owner_id, kind, sort_order)
  DEFERRABLE INITIALLY DEFERRED;

-- 같은 사용자가 같은 이름 업체 두 개 못 만들게.
ALTER TABLE vendors
  ADD CONSTRAINT vendors_owner_name_unique UNIQUE (owner_id, name);

-- users.email 케이스 무관 UNIQUE (Foo@x.com 과 foo@x.com 중복 차단).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users ((LOWER(email)));
