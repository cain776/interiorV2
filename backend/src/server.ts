import Fastify from "fastify";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import staticPlugin from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import connectPgSimple from "connect-pg-simple";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { env } from "./lib/env.js";
import { pool, shutdownDb } from "./lib/db.js";
import { schemaToFieldErrors } from "./lib/schema.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import projectsRoutes from "./routes/projects.routes.js";
import vendorsRoutes from "./routes/vendors.routes.js";
import phasesRoutes from "./routes/phases.routes.js";
import spacesRoutes from "./routes/spaces.routes.js";
import lineItemsRoutes from "./routes/line-items.routes.js";
import quotesRoutes from "./routes/quotes.routes.js";
import contractsRoutes from "./routes/contracts.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import changeOrdersRoutes from "./routes/change-orders.routes.js";
import asTicketsRoutes from "./routes/as-tickets.routes.js";
import attachmentsRoutes from "./routes/attachments.routes.js";
import reviewMaterialsRoutes from "./routes/review-materials.routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

async function build() {
  // bodyLimit: attachment.blobUrl 5MB + 다른 필드 + JSON/HTTP 헤더 오버헤드.
  // 6MB 면 빠듯해 파일 풀로 채우면 거부될 수 있어 8MB 로 여유. DoS 차단은 그대로 유효.
  const app = Fastify({
    logger: { level: "info" },
    bodyLimit: 8 * 1024 * 1024,
  });

  await app.register(cookie);

  // 보안 헤더 — clickjacking, MIME sniffing, mixed content, HSTS 등 일괄 적용.
  // CSP 는 frontend 의 inline style/script 와 충돌 가능 → 점진 도입을 위해 일단 비활성.
  // HSTS 는 dev 에서 끔 — localhost http 로 한 번 페이지 받으면 브라우저가 HSTS 캐시해
  // 이후 강제 https 로 가서 dev 가 모두 막힌다 (max-age 31536000 기본값).
  const isProd = env.NODE_ENV === "production";
  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  // CSRF 추가 보호: mutation 요청 (POST/PATCH/DELETE) 에 Origin 헤더가 있으면 host 일치 확인.
  // SameSite=lax 가 cross-site 요청 대부분을 막지만, 한 단계 더 명시적으로.
  // Origin 이 없는 경우 (curl, postman, 일부 same-origin GET) 는 통과 — 실용성 유지.
  //
  // reverse proxy 뒤 (e.g. nginx, cloudflare) 에서는 req.headers.host 가 내부 호스트(예: localhost)
  // 라 false-positive 발생. TRUST_PROXY=true 일 때만 X-Forwarded-Host 를 신뢰한다.
  app.addHook("preHandler", async (req, reply) => {
    if (!["POST", "PATCH", "DELETE"].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    const forwardedHost = req.headers["x-forwarded-host"];
    const expectedHost =
      env.TRUST_PROXY && typeof forwardedHost === "string" && forwardedHost.length > 0
        ? forwardedHost.split(",")[0]!.trim() // 멀티 hop 시 가장 바깥 host
        : req.headers.host;
    try {
      if (new URL(origin).host !== expectedHost) {
        return reply.code(403).send({ ok: false, error: "Origin mismatch" });
      }
    } catch {
      return reply.code(403).send({ ok: false, error: "Invalid Origin" });
    }
  });

  // 글로벌 비활성, 라우트별 활성화 (auth/login, signup 등). single-user 단계 기준.
  await app.register(rateLimit, {
    global: false,
    max: 10,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, ctx) => ({
      ok: false,
      error: `요청이 너무 많습니다. ${Math.ceil(ctx.ttl / 1000)}초 후 다시 시도해 주세요.`,
    }),
  });

  // PostgreSQL 영속 세션 — 서버 재시작에도 로그인 유지.
  // connect-pg-simple 은 express-session 호환이라 @fastify/session 의 store 에 그대로 연결.
  const PgStore = connectPgSimple(session as never);
  const sessionStore = new PgStore({
    pool,
    tableName: "session",
    // 만료 세션 정리 주기 (분). 기본 15분이면 충분.
    pruneSessionInterval: 15 * 60,
  });

  await app.register(session, {
    secret: env.SESSION_SECRET,
    store: sessionStore as never,
    // 익명 세션을 PG 에 저장하지 않음 — login 으로 userId 가 채워진 다음에만 영속.
    // 빈 세션을 매 요청마다 저장하면 비동기 PG save 콜백이 응답 flush 후 Set-Cookie 헤더를
    // 쓰려다 ERR_HTTP_HEADERS_SENT 로 크래시한다 (실제 발견됨).
    saveUninitialized: false,
    cookie: {
      secure: env.COOKIE_SECURE,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  });

  // 사진/첨부 업로드 정책: 현재는 프론트가 base64 data URL 로 직렬화해 JSON 으로 전송 →
  // attachments.blob_url 컬럼에 그대로 저장. 5MB 제한 (attachments.routes.ts).
  // 추후 디스크/S3 로 옮기면 @fastify/multipart 등록 + 별도 업로드 라우트로 전환.

  // schema 검증 실패 → ApiError 형식 통일. 기본은 400 으로 떨어진다.
  app.setErrorHandler((err: unknown, req, reply) => {
    if (reply.sent) return;
    const e = err as {
      statusCode?: number;
      message?: string;
      validation?: Array<{
        instancePath?: string;
        params?: Record<string, unknown>;
        message?: string;
      }>;
    };
    if (e.validation) {
      const fieldErrors = schemaToFieldErrors(e.validation);
      reply.code(400).send({
        ok: false,
        error: "입력값을 확인하세요.",
        fieldErrors,
      });
      return;
    }
    req.log.error({ err }, "request failed");
    const status = e.statusCode;
    const code = typeof status === "number" && status >= 400 && status < 600 ? status : 500;
    // 5xx 는 메시지 마스킹 — pg 가 던지는 "duplicate key value violates unique constraint
    // \"users_email_lower_idx\"" 같은 내부 구조가 클라이언트에 노출되면 스키마 정찰에 도움이 된다.
    // 4xx 는 라우트가 의도해서 던진 사용자용 메시지라 그대로 노출 OK.
    const userMessage = code >= 500 ? "Internal Server Error" : (e.message || "오류가 발생했습니다.");
    reply.code(code).send({
      ok: false,
      error: userMessage,
    });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(projectsRoutes);
  await app.register(vendorsRoutes);
  await app.register(phasesRoutes);
  await app.register(spacesRoutes);
  await app.register(lineItemsRoutes);
  await app.register(quotesRoutes);
  await app.register(contractsRoutes);
  await app.register(paymentsRoutes);
  await app.register(changeOrdersRoutes);
  await app.register(asTicketsRoutes);
  await app.register(attachmentsRoutes);
  await app.register(reviewMaterialsRoutes);

  await app.register(staticPlugin, {
    root: resolve(projectRoot, "frontend/public"),
    prefix: "/",
  });

  await app.register(staticPlugin, {
    root: resolve(projectRoot, "uploads"),
    prefix: "/uploads/",
    decorateReply: false,
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) {
      reply.code(404).send({ ok: false, error: "Not Found" });
      return;
    }
    reply.sendFile("index.html");
  });

  return app;
}

const app = await build();

const close = async () => {
  await app.close();
  await shutdownDb();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
