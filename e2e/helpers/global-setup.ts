// Playwright globalSetup — 테스트 시작 전 한 번만 실행.
// 1) backend/src/scripts/migrate.ts 로 .env.test 의 DB 에 최신 스키마 적용
// 2) 첫 truncate 로 깨끗한 상태 보장
// 3) pool 닫고 종료 — 각 spec.ts 가 자기 pool 로 다시 작업

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resetDatabase, closeDatabase } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

export default async function globalSetup(): Promise<void> {
  console.log("[e2e] migrate:test ...");
  execSync("npm run migrate:test", {
    cwd: resolve(repoRoot, "backend"),
    stdio: "inherit",
  });

  console.log("[e2e] truncate (clean slate) ...");
  await resetDatabase();
  await closeDatabase();
  console.log("[e2e] globalSetup 완료. webServer 부팅 대기.");
}
