// audit() 헬퍼 자체 동작 회귀 테스트.
// 라우트별 audit 호출은 가드레일 테스트가 정적으로 검증 (라우트에 audit() 호출이 있는지).
// 이 파일은 audit() 가 row 를 정확한 컬럼으로 INSERT 하는지 + fail-open 거동을 검증.

import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { audit } from "../../lib/audit.js";
import { query } from "../../lib/db.js";
import { closeDatabase, resetDatabase } from "./helpers/db.js";
import { makeUser } from "./helpers/factories.js";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

interface AuditRow {
  actor_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  diff: unknown;
  ip: string | null;
  user_agent: string | null;
}

async function lastAudit(): Promise<AuditRow | null> {
  const r = await query<AuditRow>(
    `SELECT actor_user_id, action, target_type, target_id, diff, ip, user_agent
       FROM audit_logs ORDER BY id DESC LIMIT 1`,
  );
  return r.rows[0] ?? null;
}

// FastifyRequest 흉내 — audit() 가 실제로 쓰는 필드만.
function fakeReq(overrides: {
  userId?: string;
  ip?: string;
  ua?: string;
} = {}) {
  return {
    session: { userId: overrides.userId },
    ip: overrides.ip ?? "127.0.0.1",
    headers: { "user-agent": overrides.ua ?? "vitest" },
    log: { error: () => {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("audit()", () => {
  test("기본 INSERT — actor/action/target/ip/ua 가 정확히 저장", async () => {
    const user = await makeUser();

    await audit(
      fakeReq({ userId: user.id, ip: "10.0.0.5", ua: "Mozilla/5.0" }),
      "delete",
      "project",
      "proj-123",
      { before: { name: "old" } },
    );

    const row = await lastAudit();
    expect(row).not.toBeNull();
    expect(row!.actor_user_id).toBe(user.id);
    expect(row!.action).toBe("delete");
    expect(row!.target_type).toBe("project");
    expect(row!.target_id).toBe("proj-123");
    expect(row!.ip).toBe("10.0.0.5");
    expect(row!.user_agent).toBe("Mozilla/5.0");
    expect(row!.diff).toEqual({ before: { name: "old" } });
  });

  test("미인증 액션 (login.fail 시나리오) — actor_user_id 가 NULL", async () => {
    await audit(fakeReq(), "login.fail", "user", null, { email: "x@y" });

    const row = await lastAudit();
    expect(row!.actor_user_id).toBe(null);
    expect(row!.action).toBe("login.fail");
    expect(row!.target_type).toBe("user");
    expect(row!.target_id).toBe(null);
  });

  test("diff 미지정 시 NULL 로 저장", async () => {
    const user = await makeUser();

    await audit(fakeReq({ userId: user.id }), "logout", "user", user.id);

    const row = await lastAudit();
    expect(row!.diff).toBe(null);
  });

  test("fail-open — 잘못된 actor_user_id (FK 위반) 가 와도 main flow 막지 않음", async () => {
    // 존재하지 않는 user id 로 INSERT 시도. FK ON DELETE SET NULL 이라 INSERT 자체는
    // user 가 없으면 23503 (foreign_key_violation) 발생 — audit 은 catch 해서 throw 안 함.
    await expect(
      audit(fakeReq({ userId: "ghost-user-id" }), "test.fail_open"),
    ).resolves.toBe(undefined);

    // 그리고 row 도 안 남음 (INSERT 실패).
    const row = await lastAudit();
    expect(row).toBeNull();
  });
});
