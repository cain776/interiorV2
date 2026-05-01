-- 사진 패널 내 수동 정렬 순서.

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, owner_type, owner_id, kind
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM attachments
)
UPDATE attachments a
   SET sort_order = ranked.rn
  FROM ranked
 WHERE a.id = ranked.id
   AND a.sort_order = 0;

CREATE INDEX IF NOT EXISTS attachments_owner_sort_idx
  ON attachments(owner_type, owner_id, sort_order);
