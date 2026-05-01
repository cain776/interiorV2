/**
 * 마이그레이션 러너. database/migrations/*.sql 을 사전순으로 적용,
 * 적용된 파일은 schema_migrations 테이블에 기록해 재실행 방지.
 *
 * 사용: npm run migrate
 *      npm run migrate:test  (DATABASE_URL 에 'test' 키워드 필수)
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../lib/env.js";
import { pool, shutdownDb } from "../lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../../../database/migrations");

/**
 * 운영 DB 보호 가드.
 * - migrate:test 는 .env.test 가 누락/오타면 dev/prod DATABASE_URL 로 떨어질 수 있다.
 * - 실수로 운영 DB 를 마이그레이션 / 테스트 데이터로 오염시키지 않도록 환경 명세 강제.
 */
function assertSafeTarget(): void {
  const url = env.DATABASE_URL;
  // password 가 url 에 들어있을 수 있어 host/db 만 추출해 노출.
  let safeUrl = url;
  try {
    const u = new URL(url);
    safeUrl = `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname}`;
  } catch {
    // URL 파싱 실패 시 raw 그대로 (이미 비정상)
  }

  if (env.NODE_ENV === "test" && !url.toLowerCase().includes("test")) {
    throw new Error(
      [
        "[migrate:test 가드 발동] DATABASE_URL 에 'test' 키워드가 없습니다.",
        `  현재 NODE_ENV=${env.NODE_ENV}`,
        `  현재 DATABASE_URL=${safeUrl}`,
        "원인 후보:",
        "  1) backend/ 가 아닌 다른 디렉토리에서 실행 (--env-file=../.env.test 가 못 찾음)",
        "  2) <repo>/.env.test 파일 미존재 (없으면 .env.test.example 복사해 작성)",
        "  3) .env.test 의 DATABASE_URL 에 'test' 가 빠짐 (예: interior_test, test_db)",
      ].join("\n"),
    );
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    `SELECT filename FROM schema_migrations`,
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function applyOne(filename: string): Promise<void> {
  const path = resolve(MIGRATIONS_DIR, filename);
  const sql = await readFile(path, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)`,
      [filename],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  assertSafeTarget();
  await ensureMigrationsTable();
  const applied = await appliedFilenames();
  const files = await listMigrationFiles();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("✓ 적용할 마이그레이션 없음. 최신 상태.");
    return;
  }

  console.log(`적용 대기: ${pending.length}개`);
  for (const filename of pending) {
    process.stdout.write(`  ${filename} ... `);
    try {
      await applyOne(filename);
      console.log("✓");
    } catch (err) {
      console.log("✗");
      throw err;
    }
  }
  console.log("\n✓ 모든 마이그레이션 적용 완료.");
}

main()
  .catch((err) => {
    console.error("마이그레이션 실패:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void shutdownDb();
  });
