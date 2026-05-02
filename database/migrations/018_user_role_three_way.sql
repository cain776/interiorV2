-- 사용자 권한을 관리자 / 일반(고객) / 업체 3종으로 정리.
--
-- ※ 정책 예외: 마이그레이션은 DDL 만 두는 게 원칙이지만, 016 의 'member' 도메인을 'customer' 로
--    재명명하는 일회성 DML 을 함께 포함한다. CHECK 제약 도메인 변경에 따른 정합성 보정.
--    새 환경에 'member' row 가 없어 영향 0. 향후 신규 마이그레이션은 DML 미포함 정책 유지.
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
