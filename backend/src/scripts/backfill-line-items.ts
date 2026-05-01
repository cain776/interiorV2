/**
 * line_items.location_label / work_item_label / space_id 데이터 백필.
 *
 * 마이그레이션 008/009/010 의 UPDATE 부분을 분리한 운영용 일회성 스크립트.
 * 마이그레이션 폴더는 DDL 만 담당하도록 정책을 정리하면서 데이터 분류는 여기로 이동.
 *
 * 사용:
 *   npm run backfill:line-items           # 적용
 *   npm run backfill:line-items -- --dry  # 영향 row 수만 출력, UPDATE 안 함
 *
 * 안전 가드:
 *   - 운영 DB 보호: NODE_ENV=production 환경에서는 명시적 --confirm 플래그 필요.
 *   - 모든 UPDATE 는 단일 트랜잭션으로 실행, 실패 시 ROLLBACK.
 *   - 010 백필은 한국어 공간명 (예: 발코니_주방, 안방) 에 의존. 다른 워크스페이스는 0건 영향.
 */
import { env } from "../lib/env.js";
import { pool, shutdownDb } from "../lib/db.js";
import type { PoolClient } from "pg";

const args = new Set(process.argv.slice(2));
const isDry = args.has("--dry");
const isConfirmed = args.has("--confirm");

function assertSafe(): void {
  if (env.NODE_ENV === "production" && !isConfirmed) {
    throw new Error(
      [
        "[backfill 가드 발동] production 환경에서는 --confirm 플래그가 필요합니다.",
        "  사용법: npm run backfill:line-items -- --confirm",
        "  영향 확인을 먼저 하려면 --dry 와 함께.",
      ].join("\n"),
    );
  }
}

const STEP_008_LOCATION = `
  UPDATE line_items
     SET location_label = COALESCE(
           location_label,
           CASE
             WHEN label ILIKE '%벽/바닥%' THEN '벽/바닥'
             WHEN label ILIKE '%미드웨이%' OR label ILIKE '%벽 타일%' THEN '벽'
             WHEN label ILIKE '%바닥%' OR label ILIKE '%마루%' OR label ILIKE '%디딤석%' OR label ILIKE '%문턱%' OR label ILIKE '%타일%' OR label ILIKE '%데크%' THEN '바닥'
             WHEN label ILIKE '%천장%' OR label ILIKE '%커튼박스%' OR label ILIKE '%빨래건조대%' OR label ILIKE '%환풍기%' OR label ILIKE '%욕실등%' THEN '천장'
             WHEN label ILIKE '%창호%' OR label ILIKE '%창문%' OR label ILIKE '%방창%' OR label ILIKE '%방충망%' OR label ILIKE '%폴딩도어%' THEN '창호'
             WHEN label ILIKE '%벽%' OR label ILIKE '%도배%' OR label ILIKE '%필름%' OR label ILIKE '%도장%' OR label ILIKE '%탄성코트%' THEN '벽'
             WHEN label ILIKE '%수전%' OR label ILIKE '%배수%' OR label ILIKE '%급배수%' OR label ILIKE '%배관%' OR label ILIKE '%싱크%' OR label ILIKE '%트랩%' OR label ILIKE '%양변기%' OR label ILIKE '%세면대%' THEN '설비'
             WHEN label ILIKE '%콘센트%' OR label ILIKE '%스위치%' OR label ILIKE '%인터폰%' OR label ILIKE '%도어락%' OR label ILIKE '%센서등%' THEN '전기'
             WHEN label ILIKE '%중문%' OR label ILIKE '%방문%' OR label ILIKE '%문틀%' THEN '문'
             WHEN label ILIKE '%수납%' OR label ILIKE '%붙박이%' OR label ILIKE '%신발장%' OR label ILIKE '%상부장%' OR label ILIKE '%하부장%' OR label ILIKE '%키큰장%' OR label ILIKE '%옷장%' OR label ILIKE '%코트장%' OR label ILIKE '%팬트리%' OR label ILIKE '%거울장%' OR label ILIKE '%냉장고장%' OR label ILIKE '%파티션%' THEN '가구'
             ELSE NULL
           END
         ),
         work_item_label = COALESCE(
           work_item_label,
           CASE
             WHEN label ILIKE '%타일%' THEN '타일'
             WHEN label ILIKE '%마루%' THEN '마루'
             WHEN label ILIKE '%창호%' OR label ILIKE '%창문%' OR label ILIKE '%방창%' THEN '창호교체'
             WHEN label ILIKE '%방충망%' THEN '방충망'
             WHEN label ILIKE '%도배%' THEN '도배'
             WHEN label ILIKE '%필름%' THEN '필름'
             WHEN label ILIKE '%도장%' OR label ILIKE '%탄성코트%' THEN '도장'
             WHEN label ILIKE '%철거%' THEN '철거'
             WHEN label ILIKE '%콘센트%' OR label ILIKE '%스위치%' OR label ILIKE '%인터폰%' OR label ILIKE '%도어락%' THEN '전기'
             WHEN label ILIKE '%조명%' OR label ILIKE '%등%' THEN '조명'
             WHEN label ILIKE '%양변기%' OR label ILIKE '%세면대%' THEN '위생기구'
             WHEN label ILIKE '%배관%' THEN '배관'
             WHEN label ILIKE '%수전%' OR label ILIKE '%배수%' OR label ILIKE '%급배수%' OR label ILIKE '%트랩%' THEN '급배수'
             WHEN label ILIKE '%빨래건조대%' THEN '빨래건조대'
             WHEN label ILIKE '%중문%' THEN '중문'
             WHEN label ILIKE '%문틀%' OR label ILIKE '%방문%' THEN '문/문틀'
             WHEN label ILIKE '%수납%' OR label ILIKE '%붙박이%' OR label ILIKE '%신발장%' OR label ILIKE '%상부장%' OR label ILIKE '%하부장%' OR label ILIKE '%키큰장%' OR label ILIKE '%옷장%' OR label ILIKE '%코트장%' OR label ILIKE '%팬트리%' OR label ILIKE '%거울장%' OR label ILIKE '%냉장고장%' THEN '수납/가구'
             WHEN label ILIKE '%천장%' THEN '천장'
             WHEN label ILIKE '%파티션%' THEN '파티션'
             ELSE NULL
           END
         )
   WHERE location_label IS NULL
      OR work_item_label IS NULL
`;

