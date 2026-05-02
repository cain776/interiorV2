// E2E 테스트 DB helper.
// backend/src/tests/integration/helpers/db.ts 와 같은 정신 — 'test' 키워드 가드 + 명시적 TRUNCATE.
// 통합 테스트와 같은 DB(interior_test) 를 공유하지만 직렬 실행을 강제해 충돌 회피.

import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** repo root 의 .env.test 에서 DATABASE_URL 추출. dotenv 의존성 없이. */
function loadDatabaseUrl(): string {
  const envPath = resolve(__dirname, "../../.env.test");
  let body: string;
  try {
    body = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(
      `.env.test 를 찾을 수 없습니다 (${envPath}). .env.test.example 을 복사해 작성하세요.`,
    );
  }
  const match = body.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m);
  if (!match) {
    throw new Error(".env.test 에 DATABASE_URL 항목이 없습니다.");
  }
  const url = match[1]!.trim();
  if (!url.toLowerCase().includes("test")) {
    throw new Error(
      `[E2E 가드 발동] DATABASE_URL 에 'test' 키워드가 없습니다: ${url.replace(/:[^@]*@/, ":***@")}`,
    );
  }
  return url;
}

const databaseUrl = loadDatabaseUrl();
const pool = new Pool({ connectionString: databaseUrl });

const TABLES = [
  "audit_logs",
  "attachments",
  "review_materials",
  "as_tickets",
  "change_orders",
  "payments",
  "contracts",
  "quotes",
  "line_items",
  "spaces",
  "phases",
  "vendors",
  "projects",
  "session",
  "users",
];

export async function resetDatabase(): Promise<void> {
  await pool.query(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export { pool, databaseUrl };
