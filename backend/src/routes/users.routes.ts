import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth, userId } from "../lib/auth.js";
import { hashPassword } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import {
  createUser,
  deleteUserGuardingLastLoginAdmin,
  findUserByEmail,
  findUserById,
  listUsers,
  updateUserGuardingLastLoginAdmin,
} from "../repos/users.repo.js";
import type { PublicUser, User, UserRole } from "../types/domain.js";

const ROLE_VALUES = ["admin", "customer", "vendor"] as const;

function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    canLogin: user.canLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const current = await findUserById(userId(req));
  if (!current || current.role !== "admin" || !current.canLogin) {
    reply.code(403).send({ ok: false, error: "관리자 권한이 필요합니다." });
    return reply;
  }
}

const userBodyProps = {
  email: { type: "string", format: "email", maxLength: 200 },
  name: { type: "string", minLength: 1, maxLength: 100 },
  password: { type: "string", minLength: 8, maxLength: 200 },
  role: { type: "string", enum: ROLE_VALUES },
  canLogin: { type: "boolean" },
} as const;

const createUserSchema = {
  body: {
    type: "object",
    required: ["email", "name", "password"],
    additionalProperties: false,
    properties: userBodyProps,
  },
} as const;

const updateUserSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    properties: userBodyProps,
  },
} as const;

interface UserBody {
  email?: string;
  name?: string;
  password?: string;
  role?: UserRole;
  canLogin?: boolean;
}

async function emailTakenByOther(email: string, userIdToAllow?: string) {
  const existing = await findUserByEmail(email);
  return Boolean(existing && existing.id !== userIdToAllow);
}

export default async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireAdmin);

  app.get("/api/users", async () => {
    const users = await listUsers();
    return { ok: true, data: users.map(publicUser) };
  });

  app.post<{ Body: UserBody }>("/api/users", { schema: createUserSchema }, async (req, reply) => {
    const email = req.body.email!.trim().toLowerCase();
    const name = req.body.name!.trim();
    if (!name) {
      return reply.code(400).send({ ok: false, error: "입력값을 확인하세요.", fieldErrors: { name: "필수" } });
    }
    if (await emailTakenByOther(email)) {
      return reply.code(400).send({
        ok: false,
        error: "이미 가입된 이메일입니다.",
        fieldErrors: { email: "이미 가입된 이메일입니다." },
      });
    }
    const passwordHash = await hashPassword(req.body.password!);
    const created = await createUser({
      email,
      name,
      passwordHash,
      role: req.body.role ?? "customer",
      canLogin: req.body.canLogin ?? true,
    });
    await audit(req, "user.create", "user", created.id);
    return { ok: true, data: publicUser(created) };
  });

  app.patch<{ Params: { id: string }; Body: UserBody }>(
    "/api/users/:id",
    { schema: updateUserSchema },
    async (req, reply) => {
      const existing = await findUserById(req.params.id);
      if (!existing) {
        return reply.code(404).send({ ok: false, error: "사용자를 찾을 수 없습니다." });
      }
      const email = req.body.email?.trim().toLowerCase();
      const name = req.body.name?.trim();
      if (name !== undefined && !name) {
        return reply.code(400).send({ ok: false, error: "입력값을 확인하세요.", fieldErrors: { name: "필수" } });
      }
      if (email && (await emailTakenByOther(email, existing.id))) {
        return reply.code(400).send({
          ok: false,
          error: "이미 가입된 이메일입니다.",
          fieldErrors: { email: "이미 가입된 이메일입니다." },
        });
      }
      const result = await updateUserGuardingLastLoginAdmin(req.params.id, {
        email,
        name,
        role: req.body.role,
        canLogin: req.body.canLogin,
        passwordHash: req.body.password ? await hashPassword(req.body.password) : undefined,
      });
      if (!result.ok && result.reason === "last_login_admin") {
        return reply.code(400).send({ ok: false, error: "로그인 가능한 관리자는 최소 1명 필요합니다." });
      }
      if (!result.ok) {
        return reply.code(404).send({ ok: false, error: "사용자를 찾을 수 없습니다." });
      }
      await audit(req, "user.update", "user", result.user.id);
      return { ok: true, data: publicUser(result.user) };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/users/:id", async (req, reply) => {
    if (req.params.id === userId(req)) {
      return reply.code(400).send({ ok: false, error: "현재 로그인한 사용자는 삭제할 수 없습니다." });
    }
    const existing = await findUserById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ ok: false, error: "사용자를 찾을 수 없습니다." });
    }
    const result = await deleteUserGuardingLastLoginAdmin(req.params.id);
    if (!result.ok && result.reason === "last_login_admin") {
      return reply.code(400).send({ ok: false, error: "로그인 가능한 관리자는 최소 1명 필요합니다." });
    }
    if (!result.ok) {
      return reply.code(404).send({ ok: false, error: "사용자를 찾을 수 없습니다." });
    }
    await audit(req, "delete", "user", req.params.id);
    return { ok: true, data: { id: req.params.id } };
  });
}
