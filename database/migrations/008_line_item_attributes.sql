-- 위치/항목을 공간관리의 고유 작업 단위(SKU 유사)로 쓰기 위한 속성.
-- 예: 공간=현관, 공정=철거, location_label=바닥, work_item_label=타일.
--
-- ※ 데이터 백필 (label 기반 자동 분류) 은 backend/src/scripts/backfill-line-items.ts 로 분리.
--    마이그레이션은 DDL 만 담당해 새 환경/테스트 환경에 부수효과 없음.

ALTER TABLE line_items
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS work_item_label TEXT;

CREATE INDEX IF NOT EXISTS line_items_space_location_item_idx
  ON line_items(space_id, location_label, work_item_label);
