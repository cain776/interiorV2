function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const NODE_ENV = optional("NODE_ENV", "development");
const SESSION_SECRET = required("SESSION_SECRET");

// 프로덕션에서 dev 기본값 그대로 배포되는 사고 방지.
// .env.example / 시드 시 사용한 placeholder 패턴을 명시적으로 차단.
if (
  NODE_ENV === "production" &&
  (SESSION_SECRET.startsWith("dev-only") ||
    SESSION_SECRET.startsWith("replace-with") ||
    SESSION_SECRET.length < 32)
) {
  throw new Error(
    "SESSION_SECRET 이 dev 기본값이거나 32자 미만입니다. production 배포 전 안전한 비밀로 교체하세요.",
  );
}

// production 에서는 .env 의 COOKIE_SECURE 값과 무관하게 항상 secure cookie 강제.
// 잊고 false 로 둔 채 배포되어 평문 쿠키가 흘러나가는 사고 방지.
// dev/test 는 http://localhost 라 secure 면 쿠키가 아예 안 붙으므로 false 가 기본.
const COOKIE_SECURE =
  NODE_ENV === "production" ? true : optional("COOKIE_SECURE", "false") === "true";
const TRUST_PROXY = optional("TRUST_PROXY", "false") === "true";

export const env = {
  NODE_ENV,
  PORT: Number(optional("PORT", "3001")),
  HOST: optional("HOST", "127.0.0.1"),
  DATABASE_URL: required("DATABASE_URL"),
  SESSION_SECRET,
  COOKIE_SECURE,
  TRUST_PROXY,
  STATIC_DIR: optional("STATIC_DIR", "../frontend/public"),
  UPLOADS_DIR: optional("UPLOADS_DIR", "../uploads"),
};