const STEP_009_REFINEMENT = `
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
   ])
`;

const STEP_010_SPACES: Array<{ name: string; conditions: string[] }> = [
  {
    name: "발코니_주방",
    conditions: [
      "label ILIKE '%다용도실%'",
      "label ILIKE '%보일러%'",
      "label ILIKE '%세탁기/건조기%'",
    ],
  },
  {
    name: "안방",
    conditions: ["label ILIKE '%드레스룸%'", "label = '시스템 옷장 (3면)'"],
  },
];

function dryCountSql(sql: string): string | null {
  const match = sql.match(/^\s*UPDATE\s+(\w+)\s+SET[\s\S]*?\bWHERE\b/i);
  if (!match) return null;
  return sql.replace(/^\s*UPDATE\s+(\w+)\s+SET[\s\S]*?\bWHERE\b/i, `SELECT COUNT(*) AS n FROM ${match[1]} WHERE`);
}

async function runOnce(
  client: PoolClient,
  label: string,
  sql: string,
  params: unknown[] = [],
  drySql?: string,
): Promise<number> {
  if (isDry) {
    // EXPLAIN ANALYZE 대신 단순 row count 추정 — preview 만.
    const probe = drySql ?? dryCountSql(sql);
    if (!probe) {
      console.log(`  [dry] ${label}: 추정 불가 (UPDATE-WHERE 패턴 아님)`);
      return 0;
    }
    const result = await client.query<{ n: string }>(probe, params);
    const n = Number(result.rows[0]?.n ?? 0);
    console.log(`  [dry] ${label}: ${n} 건 영향 예상`);
    return n;
  }
  const result = await client.query(sql, params);
  console.log(`  ${label}: ${result.rowCount ?? 0} 건 업데이트`);
  return result.rowCount ?? 0;
}

async function main(): Promise<void> {
  assertSafe();
  console.log(`backfill-line-items 시작 (${isDry ? "DRY RUN" : "LIVE"}, NODE_ENV=${env.NODE_ENV})`);

  const client = await pool.connect();
  try {
    if (!isDry) await client.query("BEGIN");

    await runOnce(client, "008 라벨 → location/work_item 자동 분류", STEP_008_LOCATION);
    await runOnce(client, "009 라벨 보정", STEP_009_REFINEMENT);

    for (const { name, conditions } of STEP_010_SPACES) {
      const sql = `
        UPDATE line_items
           SET space_id = (SELECT id FROM spaces WHERE name = $1 LIMIT 1)
         WHERE space_id IS NULL
           AND (${conditions.join(" OR ")})
           AND EXISTS (SELECT 1 FROM spaces WHERE name = $1)
      `;
      const countSql = `
        SELECT COUNT(*) AS n
          FROM line_items
         WHERE space_id IS NULL
           AND (${conditions.join(" OR ")})
           AND EXISTS (SELECT 1 FROM spaces WHERE name = $1)
      `;
      await runOnce(client, `010 space_id 백필 (${name})`, sql, [name], countSql);
    }

    if (!isDry) await client.query("COMMIT");
    console.log("✓ 완료");
  } catch (err) {
    if (!isDry) await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error("backfill 실패:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void shutdownDb();
  });
