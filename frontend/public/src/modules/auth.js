import { $, esc, html, raw } from "../dom.js";
import { api } from "../api.js";
import { setState } from "../state.js";
import { showToast } from "./toast.js";
import { iBuilding, iEye, iEyeOff, iLockKeyhole, iMail } from "./icons.js";

const LOGIN_PREFS_KEY = "interior-v2.loginPrefs";
const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo1234";

// 비밀번호는 브라우저의 password manager 에 위임.
// localStorage 평문 저장은 도메인 내 모든 스크립트가 읽을 수 있어 위험.
// "이메일 저장" 만 자체 처리하고 password 는 절대 저장하지 않는다.

/**
 * @param {HTMLElement} root
 * @param {(user: import("../api.js").User) => void} onSuccess
 */
export function renderLogin(root, onSuccess) {
  const prefs = loadLoginPrefs();
  root.innerHTML = html`
    <section class="auth-page login-page">
      <div class="login-shell">
        ${raw(renderLoginVisual())}
        ${raw(renderLoginCard(prefs))}
      </div>
    </section>
  `;
  injectLoginIcons(root);
  bindLoginForm(root, onSuccess);
}

/**
 * 좌측 visual 카드. 데모/소개용 데이터로, 실제 사용자 데이터가 아니다.
 * 향후 실제 워크스페이스 미리보기로 교체 시 이 함수만 갈아끼우면 됨.
 */
function renderLoginVisual() {
  return html`
    <aside class="login-visual" aria-hidden="true">
      <div class="login-brand">
        <span class="login-brand-mark" id="login-brand-icon"></span>
        <div>
          <span class="login-brand-kicker">INTERIOR WORKSPACE</span>
          <strong>인테리어 견적 관리</strong>
        </div>
      </div>

      <div class="login-project-card">
        <div class="login-project-head">
          <div>
            <span class="status status-in_progress">정리중</span>
            <h3>검암서해그랑블 리모델링</h3>
          </div>
          <span class="login-project-amount">30,000,000원</span>
        </div>
        <div class="login-project-meta">
          <span>33평</span>
          <span>공간 13개</span>
          <span>창호교체</span>
          <span>공간관리</span>
        </div>
        <div class="login-mini-table">
          <div>
            <span>창호</span>
            <strong>12개 항목</strong>
            <em>1,238,000</em>
          </div>
          <div class="active">
            <span>공간</span>
            <strong>13개 구역</strong>
            <em>사진 37장</em>
          </div>
          <div>
            <span>설비</span>
            <strong>21개 항목</strong>
            <em>검토중</em>
          </div>
        </div>
      </div>

      <div class="login-visual-foot">
        <div><strong>14</strong><span>업체</span></div>
        <div><strong>94</strong><span>항목</span></div>
        <div><strong>37</strong><span>사진</span></div>
      </div>
    </aside>
  `;
}

/** @param {{ email: string, rememberEmail: boolean }} prefs */
function renderLoginCard(prefs) {
  return html`
    <section class="auth-card login-card">
      <div class="login-card-head">
        <span class="login-card-icon" id="login-card-icon"></span>
        <div>
          <h2>로그인</h2>
          <p>작업공간으로 돌아가기</p>
        </div>
      </div>

      <form id="login-form" novalidate>
        <label class="auth-field">
          <span>이메일</span>
          <span class="auth-input-wrap">
            <span class="auth-input-icon" id="login-email-icon"></span>
            <input id="login-email" name="email" type="email" autocomplete="email" required placeholder="email@example.com" value="${esc(prefs.email)}" />
          </span>
        </label>
        <label class="auth-field">
          <span>비밀번호</span>
          <span class="auth-input-wrap">
            <span class="auth-input-icon" id="login-password-icon"></span>
            <input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="비밀번호" />
            <button id="password-toggle" class="auth-password-toggle" type="button" aria-label="비밀번호 보기" title="비밀번호 보기"></button>
          </span>
        </label>
        <div class="auth-options">
          <label class="check-row">
            <input id="remember-email" name="rememberEmail" type="checkbox" ${prefs.rememberEmail ? "checked" : ""} />
            <span>아이디 저장</span>
          </label>
        </div>
        <p class="error auth-error" id="login-error" hidden></p>
        <button type="submit" class="primary auth-submit">로그인</button>
      </form>

      <div class="login-demo">
        <div>
          <strong>데모 계정</strong>
          <span>${DEMO_EMAIL}</span>
        </div>
        <button id="demo-fill" type="button">입력</button>
      </div>

      <p class="auth-switch">
        계정이 없으신가요?
        <a href="/signup" data-action="goto" data-route="/signup">회원가입</a>
      </p>
    </section>
  `;
}

/** @param {HTMLElement} root */
function injectLoginIcons(root) {
  $("#login-brand-icon", root).innerHTML = iBuilding({ size: 22 });
  $("#login-card-icon", root).innerHTML = iBuilding({ size: 18 });
  $("#login-email-icon", root).innerHTML = iMail({ size: 16 });
  $("#login-password-icon", root).innerHTML = iLockKeyhole({ size: 16 });
  const passwordToggle = /** @type {HTMLButtonElement} */ ($("#password-toggle", root));
  passwordToggle.innerHTML = iEye({ size: 16 });
}

