import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 설정 — 인테리어-v2 E2E 스모크.
 *
 * 정책:
 * - 테스트 DB 는 .env.test 의 DATABASE_URL ('test' 키워드 필수, 운영 DB 보호 가드).
 * - globalSetup 에서 backend/src/scripts/migrate.ts 한 번 실행 → 스키마 보장.
 * - 각 테스트는 spec.ts 안에서 beforeEach 로 truncate → signup → login 순서.
 * - webServer: backend 가 정적 파일도 같이 서빙하므로 backend 1개만 띄우면 풀스택.
 *
 * 운영 DB 격리:
 * - migrate:test 와 helpers/db.ts 의 가드가 'test' 키워드 강제 (이중 안전망).
 *
 * 로컬 수동 실행:
 *   cd e2e && npm install
 *   npx playwright install chromium
 *   npm test
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // DB 공유 → 직렬 실행
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3001",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./helpers/global-setup.ts",
  webServer: {
    // backend 의 dev 서버를 .env.test 로 부팅 — DB / 세션 시크릿 / TRUST_PROXY 모두 테스트값.
    // tsx watch 가 file lock 문제를 일으킬 수 있어 일반 tsx (no watch) 로 실행.
    command:
      "cd ../backend && npx tsx --env-file=../.env.test src/server.ts",
    url: "http://127.0.0.1:3001/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
