// 감사 로그 헬퍼.
// 라우트는 한 줄로 호출: await audit(req, "delete", "project", id, { before })
//
// 설계 원칙:
// - **fail-open**: audit INSERT 실패가 main flow 를 막지 않음. 로그만 남기고 계속.
//   (감사 부재가 사용자 경험 망가뜨리는 것보다 낫다는 판단)
// - actor_user_id 는 req.session.userId — 미인증 액션 (login.fail) 은 NULL.
// - diff 는 JSONB. before/after, 또는 단순 메타 (예: { email } on login.fail).
// - SQL 은 repos/audit-logs.repo.ts 에 격리. 이 파일은 fail-open wrapping 만 책임.

import type { FastifyRequest } from "fastify";
import { insertAuditLog } from "../repos/audit-logs.repo.js";

export async function audit(
  req: FastifyRequest,
  action: string,
  targetType?: string | null,
  targetId?: string | null,
  diff?: unknown,
): Promise<void> {
  try {
    await insertAuditLog({
      actorUserId: req.session?.userId ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      diff,
      ip: req.ip ?? null,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    });
  } catch (err) {
    // fail-open: 감사 INSERT 가 깨져도 사용자 액션은 성공 처리.
    req.log.error({ err, action, targetType, targetId }, "audit failed");
  }
}
