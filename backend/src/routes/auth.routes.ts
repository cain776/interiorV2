import type { FastifyInstance } from "fastify";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { createUser, findUserByEmail, findUserById } from "../repos/users.repo.js";
import type { PublicUser } from "../types/domain.js";

function publicUser(u: { id: string; email: string; name: string }): PublicUser {
  return { id: u.id, email: u.email, name: u.name };
}

// brute-force 보호. signup/login 에만 적용 (다른 라우트는 글로벌 OFF).
const authRateLimitConfig = {
  rateLimit: {
    max: 10,
    timeWindow: "10 minutes",
  },
};

const signupSchema = {
  body: {
    type: "object",
    required: ["email", "password", "name"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email", maxLength: 200 },
      password: { type: "string", minLength: 8, maxLength: 200 },
      name: { type: "string", minLength: 1, maxLength: 100 },
    },
  },
} as const;

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string", minLength: 1, maxLength: 200 },
      password: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
} as const;

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { email: string; password: string; name: string } }>(
    "/api/auth/signup",
    { schema: signupSchema, config: authRateLimitConfig },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const password = req.body.password;
      const name = req.body.name.trim();

      if (!name) {
        return reply.code(400).send({
          ok: false,
          error: "입력값을 확인하세요.",
          fieldErrors: { name: "필수" },
        });
      }

      const existing = await findUserByEmail(email);
      if (existing) {
        return reply.code(400).send({
          ok: false,
          error: "이미 가입된 이메일입니다.",
          fieldErrors: { email: "이미 가입된 이메일입니다." },
        });
      }

      const passwordHash = await hashPassword(password);
      const user = await createUser({ email, name, passwordHash });
      // Session fixation 방지 — 익명 세션 ID 를 폐기하고 새 ID 발급 후 인증 정보 부착.
      // 공격자가 미리 심어둔 session id 가 인증된 상태로 승격되는 경로를 차단.
      await req.session.regenerate();
      req.session.userId = user.id;
      await audit(req, "signup", "user", user.id);
      return { ok: true, data: publicUser(user) };
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    "/api/auth/login",
    { schema: loginSchema, config: authRateLimitConfig },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const password = req.body.password;

      const user = await findUserByEmail(email);
      if (!user) {
        // credential stuffing 탐지용 — 존재하지 않는 이메일도 기록 (응답 메시지는 동일하게 유지).
        await audit(req, "login.fail", "user", null, { email, reason: "no_user" });
        return reply.code(400).send({ ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." });
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        await audit(req, "login.fail", "user", user.id, { email, reason: "bad_password" });
        return reply.code(400).send({ ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." });
      }
      // Session fixation 방지 (signup 과 동일 이유).
      await req.session.regenerate();
      req.session.userId = user.id;
      await audit(req, "login.success", "user", user.id);
      return { ok: true, data: publicUser(user) };
    },
  );

  // logout / me 는 의도적으로 rate-limit 미적용:
  //   - logout: 사용자가 한 번 누르고 끝. 폭주 시나리오 없음.
  //   - me: 프론트가 로그인 상태 확인용으로 자주 폴링 (앱 진입, 탭 복귀 등).
  //         rate-limit 걸면 정상 사용도 막힐 수 있음. 인증 검증만 하므로 부하 적음.
  app.post("/api/auth/logout", async (req, reply) => {
    if (!req.session.userId) {
      return reply.code(401).send({ ok: false, error: "로그인이 필요합니다." });
    }
    const userId = req.session.userId;
    // destroy 전에 audit — 그 후엔 session.userId 가 사라져 actor 가 NULL 로 기록됨.
    await audit(req, "logout", "user", userId);
    await req.session.destroy();
    return { ok: true, data: { ok: true } };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const id = req.session.userId;
    if (!id) {
      return reply.code(401).send({ ok: false, error: "로그인이 필요합니다." });
    }
    const user = await findUserById(id);
    if (!user) {
      await req.session.destroy();
      return reply.code(401).send({ ok: false, error: "로그인이 필요합니다." });
    }
    return { ok: true, data: publicUser(user) };
  });
}
