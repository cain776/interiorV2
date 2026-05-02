import { test, expect } from "@playwright/test";
import { resetDatabase, closeDatabase } from "../helpers/db.js";
import { ADMIN, signupAdmin, loginViaUi, setupQuoteScenario } from "../helpers/fixtures.js";

test.beforeEach(async ({ request }) => {
  await resetDatabase();
  await signupAdmin(request);
});

test.afterAll(async () => {
  await closeDatabase();
});

test("워크스페이스에서 견적 비교 + 채택 토글", async ({ page, request }) => {
  // signup 으로 받은 세션 쿠키를 page 에도 공유 — Playwright 기본 동작.
  // 단 signup 은 request 컨텍스트에서 발생했으므로 page 는 별도 로그인 필요.
  await loginViaUi(page, ADMIN.email, ADMIN.password);

  // setup 은 page 의 세션 쿠키 컨텍스트로 호출하면 인증 OK.
  // page.request 가 같은 storage state 사용.
  const ids = await setupQuoteScenario(page.request);

  // 워크스페이스 진입
  await page.goto(`/projects/${encodeURIComponent(ids.projectId)}`);

  // 견적 비교 패널이 렌더되고 두 업체 + 두 가격 표시
  await expect(page.locator(".quote-compare-panel")).toBeVisible();
  await expect(page.locator(".vendor-filter-bar")).toContainText("A업체");
  await expect(page.locator(".vendor-filter-bar")).toContainText("B업체");
  await expect(page.locator(".quote-matrix")).toContainText("1,000,000");
  await expect(page.locator(".quote-matrix")).toContainText("850,000");

  // 견적 셀 클릭 → 선택 → 채택 버튼 활성화
  await page.locator('[data-action="ws-select-quote-cell"]').first().click();
  const adoptButton = page.locator('[data-action="ws-adopt-quote"]');
  await expect(adoptButton).toBeEnabled();

  // 채택 (확인 다이얼로그가 있을 수도, 없을 수도 — 현재 구현은 confirm 없이 즉시 채택)
  await adoptButton.click();

  // 채택 마커가 라인 항목에 표시
  await expect(page.locator(".adopted-marker").first()).toBeVisible({ timeout: 3_000 });
});
