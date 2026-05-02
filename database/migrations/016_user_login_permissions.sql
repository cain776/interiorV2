-- 사용자 관리 최소 필드: 역할 + 로그인 허용 여부.
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
