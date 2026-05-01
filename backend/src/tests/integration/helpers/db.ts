// 통합 테스트 DB helper.
// 환경변수 가드는 helpers/setup.ts 가 처리 (vitest setupFiles 로 먼저 실행).
// 이 파일은 단순히 lib/db 의 pool 을 가져와 truncate/close API 만 제공.

import { pool } from "../../../lib/db.js";

// FK CASCADE 가 묶어주지만 명시적으로 모든 도메인 테이블 + session + audit 까지 정리.
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

export { pool };
