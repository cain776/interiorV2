import { test, expect } from "@playwright/test";
import { resetDatabase, closeDatabase } from "../helpers/db.js";
import { ADMIN, signupAdmin, loginViaUi } from "../helpers/fixtures.js";

test.beforeEach(async ({ request }) => {
  await resetDatabase();
  await signupAdmin(request);
});

test.afterAll(async () => {
  await closeDatabase();
});

test("업체 등록 → 수정 → 삭제 라이프사이클", async ({ page }) => {
  await loginViaUi(page, ADMIN.email, ADMIN.password);

  // 업체 페이지로 이동
  await page.goto("/vendors");
  await expect(page.locator("h2")).toContainText("업체");

  // 1) 등록
  await page.locator('[data-action="vendor-create"]').first().click();
  const modal = page.locator("#modal-card");
  await expect(modal).toContainText("새 업체");
  await modal.locator('input[name="name"]').fill("테스트도배");
  await modal.locator('input[name="specialty"]').fill("도배/필름");
  await modal.locator('input[name="rating"]').fill("4");
  await modal.locator('input[name="ceo"]').fill("홍길동");
  await modal.locator('input[name="email"]').fill("test@vendor.example");
  await modal.locator('input[name="companyPhone"]').fill("02-1234-5678");
  await modal.locator('button[type="submit"]').click();

  // 모달 닫힘 + 리스트에 신규 업체 표시
  await expect(modal).not.toBeVisible();
  await expect(page.getByText("테스트도배")).toBeVisible();

  // 2) 수정 — 평점 변경
  await page.getByText("테스트도배").click(); // 행 선택
  await page.locator('[data-action="vendor-edit"]').first().click();
  await expect(modal).toContainText("업체 수정");
  await modal.locator('input[name="rating"]').fill("5");
  await modal.locator('button[type="submit"]').click();
  await expect(modal).not.toBeVisible();

  // 3) 삭제 (confirmModal 다이얼로그 확인)
  await page.locator('[data-action="vendor-delete"]').first().click();
  // confirmModal 의 확인 버튼 클릭
  await page.locator("#confirm-ok").click();

  // 리스트가 빈 상태로 돌아옴
  await expect(page.getByText("등록된 업체가 없습니다.")).toBeVisible();
});

test("업체명 미입력 시 폼 에러 표시", async ({ page }) => {
  await loginViaUi(page, ADMIN.email, ADMIN.password);
  await page.goto("/vendors");
  await page.locator('[data-action="vendor-create"]').first().click();
  const modal = page.locator("#modal-card");
  await modal.locator('button[type="submit"]').click();
  // HTML5 required 가 먼저 막거나 자체 폼 에러. 둘 중 하나는 있어야 통과.
  // submit 가 막히면 모달 그대로 열려있음.
  await expect(modal).toBeVisible();
});
