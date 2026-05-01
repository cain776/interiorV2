-- 자주 필터링되는 컬럼에 단일 인덱스 추가.
-- 가족 공유 단계 (수십~수백 row) 에선 영향 미미하지만, 운영 데이터가 누적되면
-- 상태 필터 / 만료 임박 조회의 응답시간 차이가 커진다. 미리 깔아두면 회귀 없음.

-- 프로젝트 상태 필터 ("진행중만 보기", 대시보드 카드)
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);

-- 견적 상태 필터 ("contracted 만", "negotiating 만")
CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes(status);

-- 결제 연체 조회 (due_date < 오늘 + status='pending')
CREATE INDEX IF NOT EXISTS payments_due_date_idx ON payments(due_date);

-- AS 보증 만료 임박 조회 (warranty_expires_at < 30일 후)
CREATE INDEX IF NOT EXISTS as_tickets_warranty_expires_idx
  ON as_tickets(warranty_expires_at);

-- 첨부 종류별 갤러리 필터 (photo_kind = 'before' 등)
CREATE INDEX IF NOT EXISTS attachments_photo_kind_idx
  ON attachments(photo_kind)
  WHERE photo_kind IS NOT NULL;
