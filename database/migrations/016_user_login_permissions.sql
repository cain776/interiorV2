-- 사용자 관리 최소 필드: 역할 + 로그인 허용 여부.
--
-- ※ 정책 예외: 마이그레이션은 DDL 만 두는 게 원칙이지만 (architecture.md "마이그레이션 정책")
--    이 파일은 운영 잠금 방지용 일회성 DML(UPDATE) 을 함께 포함한다.
--    - 신규 컬럼 도입 시 기존 1명 사용자를 admin 으로 승격하지 않으면 admin 부재로 settings 진입 불가.
--    - 새 환경에는 row 가 없어 0건 영향. 운영은 schema_migrations 가 재실행 차단.
--    동일 분류 작업이 재발하면 backend/src/scripts/backfill-*.ts 로 분리할 것.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_login BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_role_check'
       AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member'));
  END IF;
END $$;

-- 기존 단일 사용자 환경은 관리자가 잠기지 않도록 승격한다.
UPDATE users
   SET role = 'admin',
       can_login = TRUE,
       updated_at = NOW()
 WHERE role = 'member';

CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
