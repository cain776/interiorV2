// E2E 시나리오에서 자주 쓰는 액션을 함수로. spec.ts 가 짧아진다.

import type { Page, APIRequestContext } from "@playwright/test";

export const ADMIN = {
  email: "admin@e2e.test",
  password: "admin1234",
  name: "E2E Admin",
};

/**
 * `/api/auth/signup` 호출. 첫 가입자는 자동 admin (userCount === 0).
 * UI 시그업 폼을 거치는 대신 직접 호출하면 테스트가 빨라진다.
 */
export async function signupAdmin(request: APIRequestContext, overrides: Partial<typeof ADMIN> = {}) {
  const body = { ...ADMIN, ...overrides };
  const res = await request.post("/api/auth/signup", { data: body });
  if (!res.ok()) {
    throw new Error(`signup 실패: ${res.status()} ${await res.text()}`);
  }
  return body;
}

/** 로그인 페이지를 거쳐 로그인. 세션 쿠키가 page context 에 저장됨. */
export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator("form#login-form button.auth-submit").click();
  // 로그인 성공 시 /projects 로 이동
  await page.waitForURL("**/projects");
}

/**
 * 견적 비교 시나리오 setup — UI 로 다 만들면 flaky 하니까 API 직접 호출.
 * 반환: 만들어진 id 들. 시나리오는 그 id 로 워크스페이스 진입.
 */
export async function setupQuoteScenario(request: APIRequestContext) {
  const project = await postOk<{ id: string }>(request, "/api/projects", {
    name: "E2E 테스트 프로젝트",
    sizeKr: 33,
    totalBudget: 30000000,
  });

  const phase = await postOk<{ id: string }>(request, `/api/projects/${project.id}/phases`, {
    name: "도배",
    status: "planned",
  });

  const space = await postOk<{ id: string }>(request, `/api/projects/${project.id}/spaces`, {
    name: "거실",
    areaSqm: 30,
  });

  const lineItem = await postOk<{ id: string }>(request, `/api/phases/${phase.id}/line-items`, {
    label: "거실 도배",
    spaceId: space.id,
  });

  const vendorA = await postOk<{ id: string }>(request, "/api/vendors", {
    name: "A업체",
    specialty: "도배",
  });
  const vendorB = await postOk<{ id: string }>(request, "/api/vendors", {
    name: "B업체",
    specialty: "도배/필름",
  });

  const quoteA = await postOk<{ id: string }>(request, `/api/line-items/${lineItem.id}/quotes`, {
    vendorId: vendorA.id,
    mode: "turnkey",
    price: 1000000,
    status: "candidate",
  });
  const quoteB = await postOk<{ id: string }>(request, `/api/line-items/${lineItem.id}/quotes`, {
    vendorId: vendorB.id,
    mode: "turnkey",
    price: 850000,
    status: "candidate",
  });

  return {
    projectId: project.id,
    phaseId: phase.id,
    spaceId: space.id,
    lineItemId: lineItem.id,
    vendorA, vendorB,
    quoteA, quoteB,
  };
}

async function postOk<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await request.post(path, { data });
  if (!res.ok()) throw new Error(`POST ${path} 실패: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  if (!body.ok) throw new Error(`POST ${path} 응답 ok=false: ${JSON.stringify(body)}`);
  return body.data as T;
}
