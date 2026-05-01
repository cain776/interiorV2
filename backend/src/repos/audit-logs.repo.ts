import { query } from "../lib/db.js";

export interface InsertAuditLogInput {
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  diff: unknown;
  ip: string | null;
  userAgent: string | null;
}

/**
 * audit_logs INSERT.
 * lib/audit.ts 의 audit() 헬퍼가 fail-open 으로 감싸 호출.
 * diff 는 JSONB. undefined 는 NULL 로, 그 외는 JSON.stringify.
 */
export async function insertAuditLog(input: InsertAuditLogInput): Promise<void> {
  await query(
    `INSERT INTO audit_logs
       (actor_user_id, action, target_type, target_id, diff, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId,
      input.diff !== undefined ? JSON.stringify(input.diff) : null,
      input.ip,
      input.userAgent,
    ],
  );
}
