-- 중복 인덱스 정리:
-- 012 에서 vendors_owner_name_unique UNIQUE 제약을 추가했고
-- UNIQUE 제약은 자동으로 인덱스를 생성하므로 002 의 vendors_owner_name_idx 는 불필요.
-- 두 개를 동시에 유지하면 INSERT/UPDATE 마다 두 인덱스 모두 갱신해 쓸데없는 비용.

DROP INDEX IF EXISTS vendors_owner_name_idx;
