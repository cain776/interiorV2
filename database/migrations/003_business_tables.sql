-- V1 업무 도메인 포팅: 계약, 결제, 변경오더, AS, 첨부, 검토자료.

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
  uploaded_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attachments_project_idx ON attachments(project_id);
CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments(owner_type, owner_id);
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
