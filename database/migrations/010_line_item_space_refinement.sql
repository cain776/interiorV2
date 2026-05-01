-- 공간명이 라벨에 들어갔지만 space_id가 비어 있던 위치/항목 보정.
-- 별도 공간패널이 없는 다용도실은 주방 발코니, 드레스룸 계열은 안방으로 묶는다.
--
-- ※ 운영 일회성 데이터 백필 + 환경 종속 (한국어 공간명 하드코딩).
--    다른 워크스페이스에는 0건 영향. 동일 작업 재실행은 backend/src/scripts/backfill-line-items.ts.
UPDATE line_items
   SET space_id = (SELECT id FROM spaces WHERE name = '발코니_주방' LIMIT 1)
 WHERE space_id IS NULL
   AND (
     label ILIKE '%다용도실%'
     OR label ILIKE '%보일러%'
     OR label ILIKE '%세탁기/건조기%'
   )
   AND EXISTS (SELECT 1 FROM spaces WHERE name = '발코니_주방');

UPDATE line_items
   SET space_id = (SELECT id FROM spaces WHERE name = '안방' LIMIT 1)
 WHERE space_id IS NULL
   AND (
     label ILIKE '%드레스룸%'
     OR label = '시스템 옷장 (3면)'
   )
   AND EXISTS (SELECT 1 FROM spaces WHERE name = '안방');
