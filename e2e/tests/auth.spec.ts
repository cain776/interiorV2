import { test, expect } from "@playwright/test";
import { resetDatabase, closeDatabase } from "../helpers/db.js";
import { ADMIN, signupAdmin, loginViaUi } from "../helpers/fixtures.js";

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await closeDatabase();
});

test("회원가입 후 자동 로그인되고 /projects 로 이동한다", async ({ page, request }) => {
  await signupAdmin(request);
  await loginViaUi(page, ADMIN.email, ADMIN.password);

  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator("h2")).toContainText("내 프로젝트");
});

test("잘못된 비밀번호는 로그인 폼 에러 표시", async ({ page, request }) => {
  await signupAdmin(request);

  await page.goto("/login");
  await page.locator("#login-email").fill(ADMIN.email);
  await page.locator("#login-password").fill("wrong-password");
  await page.locator("form#login-form button.auth-submit").click();

  const error = page.locator("#login-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("이메일 또는 비밀번호");
});

test("로그아웃 후 /login 으로 리다이렉트", async ({ page, request }) => {
  await signupAdmin(request);
  await loginViaUi(page, ADMIN.email, ADMIN.password);

  // 전역 LNB 의 로그아웃 버튼은 /projects 같은 페이지에서만 보임 (워크스페이스 안에선 햄버거 메뉴).
  await page.locator('[data-action="logout"]').first().click();
  await page.waitForURL("**/login");

  // 로그아웃 상태에서 /projects 직접 접근 시 /login 으로 다시 튕김
  await page.goto("/projects");
  await page.waitForURL("**/login");
});
