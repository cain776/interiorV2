-- 업체 운영 필드: 목록 순서 + 사용 여부.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS vendors_owner_sort_idx ON vendors(owner_id, sort_order);
