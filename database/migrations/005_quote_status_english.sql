-- quotes.status 한글 enum → 영문 enum 으로 통일.
-- 매핑: 후보 → candidate, 협상중 → negotiating, 계약 → contracted, 취소 → cancelled.

-- 1) check constraint 일시 제거 (기존 한글값을 일단 허용)
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

-- 2) 한글 → 영문 일괄 변환
UPDATE quotes SET status = 'candidate'   WHERE status = '후보';
UPDATE quotes SET status = 'negotiating' WHERE status = '협상중';
UPDATE quotes SET status = 'contracted'  WHERE status = '계약';
UPDATE quotes SET status = 'cancelled'   WHERE status = '취소';

-- 3) 기본값도 영문으로
ALTER TABLE quotes ALTER COLUMN status SET DEFAULT 'candidate';

-- 4) 새 check constraint 부착
ALTER TABLE quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('candidate', 'negotiating', 'contracted', 'cancelled'));