/**
 * @param {HTMLElement} root
 * @param {(user: import("../api.js").User) => void} onSuccess
 */
function bindLoginForm(root, onSuccess) {
  const form = /** @type {HTMLFormElement} */ ($("#login-form", root));
  const emailInput = /** @type {HTMLInputElement} */ ($("#login-email", root));
  const passwordInput = /** @type {HTMLInputElement} */ ($("#login-password", root));
  const rememberEmailInput = /** @type {HTMLInputElement} */ ($("#remember-email", root));
  const passwordToggle = /** @type {HTMLButtonElement} */ ($("#password-toggle", root));
  const demoButton = /** @type {HTMLButtonElement} */ ($("#demo-fill", root));
  const submitButton = /** @type {HTMLButtonElement} */ (form.querySelector(".auth-submit"));

  passwordToggle.addEventListener("click", () => {
    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    passwordToggle.innerHTML = shouldShow ? iEyeOff({ size: 16 }) : iEye({ size: 16 });
    passwordToggle.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
    passwordToggle.setAttribute("title", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
  });

  demoButton.addEventListener("click", () => {
    emailInput.value = DEMO_EMAIL;
    passwordInput.value = DEMO_PASSWORD;
    rememberEmailInput.checked = true;
    showToast("데모 계정이 입력되었습니다.", { kind: "success" });
    emailInput.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await handleLoginSubmit(form, root, submitButton, onSuccess);
  });
}

/**
 * @param {HTMLFormElement} form
 * @param {HTMLElement} root
 * @param {HTMLButtonElement} submitButton
 * @param {(user: import("../api.js").User) => void} onSuccess
 */
async function handleLoginSubmit(form, root, submitButton, onSuccess) {
  const fd = new FormData(form);
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const rememberEmail = Boolean(fd.get("rememberEmail"));
  const errEl = $("#login-error", root);
  errEl.setAttribute("hidden", "");

  if (!email || !password) {
    errEl.textContent = "이메일과 비밀번호를 입력해주세요.";
    errEl.removeAttribute("hidden");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "확인 중";
  try {
    const result = await api.auth.login({ email, password });
    if (result.ok) {
      saveLoginPrefs({ email, rememberEmail });
      setState({ currentUser: result.data });
      showToast("로그인 성공", { kind: "success" });
      onSuccess(result.data);
      return;
    }
    errEl.textContent = result.error;
    errEl.removeAttribute("hidden");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "로그인";
  }
}

/**
 * @param {HTMLElement} root
 * @param {(user: import("../api.js").User) => void} onSuccess
 */
export function renderSignup(root, onSuccess) {
  root.innerHTML = html`
    <section class="auth-card">
      <h2>회원가입</h2>
      <form id="signup-form" novalidate>
        <label>
          <span>이름</span>
          <input name="name" type="text" autocomplete="name" required />
        </label>
        <label>
          <span>이메일</span>
          <input name="email" type="email" autocomplete="email" required />
        </label>
        <label>
          <span>비밀번호 (8자 이상)</span>
          <input name="password" type="password" autocomplete="new-password" minlength="8" required />
        </label>
        <p class="error" id="signup-error" hidden></p>
        <button type="submit" class="primary">가입하기</button>
      </form>
      <p class="auth-switch">
        이미 계정이 있나요?
        <a href="/login" data-action="goto" data-route="/login">로그인</a>
      </p>
    </section>
  `;

  const form = /** @type {HTMLFormElement} */ ($("#signup-form", root));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "");
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    const errEl = $("#signup-error", root);
    errEl.setAttribute("hidden", "");

    const result = await api.auth.signup({ name, email, password });
    if (result.ok) {
      setState({ currentUser: result.data });
      showToast("환영합니다!", { kind: "success" });
      onSuccess(result.data);
      return;
    }
    const detail = result.fieldErrors
      ? Object.entries(result.fieldErrors).map(([k, v]) => `${k}: ${v}`).join(" / ")
      : "";
    errEl.textContent = detail ? `${result.error} (${detail})` : result.error;
    errEl.removeAttribute("hidden");
  });
}

function loadLoginPrefs() {
  try {
    const raw = localStorage.getItem(LOGIN_PREFS_KEY);
    if (!raw) return { email: "", rememberEmail: false };
    const parsed = JSON.parse(raw);
    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
      rememberEmail: Boolean(parsed.rememberEmail),
    };
  } catch {
    return { email: "", rememberEmail: false };
  }
}

/**
 * 비밀번호는 절대 저장하지 않는다 — 브라우저 password manager 에 위임.
 * @param {{ email: string, rememberEmail: boolean }} input
 */
function saveLoginPrefs(input) {
  try {
    if (!input.rememberEmail) {
      localStorage.removeItem(LOGIN_PREFS_KEY);
      return;
    }
    localStorage.setItem(
      LOGIN_PREFS_KEY,
      JSON.stringify({ rememberEmail: true, email: input.email }),
    );
  } catch {
    // 저장소를 사용할 수 없는 브라우저 설정에서는 로그인만 계속 진행한다.
  }
}
