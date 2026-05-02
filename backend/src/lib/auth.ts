import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { findUserById } from "../repos/users.repo.js";

declare module "fastify" {
  interface Session {
    userId?: string;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Fastify preHandler. 세션이 없으면 401 응답을 보내고 reply 를 반환해
 * 후속 핸들러 실행을 중단시킨다 (fastify 규약).
 */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | void> {
  if (!req.session.userId) {
    reply.code(401).send({ ok: false, error: "로그인이 필요합니다." });
    return reply;
  }
  const user = await findUserById(req.session.userId);
  if (!user || !user.canLogin) {
    await req.session.destroy();
    reply.code(401).send({ ok: false, error: "로그인이 필요합니다." });
    return reply;
  }
}

export function userId(req: FastifyRequest): string {
  const id = req.session.userId;
  if (!id) throw new Error("requireAuth must run first");
  return id;
}
