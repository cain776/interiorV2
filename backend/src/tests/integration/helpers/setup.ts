// vitest setupFiles — 모든 test 모듈 import 보다 먼저 실행.
// 목적: lib/env 의 required() 가 SESSION_SECRET 누락으로 throw 하기 전에
// 친절한 안내 메시지로 가로채고, 운영 DB 보호용 'test' 키워드 가드 실행.

const dbUrl = process.env.DATABASE_URL ?? "";
const hasSecret = !!process.env.SESSION_SECRET;

if (!dbUrl || !hasSecret) {
  throw new Error(
    [
      "[통합 테스트 환경 미설정] .env.test 가 로드되지 않았거나 필수 변수 누락.",
      `  DATABASE_URL=${dbUrl || "(unset)"}`,
      `  SESSION_SECRET=${hasSecret ? "(set)" : "(unset)"}`,
      "다음을 확인하세요:",
      "  1) <repo>/.env.test 파일 존재 (없으면 .env.test.example 복사)",
      "  2) DATABASE_URL 에 'test' 키워드 포함",
      "  3) 별도 테스트 DB 생성 후 npm run migrate:test 실행",
    ].join("\n"),
  );
}

if (!/test/i.test(dbUrl)) {
  throw new Error(
    `[테스트 안전장치] DATABASE_URL 에 'test' 가 포함되지 않습니다. 운영 DB 보호용.\n  현재값: ${dbUrl}`,
  );
}
