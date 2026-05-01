-- 워크스페이스 도메인: vendors, phases, spaces, line_items, quotes
-- projects 테이블에 누락 컬럼(주소/평형/일정/예산) 추가.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS address       TEXT,
  ADD COLUMN IF NOT EXISTS size_kr       NUMERIC,
  ADD COLUMN IF NOT EXISTS start_date    DATE,
  ADD COLUMN IF NOT EXISTS end_date      DATE,
  ADD COLUMN IF NOT EXISTS total_budget  BIGINT;

-- 업체
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
CREATE INDEX IF NOT EXISTS vendors_owner_name_idx ON vendors(owner_id, name);

-- 공정
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

-- 공간
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

-- 견적 항목 (selected_quote_id 는 quotes 생성 후 ALTER 로 추가 — 순환 FK 회피)
CREATE TABLE IF NOT EXISTS line_items (
  id                 TEXT PRIMARY KEY,
  phase_id           TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  space_id           TEXT REFERENCES spaces(id) ON DELETE SET NULL,
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

-- 견적
CREATE TABLE IF NOT EXISTS quotes (
  id            TEXT PRIMARY KEY,
  line_item_id  TEXT NOT NULL REFERENCES line_items(id) ON DELETE CASCADE,
  vendor_id     TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  mode          TEXT NOT NULL CHECK (mode IN ('turnkey', 'self')),
  price         BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT '후보' CHECK (status IN ('후보', '협상중', '계약', '취소')),
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  memo          TEXT,
  selected_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quotes_line_item_idx ON quotes(line_item_id);
CREATE INDEX IF NOT EXISTS quotes_vendor_idx ON quotes(vendor_id);

ALTER TABLE line_items
  ADD CONSTRAINT line_items_selected_quote_fk
  FOREIGN KEY (selected_quote_id) REFERENCES quotes(id) ON DELETE SET NULL;
