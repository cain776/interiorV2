import { $, html, raw } from "../dom.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { openModal, closeModal, confirmModal } from "./modal.js";
import { showToast } from "./toast.js";
import { iBuilding, iPencil, iPlus, iTrash } from "./icons.js";

/** @typedef {"users"|"vendors"} SettingsTab */

const ROLE_LABEL = { admin: "관리자", customer: "일반(고객)", vendor: "업체" };

/** @param {HTMLElement} root */
export async function renderSettingsPage(root) {
  /** @type {{ tab: SettingsTab, users: import("../api.js").User[], vendors: import("../api.js").Vendor[] }} */
  const state = { tab: "users", users: [], vendors: [] };

  root.innerHTML = html`
    <section class="settings-shell">
      <aside class="settings-menu" aria-label="설정 메뉴">
        <div class="settings-menu__title">설정</div>
        <button data-action="settings-tab" data-tab="users" class="settings-menu__item is-active">
          <span class="settings-menu__icon">U</span>
          <span>사용자 관리</span>
        </button>
        <button data-action="settings-tab" data-tab="vendors" class="settings-menu__item">
          <span class="settings-menu__icon">${raw(iBuilding({ size: 14 }))}</span>
          <span>업체 관리</span>
        </button>
      </aside>
      <div class="settings-main">
        <header class="settings-main__header">
          <div>
            <h2 id="settings-heading">사용자 관리</h2>
            <p id="settings-desc">사용자 계정과 로그인 권한만 간단히 관리합니다.</p>
          </div>
          <div id="settings-actions"></div>
        </header>
        <div id="settings-content" class="settings-content">
          <p class="muted">불러오는 중…</p>
        </div>
      </div>
    </section>
  `;

  root.onclick = async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest("[data-action]");
    if (!(trigger instanceof HTMLElement)) return;
    const action = trigger.dataset.action;

    if (action === "settings-tab") {
      const tab = trigger.dataset.tab;
      if (tab === "users" || tab === "vendors") {
        state.tab = tab;
        await renderActiveTab();
      }
      return;
    }
    if (action === "user-create") return openUserModal(null, refreshUsers);
    if (action === "user-edit") return openUserModal(findById(state.users, trigger.dataset.id), refreshUsers);
    if (action === "user-delete") return deleteUser(trigger.dataset.id, refreshUsers);
    if (action === "vendor-create") return openVendorModal(null, refreshVendors);
    if (action === "vendor-edit") return openVendorModal(findById(state.vendors, trigger.dataset.id), refreshVendors);
    if (action === "vendor-delete") return deleteVendor(trigger.dataset.id, refreshVendors);
  };

  await renderActiveTab();

  async function renderActiveTab() {
    for (const button of root.querySelectorAll("[data-tab]")) {
      button.classList.toggle("is-active", button instanceof HTMLElement && button.dataset.tab === state.tab);
    }
    $("#settings-heading", root).textContent = state.tab === "users" ? "사용자 관리" : "업체 관리";
    $("#settings-desc", root).textContent =
      state.tab === "users"
        ? "사용자 CRUD와 로그인 가능 여부, 권한 구분만 관리합니다. 업체 상세정보는 업체 관리에서 다룹니다."
        : "견적에 사용할 업체 정보를 등록하고 수정합니다.";
    $("#settings-actions", root).innerHTML =
      state.tab === "users"
        ? html`<button data-action="user-create" class="primary">${raw(iPlus({ size: 14 }))}<span>사용자 등록</span></button>`
        : html`<button data-action="vendor-create" class="primary">${raw(iPlus({ size: 14 }))}<span>업체 등록</span></button>`;
    await (state.tab === "users" ? refreshUsers() : refreshVendors());
  }

  async function refreshUsers() {
    const content = $("#settings-content", root);
    content.innerHTML = html`<p class="muted">사용자 목록을 불러오는 중…</p>`;
    const result = await api.users.list();
    if (!result.ok) {
      content.innerHTML = html`<div class="empty-state"><p>${result.error}</p></div>`;
      return;
    }
    state.users = result.data;
    content.innerHTML = renderUsers(state.users);
  }

  async function refreshVendors() {
    const content = $("#settings-content", root);
    content.innerHTML = html`<p class="muted">업체 목록을 불러오는 중…</p>`;
    const result = await api.vendors.list();
    if (!result.ok) {
      content.innerHTML = html`<div class="empty-state"><p>${result.error}</p></div>`;
      return;
    }
    state.vendors = result.data;
    content.innerHTML = renderVendors(state.vendors);
  }
}

/** @template {{ id: string }} T @param {T[]} rows @param {string|undefined} id */
function findById(rows, id) {
  if (!id) return null;
  return rows.find((row) => row.id === id) ?? null;
}

