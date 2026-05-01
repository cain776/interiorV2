import { defineConfig } from "vitest/config";

// 통합 테스트 전용 설정. 정적 가드레일은 node:test (npm test) 가 담당.
//
// 환경변수 흐름: vitest 는 vite 기반이라 envDir 의 .env.{mode} 를 자동 로드한다.
// mode 기본값은 'test' 이므로 ../.env.test 가 process.env 에 주입된다.
//
// 실행 전 필요한 것:
//   1) 별도 테스트 DB (예: createdb interior_test)
//   2) <repo>/.env.test 작성 — DATABASE_URL 에 'test' 키워드 필수
//   3) npm run migrate:test 로 schema 적용
export default defineConfig({
  envDir: "../",
  test: {
    include: ["src/tests/integration/**/*.test.ts"],
    // helpers/setup.ts 가 lib/env 보다 먼저 env 가드를 실행해 친절한 에러를 띄운다.
    setupFiles: ["./src/tests/integration/helpers/setup.ts"],
    // 같은 DB 를 공유하므로 동시 실행 금지 — file 별 순차.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 15_000,
  },
});
