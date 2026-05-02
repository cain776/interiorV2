-- 사용자 권한을 관리자 / 일반(고객) / 업체 3종으로 정리.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'customer';

UPDATE users
   SET role = 'customer',
       updated_at = NOW()
 WHERE role = 'member';

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'customer', 'vendor'));