/** @param {import("../api.js").User[]} users */
function renderUsers(users) {
  if (users.length === 0) {
    return html`<div class="empty-state"><p>등록된 사용자가 없습니다.</p></div>`;
  }
  return html`
    <div class="settings-table-card">
      <table class="data-table settings-table">
        <thead>
          <tr>
            <th>사용자</th>
            <th>권한</th>
            <th>로그인</th>
            <th>가입일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${raw(users.map(renderUserRow).join(""))}
        </tbody>
      </table>
    </div>
  `;
}

/** @param {import("../api.js").User} user */
function renderUserRow(user) {
  const currentId = getState().currentUser?.id;
  const isMe = user.id === currentId;
  return html`
    <tr>
      <td>
        <div class="settings-person">
          <span class="settings-avatar">${initials(user.name)}</span>
          <span>
            <strong>${user.name}${isMe ? " (나)" : ""}</strong>
            <small>${user.email}</small>
          </span>
        </div>
      </td>
      <td><span class="settings-badge role">${ROLE_LABEL[user.role] ?? user.role}</span></td>
      <td>${raw(user.canLogin ? `<span class="settings-badge ok">허용</span>` : `<span class="settings-badge off">차단</span>`)}</td>
      <td class="settings-muted">${formatDate(user.createdAt)}</td>
      <td class="settings-row-actions">
        <button class="ghost small" data-action="user-edit" data-id="${user.id}" title="사용자 수정">${raw(iPencil({ size: 14 }))}<span>수정</span></button>
        <button class="ghost small danger" data-action="user-delete" data-id="${user.id}" title="사용자 삭제">${raw(iTrash({ size: 14 }))}<span>삭제</span></button>
      </td>
    </tr>
  `;
}

/** @param {import("../api.js").Vendor[]} vendors */
function renderVendors(vendors) {
  if (vendors.length === 0) {
    return html`<div class="empty-state"><p>등록된 업체가 없습니다.</p></div>`;
  }
  return html`
    <div class="settings-table-card">
      <table class="data-table settings-table">
        <thead>
          <tr>
            <th>업체</th>
            <th>전문분야</th>
            <th>연락처</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${raw(vendors.map(renderVendorRow).join(""))}
        </tbody>
      </table>
    </div>
  `;
}

/** @param {import("../api.js").Vendor} vendor */
function renderVendorRow(vendor) {
  return html`
    <tr>
      <td>
        <div class="settings-person">
          <span class="settings-avatar vendor">${initials(vendor.name)}</span>
          <span>
            <strong>${vendor.name}</strong>
            <small>${vendor.email || "이메일 미입력"}</small>
          </span>
        </div>
      </td>
      <td>${vendor.specialty || "미지정"}</td>
      <td>
        <div class="settings-contact">
          <strong>${vendor.ceo || "대표 미입력"}</strong>
          <span>${vendorPrimaryPhone(vendor) || "전화 미입력"}</span>
        </div>
      </td>
      <td>${raw(vendor.isActive ? `<span class="settings-badge ok">사용함</span>` : `<span class="settings-badge off">사용안함</span>`)}</td>
      <td class="settings-row-actions">
        <button class="ghost small" data-action="vendor-edit" data-id="${vendor.id}" title="업체 수정">${raw(iPencil({ size: 14 }))}<span>수정</span></button>
        <button class="ghost small danger" data-action="vendor-delete" data-id="${vendor.id}" title="업체 삭제">${raw(iTrash({ size: 14 }))}<span>삭제</span></button>
      </td>
    </tr>
  `;
}

/** @param {import("../api.js").User|null} user @param {() => Promise<void>} onSaved */
function openUserModal(user, onSaved) {
  openModal(html`
    <h3>${user ? "사용자 수정" : "사용자 등록"}</h3>
    <form id="settings-user-form" class="form">
      <div class="row">
        <label><span>이름 *</span><input name="name" required value="${user?.name ?? ""}" /></label>
        <label><span>이메일 *</span><input name="email" type="email" required value="${user?.email ?? ""}" /></label>
      </div>
      <div class="row">
        <label>
          <span>역할</span>
          <select name="role">
            <option value="admin" ${user?.role === "admin" ? "selected" : ""}>관리자</option>
            <option value="customer" ${user?.role === "customer" ? "selected" : ""}>일반(고객)</option>
            <option value="vendor" ${user?.role === "vendor" ? "selected" : ""}>업체</option>
          </select>
        </label>
        <label class="settings-check"><input name="canLogin" type="checkbox" ${user?.canLogin !== false ? "checked" : ""} /><span>로그인 허용</span></label>
      </div>
      <label><span>${user ? "새 비밀번호" : "초기 비밀번호 *"}</span><input name="password" type="password" ${user ? "" : "required"} minlength="8" autocomplete="new-password" /></label>
      <p class="error" id="settings-modal-error" hidden></p>
      <div class="form-actions">
        <button type="button" data-action="modal-close" class="ghost">취소</button>
        <button type="submit" class="primary">${user ? "저장" : "등록"}</button>
      </div>
    </form>
  `);
  const form = /** @type {HTMLFormElement} */ ($("#settings-user-form"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const password = String(fd.get("password") ?? "");
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      role: /** @type {import("../api.js").UserRole} */ (String(fd.get("role") ?? "customer")),
      canLogin: fd.get("canLogin") === "on",
    };
    const result = user
      ? await api.users.update(user.id, { ...payload, ...(password ? { password } : {}) })
      : await api.users.create({ ...payload, password });
    await handleModalResult(result, user ? "사용자가 수정되었습니다." : "사용자가 등록되었습니다.", onSaved);
  });
}

