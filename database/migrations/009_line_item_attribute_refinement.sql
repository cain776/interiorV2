-- 008에서 자동 추론이 약했던 창호/설비/주방가전/방수/마감 항목 보정.
-- 위치/항목은 공간관리의 SKU 역할을 하므로 빈 값을 줄이고 검색/사진 필터 기준을 안정화한다.
--
-- ※ 운영 일회성 데이터 백필. 새로 만든 환경에서는 line_items 가 비어 있어 0건 영향.
--    schema_migrations 가 재실행을 막아 운영 DB 도 부수효과 없음.
--    동일 분류 작업이 다시 필요하면 backend/src/scripts/backfill-line-items.ts 사용.
UPDATE line_items
   SET location_label = CASE
         WHEN label ILIKE '%전체 철거%' THEN '공통'
         WHEN label ILIKE '%픽스 고정창%' THEN '창호'
         WHEN label ILIKE '%다용도실창%' OR label ILIKE '%발코니창%' OR label ILIKE '%내창%' OR label ILIKE '%분합문%' THEN '창호'
         WHEN label ILIKE '%터닝도어%' THEN '문'
         WHEN label ILIKE '%디딤석%' OR label ILIKE '%문턱%' OR label ILIKE '%단차%' THEN '바닥'
         WHEN label ILIKE '%방수%' THEN '벽/바닥'
         WHEN label ILIKE '%식탁등%' OR label ILIKE '%매립등%' THEN '천장'
         WHEN label ILIKE '%보일러%' OR label ILIKE '%세탁기 라인%' OR label ILIKE '%세탁기/건조기%' OR label ILIKE '%수도 라인%' OR label ILIKE '%가스 라인%' OR label ILIKE '%배기 덕트%' THEN '설비'
         WHEN label ILIKE '%식기세척기%' OR label ILIKE '%싱크볼%' THEN '설비'
         WHEN label ILIKE '%인덕션%' THEN '전기'
         WHEN label ILIKE '%아일랜드 식탁%' OR label ILIKE '%싱크 상판%' OR label ILIKE '%오븐%' OR label ILIKE '%전자레인지%' THEN '가구'
         WHEN label ILIKE '%후드 (벽부형)%' THEN '벽'
         WHEN label ILIKE '%후드%' THEN '설비'
         ELSE location_label
       END,
       work_item_label = CASE
         WHEN label ILIKE '%전체 철거%' THEN '철거'
         WHEN label ILIKE '%픽스 고정창%' THEN '고정창'
         WHEN label ILIKE '%분합문%' THEN '분합문'
         WHEN label ILIKE '%터닝도어%' THEN '터닝도어'
         WHEN label ILIKE '%다용도실창%' OR label ILIKE '%발코니창%' OR label ILIKE '%내창%' THEN '창호교체'
         WHEN label ILIKE '%디딤석%' OR label ILIKE '%문턱%' THEN '마감'
         WHEN label ILIKE '%단차%' THEN '단차마감'
         WHEN label ILIKE '%방수/타일%' THEN '방수/타일'
         WHEN label ILIKE '%방수%' THEN '방수'
         WHEN label ILIKE '%보일러%' OR label ILIKE '%세탁기 라인%' THEN '보일러/세탁라인'
         WHEN label ILIKE '%세탁기/건조기%' THEN '가전'
         WHEN label ILIKE '%수도 라인%' THEN '급배수'
         WHEN label ILIKE '%가스 라인%' THEN '가스라인'
         WHEN label ILIKE '%배기 덕트%' THEN '후드/덕트'
         WHEN label ILIKE '%아일랜드 식탁%' THEN '식탁'
         WHEN label ILIKE '%싱크 상판%' THEN '상판'
         WHEN label ILIKE '%싱크볼%' THEN '싱크볼'
         WHEN label ILIKE '%식기세척기%' THEN '식기세척기'
         WHEN label ILIKE '%인덕션%' THEN '가전'
         WHEN label ILIKE '%후드 (벽부형)%' THEN '후드'
         WHEN label ILIKE '%오븐%' OR label ILIKE '%전자레인지%' THEN '가전'
         WHEN label ILIKE '%식탁등%' OR label ILIKE '%매립등%' THEN '조명'
         ELSE work_item_label
       END
 WHERE label ILIKE ANY (ARRAY[
   '%전체 철거%', '%픽스 고정창%', '%다용도실창%', '%발코니창%', '%내창%', '%분합문%',
   '%터닝도어%', '%디딤석%', '%문턱%', '%단차%', '%방수%', '%식탁등%', '%매립등%',
   '%보일러%', '%세탁기 라인%', '%세탁기/건조기%', '%수도 라인%', '%가스 라인%',
   '%배기 덕트%', '%아일랜드 식탁%', '%싱크 상판%', '%싱크볼%', '%식기세척기%',
   '%인덕션%', '%후드%', '%오븐%', '%전자레인지%'
 ]);
