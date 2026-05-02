import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, "../..");
const projectRoot = resolve(backendRoot, "..");

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(projectRoot, path), "utf8");
}

async function listFiles(dir: string): Promise<string[]> {
  return (await readdir(join(projectRoot, dir))).sort((a, b) => a.localeCompare(b));
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("migration files use unique numeric prefixes", async () => {
  const files = (await listFiles("database/migrations")).filter((name) => name.endsWith(".sql"));
  const prefixes = files.map((name) => name.split("_")[0]);
  assert.deepEqual(new Set(prefixes).size, prefixes.length, files.join(", "));
});

test("schema.sql is a current-state schema, not a migration script", async () => {
  const schema = await readProjectFile("database/schema.sql");
  assert.doesNotMatch(schema, /\bDROP\s+CONSTRAINT\b/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "session"/);
  assert.match(
    schema,
    /status\s+TEXT\s+NOT NULL\s+DEFAULT 'candidate' CHECK \(status IN \('candidate', 'negotiating', 'contracted', 'cancelled'\)\)/,
  );
});

test("route layer stays DB-access free", async () => {
  const routeDir = join(projectRoot, "backend/src/routes");
  const files = (await readdir(routeDir)).filter((name) => name.endsWith(".ts"));
  for (const file of files) {
    const source = stripComments(await readFile(join(routeDir, file), "utf8"));
    assert.doesNotMatch(source, /from "\.\.\/lib\/db\.js"/, file);
    assert.doesNotMatch(source, /\b(pool|query)\s*\./, file);
    assert.doesNotMatch(source, /\bquery\s*\(/, file);
  }
});

test("lib layer stays DB-access free (SQL only in repos/*)", async () => {
  // CLAUDE.md 룰 정신: SQL 은 repos/*.repo.ts 에만.
  // routes/* 는 가드되지만 lib/* 도 같은 룰을 적용해 audit/access 같은 cross-cutting helper
  // 안에 SQL 이 다시 흩어지는 것을 막는다.
  const libDir = join(projectRoot, "backend/src/lib");
  const files = (await readdir(libDir)).filter((name) => name.endsWith(".ts") && name !== "db.ts");
  for (const file of files) {
    const source = stripComments(await readFile(join(libDir, file), "utf8"));
    assert.doesNotMatch(source, /from "\.\.\/lib\/db\.js"/, file);
    assert.doesNotMatch(source, /from "\.\/db\.js"/, file);
    assert.doesNotMatch(source, /\bquery\s*\(/, file);
  }
});

test("project ownership checks use access helper outside projects route", async () => {
  const routeDir = join(projectRoot, "backend/src/routes");
  const files = (await readdir(routeDir)).filter((name) => name.endsWith(".ts"));
  for (const file of files) {
    if (file === "projects.routes.ts") continue;
    const source = await readFile(join(routeDir, file), "utf8");
    assert.doesNotMatch(source, /getProjectByIdForOwner/, file);
  }
});

test("auth brute-force protection is wired on signup and login only", async () => {
  const server = await readProjectFile("backend/src/server.ts");
  const authRoutes = await readProjectFile("backend/src/routes/auth.routes.ts");

  assert.match(server, /import rateLimit from "@fastify\/rate-limit"/);
  assert.match(server, /app\.register\(rateLimit,\s*{[\s\S]*global:\s*false/);
  assert.match(authRoutes, /const authRateLimitConfig =/);
  assert.match(authRoutes, /const signupSchema =/);
  assert.match(authRoutes, /const loginSchema =/);
  assert.match(authRoutes, /"\/api\/auth\/signup",\s*{\s*schema: signupSchema,\s*config: authRateLimitConfig\s*}/);
  assert.match(authRoutes, /"\/api\/auth\/login",\s*{\s*schema: loginSchema,\s*config: authRateLimitConfig\s*}/);
});

test("attachment upload policy and size limit are documented in code and architecture", async () => {
  const attachments = await readProjectFile("backend/src/routes/attachments.routes.ts");
  const architecture = await readProjectFile("docs/architecture.md");

  assert.match(attachments, /const MAX_BLOB_URL_BYTES = 5_000_000/);
  // 5MB 가드는 fastify schema 의 maxLength 또는 명시적 length 비교, 둘 중 하나면 OK.
  assert.match(
    attachments,
    /(blobUrl.*length > MAX_BLOB_URL_BYTES|maxLength: MAX_BLOB_URL_BYTES)/,
  );
  assert.match(architecture, /base64 data URL/);
  assert.match(architecture, /단일 첨부 5MB 제한/);
});

test("quote selection status policy is explicit and contracts use english status values", async () => {
  const architecture = await readProjectFile("docs/architecture.md");
  const domain = await readProjectFile("backend/src/types/domain.ts");
  const openApi = await readProjectFile("docs/api-contract.openapi.yaml");

  assert.match(architecture, /quotes\.status.*수동 관리/);
  assert.match(architecture, /select API 가 status 를 자동으로 `?'contracted'`? 로 바꾸지/);
  assert.match(domain, /export type QuoteStatus = "candidate" \| "negotiating" \| "contracted" \| "cancelled"/);
  assert.match(openApi, /enum: \[candidate, negotiating, contracted, cancelled\]/);
});

test("pg numeric parsers are registered deliberately", async () => {
  const db = await readProjectFile("backend/src/lib/db.ts");
  assert.match(db, /pg\.types\.setTypeParser\(20,/);
  assert.match(db, /pg\.types\.setTypeParser\(1700,/);
  assert.match(db, /정밀도 손실/);
});

test("session fixation is prevented on signup and login", async () => {
  const auth = await readProjectFile("backend/src/routes/auth.routes.ts");
  // signup, login 양쪽 모두 userId 부착 직전 regenerate 호출되어야 함.
  const signupBlock = auth.match(/"\/api\/auth\/signup"[\s\S]*?req\.session\.userId\s*=\s*user\.id/);
  const loginBlock = auth.match(/"\/api\/auth\/login"[\s\S]*?req\.session\.userId\s*=\s*user\.id/);
  assert.ok(signupBlock, "signup handler not found");
  assert.ok(loginBlock, "login handler not found");
  assert.match(signupBlock![0], /await req\.session\.regenerate\(\)/);
  assert.match(loginBlock![0], /await req\.session\.regenerate\(\)/);
});

test("security headers, payload limit, and origin guard are wired in server.ts", async () => {
  const server = await readProjectFile("backend/src/server.ts");
  // helmet 등록.
  assert.match(server, /import helmet from "@fastify\/helmet"/);
  assert.match(server, /app\.register\(helmet/);
  // bodyLimit 명시 — attachment 5MB + headroom (8MB).
  assert.match(server, /bodyLimit:\s*8\s*\*\s*1024\s*\*\s*1024/);
  // Origin 검증 hook — POST/PATCH/DELETE 에 대해 host 일치 확인.
  assert.match(server, /\["POST", "PATCH", "DELETE"\]\.includes\(req\.method\)/);
  // host 비교 대상은 기본 req.headers.host. TRUST_PROXY=true 일 때만 X-Forwarded-Host 허용.
  assert.match(server, /new URL\(origin\)\.host !== expectedHost/);
  assert.match(server, /env\.TRUST_PROXY/);
  assert.match(server, /x-forwarded-host/i);
});

test("audit_logs table is in schema and migrations", async () => {
  const schema = await readProjectFile("database/schema.sql");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS audit_logs/);
  assert.match(schema, /actor_user_id\s+TEXT REFERENCES users\(id\) ON DELETE SET NULL/);
  assert.match(schema, /audit_logs_actor_idx/);

  const files = (await listFiles("database/migrations")).filter((n) => n.endsWith(".sql"));
  assert.ok(
    files.some((f) => /audit/i.test(f)),
    "migration file mentioning audit not found",
  );
});

test("audit helper exists and is fail-open", async () => {
  const audit = await readProjectFile("backend/src/lib/audit.ts");
  assert.match(audit, /export async function audit/);
  // SQL 은 repos/audit-logs.repo.ts 로 분리됨. lib/audit.ts 는 fail-open wrapping 만 책임.
  assert.match(audit, /from "\.\.\/repos\/audit-logs\.repo\.js"/);
  assert.match(audit, /insertAuditLog\(/);
  // fail-open 주석 + try/catch 패턴 둘 다 확인.
  assert.match(audit, /fail-open/);
  assert.match(audit, /} catch \(/);

  const auditRepo = await readProjectFile("backend/src/repos/audit-logs.repo.ts");
  assert.match(auditRepo, /INSERT INTO audit_logs/);
  assert.match(auditRepo, /export async function insertAuditLog/);
});

test("auth routes record login/signup/logout in audit log", async () => {
  const auth = await readProjectFile("backend/src/routes/auth.routes.ts");
  assert.match(auth, /import \{ audit \}/);
  assert.match(auth, /audit\(req,\s*"signup"/);
  assert.match(auth, /audit\(req,\s*"login\.success"/);
  assert.match(auth, /audit\(req,\s*"login\.fail"/);
  assert.match(auth, /audit\(req,\s*"logout"/);
});

test("every DELETE route writes an audit entry", async () => {
  // 라우트 파일별로 app.delete 패턴이 audit("delete", ...) 와 같은 핸들러 안에 있어야 함.
  // 누락 시 가족 공유 단계에서 "누가 지웠는지" 추적 불가 → 정책상 차단.
  const routeDir = join(projectRoot, "backend/src/routes");
  const files = (await readdir(routeDir)).filter((f) => f.endsWith(".routes.ts"));
  for (const file of files) {
    const source = await readFile(join(routeDir, file), "utf8");
    const hasDelete = /app\.delete\b/.test(source);
    if (!hasDelete) continue;
    assert.match(
      source,
      /audit\(req,\s*"delete",/,
      `${file} 에 app.delete 가 있지만 audit("delete", ...) 호출이 없음`,
    );
  }
});

test("sensitive status changes are audited (contract / payment / change_order / quote.select)", async () => {
  const contracts = await readProjectFile("backend/src/routes/contracts.routes.ts");
  const payments = await readProjectFile("backend/src/routes/payments.routes.ts");
  const changeOrders = await readProjectFile("backend/src/routes/change-orders.routes.ts");
  const quotes = await readProjectFile("backend/src/routes/quotes.routes.ts");

  assert.match(contracts, /audit\(req,\s*"contract\.status_change"/);
  assert.match(payments, /audit\(req,\s*"payment\.update"/);
  assert.match(changeOrders, /audit\(req,\s*"change_order\.update"/);
  assert.match(quotes, /audit\(req,\s*"quote\.select"/);
});

// ===== Tier 2 메타 가드레일 — 신규 라우트가 자동으로 검증되도록. =====

/**
 * 라우트 파일별 인증 정책 등록.
 * 신규 라우트 추가 시 여기에 등록 + 라우트 파일에 정책 표시(주석/preHandler) 둘 다 일치해야 통과.
 *
 * - "public": 인증 불필요 (health, auth)
 * - "auth":   세션 로그인 필요 (대부분의 자식 리소스)
 * - "admin":  admin role 강제
 */
const ROUTE_AUTH_POLICY: Record<string, "public" | "auth" | "admin"> = {
  "health.routes.ts": "public",
  "auth.routes.ts": "public", // 라우트 단위 회원가입/로그인은 public, /me 와 /logout 은 자체 검사
  "users.routes.ts": "admin",
  "projects.routes.ts": "auth",
  "vendors.routes.ts": "auth",
  "phases.routes.ts": "auth",
  "spaces.routes.ts": "auth",
  "line-items.routes.ts": "auth",
  "quotes.routes.ts": "auth",
  "contracts.routes.ts": "auth",
  "payments.routes.ts": "auth",
  "change-orders.routes.ts": "auth",
  "as-tickets.routes.ts": "auth",
  "attachments.routes.ts": "auth",
  "review-materials.routes.ts": "auth",
};

test("[meta] 모든 라우트 파일이 ROUTE_AUTH_POLICY 에 등록되어 있다", async () => {
  const routeDir = join(projectRoot, "backend/src/routes");
  const files = (await readdir(routeDir)).filter((f) => f.endsWith(".routes.ts"));
  for (const file of files) {
    assert.ok(
      file in ROUTE_AUTH_POLICY,
      `${file} 가 ROUTE_AUTH_POLICY 에 없음. project-guardrails.test.ts 의 ROUTE_AUTH_POLICY 에 정책 등록 필요.`,
    );
  }
});

test("[meta] docs/permissions.md 가 ROUTE_AUTH_POLICY 와 일치한다", async () => {
  // 사람이 읽는 권한 매트릭스(docs/permissions.md) 와 코드의 ROUTE_AUTH_POLICY 가 어긋나면 가드레일 실패.
  // 신규 라우트 추가 시 코드 + 문서 둘 다 갱신해야 통과.
  const doc = await readProjectFile("docs/permissions.md");
  for (const [file, policy] of Object.entries(ROUTE_AUTH_POLICY)) {
    // 매트릭스 표 row 에 "라우트 파일명" 과 정책 키워드(public/admin/auth) 가 동시에 나타나야 한다.
    const escapedFile = file.replace(/[.\\]/g, "\\$&");
    const rowPattern = new RegExp(`\`${escapedFile}\`[^\\n]*\\*\\*${policy}\\*\\*`, "i");
    assert.match(
      doc,
      rowPattern,
      `docs/permissions.md 에 ${file} 의 정책(${policy}) 표기가 누락되었거나 불일치. `
        + `"\`${file}\` ... **${policy}**" 형태의 표 row 가 필요.`,
    );
  }
});

test("[meta] 라우트 파일이 인증 정책에 맞는 가드를 등록한다", async () => {
  const routeDir = join(projectRoot, "backend/src/routes");
  for (const [file, policy] of Object.entries(ROUTE_AUTH_POLICY)) {
    const source = stripComments(await readFile(join(routeDir, file), "utf8"));
    if (policy === "public") {
      // public 라우트: 명시적 requireAuth/requireAdmin 등록이 없어야 (auth 의 me/logout 같은 부분은 핸들러 안에서 자체 검사).
      // auth.routes.ts 는 일부 핸들러에서 requireAuth 등 가능하나 plugin 단위 hook 은 금지.
      assert.doesNotMatch(
        source,
        /app\.addHook\("preHandler",\s*requireAdmin\)/,
        `${file}: public 정책인데 requireAdmin preHandler 가 등록됨`,
      );
    }
    if (policy === "auth") {
      assert.match(
        source,
        /app\.addHook\("preHandler",\s*requireAuth\)/,
        `${file}: auth 정책 라우트는 plugin 시작에서 requireAuth preHandler 등록 필요`,
      );
    }
    if (policy === "admin") {
      assert.match(
        source,
        /app\.addHook\("preHandler",\s*requireAuth\)/,
        `${file}: admin 정책도 requireAuth 가 먼저 등록되어야 함`,
      );
      assert.match(
        source,
        /app\.addHook\("preHandler",\s*requireAdmin\)/,
        `${file}: admin 정책은 requireAdmin preHandler 등록 필요. 누락 시 권한 상승 사고 위험.`,
      );
    }
  }
});

test("[meta] 모든 mutation 라우트는 fastify schema 검증을 등록한다", async () => {
  // POST/PATCH 라우트가 { schema: ... } 옵션 없이 등록되면 입력 검증 누락 → 400/타입 안전성 결함.
  // 정규식: app.(post|patch)<...>("/api/...", ASYNC_HANDLER) 패턴이 schema 키 없이 끝나는 경우 잡음.
  // false positive 줄이기 위해 ApiResponse 검증과 별도로, 핸들러 옵션 객체에 "schema" 키 등장 여부만 체크.
  const routeDir = join(projectRoot, "backend/src/routes");
  const files = (await readdir(routeDir)).filter((f) => f.endsWith(".routes.ts"));
  for (const file of files) {
    if (file === "health.routes.ts") continue; // body 없음
    const source = stripComments(await readFile(join(routeDir, file), "utf8"));
    const mutationCalls = source.match(/app\.(post|patch)\b[\s\S]*?(?=app\.|export default|$)/g) ?? [];
    for (const block of mutationCalls) {
      // body 가 없는 단순 액션 (ex: /api/auth/logout, /api/quotes/{id}/select) 는 schema 생략 가능.
      // Body 제네릭이 있거나 requestBody 가 있어 body 받는 경우만 검사.
      if (!/Body:\s*\w+Body\b/.test(block)) continue;
      assert.match(
        block,
        /\{\s*schema:/,
        `${file}: Body 가 있는 mutation 에 fastify schema 검증 누락. `
          + `라우트 옵션에 { schema: { body: xxxBody } } 추가 필요.`,
      );
    }
  }
});

test("[meta] 모든 라우트가 ApiResponse 패턴(ok)으로 응답한다", async () => {
  // { ok: true, data: ... } / { ok: false, error: ... } 패턴 강제.
  // reply.send(...) / reply.code(...).send(...) 호출 시 첫 인자가 ok 키 없는 객체면 위반.
  // 헬퍼 함수의 단순 return 은 라우트 응답이 아니므로 검사 대상 제외 (false positive 방지).
  const routeDir = join(projectRoot, "backend/src/routes");
  const files = (await readdir(routeDir)).filter((f) => f.endsWith(".routes.ts"));
  for (const file of files) {
    const source = stripComments(await readFile(join(routeDir, file), "utf8"));
    const sendCalls = source.match(/\.send\(\s*\{[^}]*\}/g) ?? [];
    for (const expr of sendCalls) {
      if (/\bok\s*:/.test(expr)) continue;
      assert.fail(
        `${file}: reply.send(...) 의 첫 인자에 ok 키 누락 — ${expr.slice(0, 100)}`,
      );
    }
  }
});