/** @param {import("../api.js").Vendor|null} vendor @param {() => Promise<void>} onSaved */
function openVendorModal(vendor, onSaved) {
  openModal(html`
    <h3>${vendor ? "업체 수정" : "업체 등록"}</h3>
    <form id="settings-vendor-form" class="form">
      <label><span>업체명 *</span><input name="name" required value="${vendor?.name ?? ""}" /></label>
      <div class="row">
        <label><span>전문분야</span><input name="specialty" value="${vendor?.specialty ?? ""}" /></label>
        <label><span>나의 선호도 (0~5)</span><input name="rating" type="number" min="0" max="5" step="1" value="${vendor?.rating ?? ""}" /></label>
      </div>
      <label><span>사무실 주소</span><input name="officeAddress" value="${vendor?.officeAddress ?? ""}" /></label>
      <div class="row">
        <label><span>대표</span><input name="ceo" value="${vendor?.ceo ?? ""}" /></label>
        <label><span>이메일</span><input name="email" type="email" value="${vendor?.email ?? ""}" /></label>
      </div>
      <div class="row">
        <label><span>회사 전화</span><input name="companyPhone" value="${vendor?.companyPhone ?? vendor?.phone ?? ""}" /></label>
        <label><span>모바일 전화</span><input name="mobilePhone" value="${vendor?.mobilePhone ?? ""}" /></label>
      </div>
      <label><span>메모</span><textarea name="memo" rows="3">${vendor?.memo ?? ""}</textarea></label>
      <label class="settings-check"><input name="isActive" type="checkbox" ${vendor?.isActive !== false ? "checked" : ""} /><span>사용함</span></label>
      <p class="error" id="settings-modal-error" hidden></p>
      <div class="form-actions">
        <button type="button" data-action="modal-close" class="ghost">취소</button>
        <button type="submit" class="primary">${vendor ? "저장" : "등록"}</button>
      </div>
    </form>
  `);
  const form = /** @type {HTMLFormElement} */ ($("#settings-vendor-form"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const ratingValue = String(fd.get("rating") ?? "").trim();
    const companyPhone = nullable(fd.get("companyPhone"));
    const mobilePhone = nullable(fd.get("mobilePhone"));
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      specialty: nullable(fd.get("specialty")),
      ceo: nullable(fd.get("ceo")),
      phone: companyPhone ?? mobilePhone,
      officeAddress: nullable(fd.get("officeAddress")),
      companyPhone,
      mobilePhone,
      email: nullable(fd.get("email")),
      memo: nullable(fd.get("memo")),
      rating: ratingValue === "" ? null : Number.parseInt(ratingValue, 10),
      isActive: fd.get("isActive") === "on",
    };
    const result = vendor
      ? await api.vendors.update(vendor.id, payload)
      : await api.vendors.create(payload);
    await handleModalResult(result, vendor ? "업체가 수정되었습니다." : "업체가 등록되었습니다.", onSaved);
  });
}

/** @param {import("../api.js").Vendor} vendor */
function vendorPrimaryPhone(vendor) {
  return vendor.mobilePhone || vendor.companyPhone || vendor.phone || null;
}

/** @param {string|undefined} id @param {() => Promise<void>} refresh */
async function deleteUser(id, refresh) {
  if (!id || !(await confirmModal("이 사용자를 삭제하시겠습니까?"))) return;
  const result = await api.users.remove(id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast("사용자가 삭제되었습니다.", { kind: "success" });
  await refresh();
}

/** @param {string|undefined} id @param {() => Promise<void>} refresh */
async function deleteVendor(id, refresh) {
  if (!id || !(await confirmModal("이 업체를 삭제하시겠습니까?"))) return;
  const result = await api.vendors.remove(id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast("업체가 삭제되었습니다.", { kind: "success" });
  await refresh();
}

/** @param {import("../api.js").ApiResult<unknown>} result @param {string} message @param {() => Promise<void>} onSaved */
async function handleModalResult(result, message, onSaved) {
  const errEl = $("#settings-modal-error");
  errEl.setAttribute("hidden", "");
  if (!result.ok) {
    errEl.textContent = result.error;
    errEl.removeAttribute("hidden");
    return;
  }
  closeModal();
  showToast(message, { kind: "success" });
  await onSaved();
}

/** @param {FormDataEntryValue|null} v */
function nullable(v) {
  const value = String(v ?? "").trim();
  return value === "" ? null : value;
}

/** @param {string} name */
function initials(name) {
  return Array.from(name.trim()).slice(0, 2).join("") || "?";
}

/** @param {string} value */
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
}
