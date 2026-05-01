-- 무결성 보강:
-- 1) 한 line_item 당 status='contracted' 인 quote 는 최대 1건이어야 한다 (선택 견적 1개 강제).
-- 2) 같은 owner 안에서 attachment.sort_order 는 중복 없이 단조 증가.
-- 3) 같은 owner 가 같은 이름의 vendor 를 두 개 만들지 못하게.
-- 4) users.email 은 케이스 무관 UNIQUE.

-- 1) 부분 UNIQUE: line_item 당 contracted 견적 1개
CREATE UNIQUE INDEX IF NOT EXISTS quotes_one_contracted_per_line
  ON quotes (line_item_id)
  WHERE status = 'contracted';

-- 2) attachments 정렬 충돌 방지
-- 단위는 (owner_type, owner_id, kind) — createAttachment 가 kind 별로 MAX(sort_order)+1 을 계산하기 때문.
-- DEFERRABLE INITIALLY DEFERRED: reorder 시 단일 UPDATE 안에서 같은 sort_order 가 일시적으로 두 row 에 존재할 수 있어
-- 트랜잭션 commit 시점까지 검사 미룸.

-- 안전 장치: 기존 sort_order=0 row 가 같은 (owner_type, owner_id, kind) 안에 여럿이면 UNIQUE 추가 시 실패.
-- 007 마이그레이션이 1부터 부여했지만 이후 들어온 row 가 0 일 수 있어 한 번 더 백필.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY owner_type, owner_id, kind
           ORDER BY sort_order ASC NULLS LAST, created_at ASC, id ASC
         ) AS rn
    FROM attachments
)
UPDATE attachments a
   SET sort_order = ranked.rn
  FROM ranked
 WHERE a.id = ranked.id
   AND a.sort_order <> ranked.rn;

ALTER TABLE attachments
  DROP CONSTRAINT IF EXISTS attachments_owner_sort_unique;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_owner_sort_unique
  UNIQUE (owner_type, owner_id, kind, sort_order)
  DEFERRABLE INITIALLY DEFERRED;

-- 3) vendors: 같은 사용자가 같은 이름 업체 중복 생성 방지
ALTER TABLE vendors
  DROP CONSTRAINT IF EXISTS vendors_owner_name_unique;
ALTER TABLE vendors
  ADD CONSTRAINT vendors_owner_name_unique UNIQUE (owner_id, name);

-- 4) users.email 케이스 무관 UNIQUE (citext 도입은 과하므로 LOWER 식 인덱스)
DROP INDEX IF EXISTS users_email_lower_idx;
CREATE UNIQUE INDEX users_email_lower_idx
  ON users ((LOWER(email)));
