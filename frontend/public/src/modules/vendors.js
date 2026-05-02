import { $, html, esc, raw } from "../dom.js";
import { api } from "../api.js";
import { openModal, closeModal, confirmModal } from "./modal.js";
import { showToast } from "./toast.js";
import { iArrowDown, iArrowUp, iCheck, iPencil, iTrash, iX } from "./icons.js";

const MAX_VENDOR_PHOTO_BYTES = 2_000_000;
const VENDOR_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** @param {HTMLElement} root */
export async function renderVendorsPage(root) {
  /** @type {import("../api.js").Vendor[]} */
  let vendors = [];
  /** @type {string|null} */
  let selectedVendorId = null;

  root.innerHTML = html`
    <section class="page vendors-page">
      <header class="page-header">
        <h2>업체</h2>
        <button data-action="vendor-create" class="primary">+ 새 업체</button>
      </header>
      <div id="vendors-list">
        <p class="muted">불러오는 중…</p>
      </div>
    </section>
  `;

  const listRoot = $("#vendors-list", root);

  function renderList() {
    if (vendors.length === 0) {
      listRoot.innerHTML = html`
        <div class="empty-state">
          <p>등록된 업체가 없습니다.</p>
          <button data-action="vendor-create" class="primary">첫 업체 등록</button>
        </div>
      `;
      return;
    }
    listRoot.innerHTML = renderVendorDirectory(vendors, selectedVendorId);
  }

  async function refresh() {
    listRoot.innerHTML = html`<p class="muted">불러오는 중…</p>`;
    const result = await api.vendors.list();
    if (!result.ok) {
      listRoot.innerHTML = html`<p class="error">${result.error}</p>`;
      return;
    }
    vendors = result.data;
    if (!vendors.some((vendor) => vendor.id === selectedVendorId)) {
      selectedVendorId = vendors[0]?.id ?? null;
    }
    renderList();
  }

  root.onclick = async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest("[data-action]");
    if (!(trigger instanceof HTMLElement)) {
      const row = target.closest("[data-vendor-row]");
      if (row instanceof HTMLElement && root.contains(row) && !target.closest("a, button, input, select, textarea, label")) {
        selectedVendorId = row.dataset.id ?? selectedVendorId;
        renderList();
      }
      return;
    }
    const action = trigger.dataset.action;
    const id = trigger.dataset.id ?? null;
    if (id) selectedVendorId = id;

    if (action === "vendor-create") {
      openVendorFormModal(null, refresh);
      return;
    }

    if (action === "vendor-edit" && id) {
      const vendor = vendors.find((item) => item.id === id) ?? null;
      if (vendor) openVendorFormModal(vendor, refresh);
      return;
    }

    if (action === "vendor-toggle-active" && id) {
      await toggleVendorActive(vendors, id, renderList);
      return;
    }

    if (action === "vendor-move" && id) {
      await moveVendor(vendors, id, trigger.dataset.direction, (next) => {
        vendors = next;
        renderList();
      });
      return;
    }

    if (action === "vendor-delete" && id) {
      if (!(await confirmModal("이 업체를 삭제하시겠습니까? 연결된 견적이나 계약이 있으면 삭제할 수 없습니다."))) return;
      const result = await api.vendors.remove(id);
      if (!result.ok) {
        showToast(result.error, { kind: "error" });
        return;
      }
      showToast("업체를 삭제했습니다.", { kind: "success" });
      await refresh();
    }
  };

  root.onkeydown = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (target.closest("a, button, input, select, textarea, label")) return;
    const row = target.closest("[data-vendor-row]");
    if (!(row instanceof HTMLElement) || !root.contains(row)) return;
    event.preventDefault();
    selectedVendorId = row.dataset.id ?? selectedVendorId;
    renderList();
  };

  await refresh();
}

/**
 * @param {import("../api.js").Vendor|null} vendor
 * @param {() => Promise<void>} onSaved
 */
function openVendorFormModal(vendor, onSaved) {
  openModal(buildVendorFormHtml(vendor));
  const form = /** @type {HTMLFormElement} */ ($("#vendor-form"));
  setupVendorPhotoInput(form, vendor);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitVendorForm(form, vendor, onSaved);
  });
}

/** @param {import("../api.js").Vendor|null} vendor */
function buildVendorFormHtml(vendor) {
  const isEdit = Boolean(vendor);
  const isActive = vendor?.isActive ?? true;
  const companyPhone = vendor?.companyPhone ?? vendor?.phone ?? "";
  return html`
    <h3>${isEdit ? "업체 수정" : "새 업체"}</h3>
    <form id="vendor-form" class="form">
      <label><span>업체명 *</span><input name="name" required value="${esc(vendor?.name ?? "")}" /></label>
      ${raw(renderVendorPhotoField(vendor))}
      <div class="row">
        <label><span>전문분야</span><input name="specialty" value="${esc(vendor?.specialty ?? "")}" placeholder="예: 도배, 마루" /></label>
        <label><span>나의 선호도 (0~5)</span><input name="rating" type="number" min="0" max="5" step="1" value="${esc(vendor?.rating ?? "")}" /></label>
      </div>
      <label><span>사무실 주소</span><input name="officeAddress" value="${esc(vendor?.officeAddress ?? "")}" /></label>
      <div class="vendor-status-choice" role="radiogroup" aria-label="사용 여부">
        <label>
          <input type="radio" name="isActive" value="false" ${isActive ? "" : "checked"} />
          <span>${raw(iX({ size: 13 }))} 사용안함</span>
        </label>
        <label>
          <input type="radio" name="isActive" value="true" ${isActive ? "checked" : ""} />
          <span>${raw(iCheck({ size: 13 }))} 사용함</span>
        </label>
      </div>
      <div class="row">
        <label><span>대표</span><input name="ceo" value="${esc(vendor?.ceo ?? "")}" /></label>
        <label><span>이메일</span><input name="email" type="email" value="${esc(vendor?.email ?? "")}" /></label>
      </div>
      <div class="row">
        <label><span>회사 전화</span><input name="companyPhone" value="${esc(companyPhone)}" /></label>
        <label><span>모바일 전화</span><input name="mobilePhone" value="${esc(vendor?.mobilePhone ?? "")}" /></label>
      </div>
      <label><span>메모</span><textarea name="memo" rows="3">${esc(vendor?.memo ?? "")}</textarea></label>
      <p class="error" id="vendor-error" hidden></p>
      <div class="form-actions">
        <button type="button" data-action="modal-close" class="ghost">취소</button>
        <button type="submit" class="primary">${isEdit ? "저장" : "등록"}</button>
      </div>
    </form>
  `;
}

/**
 * @param {HTMLFormElement} form
 * @param {import("../api.js").Vendor|null} vendor
 * @param {() => Promise<void>} onSaved
 */
async function submitVendorForm(form, vendor, onSaved) {
  const fd = new FormData(form);
  const errEl = $("#vendor-error");
  errEl.setAttribute("hidden", "");
  const companyPhone = nullable(fd.get("companyPhone"));
  const mobilePhone = nullable(fd.get("mobilePhone"));
  /** @type {Record<string, unknown>} */
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
    rating: nullableInt(fd.get("rating")),
    isActive: String(fd.get("isActive") ?? "true") === "true",
  };
  if (form.dataset.photoRemove === "true") {
    payload.photoDataUrl = null;
  } else if (form.dataset.photoDataUrl) {
    payload.photoDataUrl = form.dataset.photoDataUrl;
  }
  if (!payload.name) {
    errEl.textContent = "업체명을 입력해 주세요.";
    errEl.removeAttribute("hidden");
    return;
  }
  const result = vendor
    ? await api.vendors.update(vendor.id, payload)
    : await api.vendors.create(payload);
  if (!result.ok) {
    errEl.textContent = result.error;
    errEl.removeAttribute("hidden");
    return;
  }
  closeModal();
  showToast(vendor ? "업체를 수정했습니다." : "업체가 등록되었습니다.", { kind: "success" });
  await onSaved();
}

/**
 * @param {import("../api.js").Vendor[]} vendors
 * @param {string} id
 * @param {() => void} render
 */
async function toggleVendorActive(vendors, id, render) {
  const vendor = vendors.find((item) => item.id === id);
  if (!vendor) return;
  const result = await api.vendors.update(id, { isActive: !vendor.isActive });
  if (!result.ok) {
    showToast(result.error, { kind: "error" });
    return;
  }
  Object.assign(vendor, result.data);
  showToast(result.data.isActive ? "업체를 사용함으로 변경했습니다." : "업체를 사용안함으로 변경했습니다.", { kind: "success" });
  render();
}

/**
 * @param {import("../api.js").Vendor[]} vendors
 * @param {string} id
 * @param {string|undefined} direction
 * @param {(next: import("../api.js").Vendor[]) => void} render
 */
async function moveVendor(vendors, id, direction, render) {
  if (direction !== "up" && direction !== "down") return;
  const index = vendors.findIndex((item) => item.id === id);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= vendors.length) return;
  const next = [...vendors];
  const current = next[index];
  next[index] = next[nextIndex];
  next[nextIndex] = current;
  const result = await api.vendors.reorder(next.map((item) => item.id));
  if (!result.ok) {
    showToast(result.error, { kind: "error" });
    return;
  }
  showToast("업체 순서를 변경했습니다.", { kind: "success" });
  render(result.data);
}

/** @param {FormDataEntryValue | null} v */
function nullable(v) {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** @param {FormDataEntryValue | null} v */
function nullableInt(v) {
  const s = nullable(v);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {import("../api.js").Vendor[]} vendors
 * @param {string|null} selectedVendorId
 */
function renderVendorDirectory(vendors, selectedVendorId) {
  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId) ?? vendors[0] ?? null;
  const active = vendors.filter((v) => v.isActive).length;
  const inactive = vendors.length - active;
  const rated = vendors.filter((v) => v.rating != null);
  const avgPreference =
    rated.length === 0
      ? "-"
      : (rated.reduce((sum, v) => sum + Number(v.rating ?? 0), 0) / rated.length).toFixed(1);

  return `
    <div class="vendor-directory">
      <div class="vendor-summary-grid">
        <div class="vendor-stat">
          <span>전체 업체</span>
          <strong>${vendors.length}</strong>
        </div>
        <div class="vendor-stat">
          <span>사용함</span>
          <strong>${active}</strong>
        </div>
        <div class="vendor-stat">
          <span>사용안함</span>
          <strong>${inactive}</strong>
        </div>
        <div class="vendor-stat">
          <span>평균 선호도</span>
          <strong>${avgPreference}</strong>
        </div>
      </div>

      <div class="vendor-workbench">
        <div class="vendor-table-card">
          <table class="data-table vendor-table">
            <colgroup>
              <col class="vendor-col-name" />
              <col class="vendor-col-specialty" />
              <col class="vendor-col-contact" />
              <col class="vendor-col-email" />
              <col class="vendor-col-preference" />
              <col class="vendor-col-status" />
              <col class="vendor-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>업체</th>
                <th>전문분야</th>
                <th>담당/전화</th>
                <th>이메일</th>
                <th>나의 선호도</th>
                <th>사용</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${vendors.map((vendor, index) => renderVendorRow(vendor, index, vendors.length, selectedVendor?.id ?? null)).join("")}
            </tbody>
          </table>
        </div>
        ${renderVendorDetailPanel(selectedVendor)}
      </div>
    </div>
  `;
}

/**
 * @param {import("../api.js").Vendor} vendor
 * @param {number} index
 * @param {number} count
 * @param {string|null} selectedVendorId
 */
function renderVendorRow(vendor, index, count, selectedVendorId) {
  const subtitle = vendor.memo || (vendor.specialty ? `${vendor.specialty} 전문 업체` : "업체 정보 관리 중");
  const rowClass = [vendor.isActive ? "" : "vendor-inactive", vendor.id === selectedVendorId ? "selected" : ""]
    .filter(Boolean)
    .join(" ");

  return `
    <tr class="${rowClass}" data-vendor-row data-id="${esc(vendor.id)}" tabindex="0" aria-selected="${vendor.id === selectedVendorId ? "true" : "false"}">
      <td>
        <div class="vendor-profile">
          ${renderVendorAvatar(vendor)}
          <span class="vendor-identity">
            <strong>${esc(vendor.name)}</strong>
            <small>${esc(subtitle)}</small>
          </span>
        </div>
      </td>
      <td>${renderSpecialty(vendor.specialty)}</td>
      <td>
        <div class="vendor-contact">
          <strong>${esc(vendor.ceo || "대표 미입력")}</strong>
          <span>${esc(primaryVendorPhone(vendor) || "연락처 미입력")}</span>
        </div>
      </td>
      <td>${renderEmail(vendor.email)}</td>
      <td>${renderPreference(vendor.rating)}</td>
      <td>${renderStatusToggle(vendor)}</td>
      <td class="vendor-actions">
        <button class="icon-btn vendor-action-btn" data-action="vendor-move" data-direction="up" data-id="${esc(vendor.id)}" ${index <= 0 ? "disabled" : ""} title="위로">${iArrowUp({ size: 14 })}</button>
        <button class="icon-btn vendor-action-btn" data-action="vendor-move" data-direction="down" data-id="${esc(vendor.id)}" ${index >= count - 1 ? "disabled" : ""} title="아래로">${iArrowDown({ size: 14 })}</button>
        <button class="icon-btn vendor-action-btn" data-action="vendor-edit" data-id="${esc(vendor.id)}" title="수정">${iPencil({ size: 14 })}</button>
        <button class="icon-btn vendor-action-btn danger" data-action="vendor-delete" data-id="${esc(vendor.id)}" title="삭제">${iTrash({ size: 14 })}</button>
      </td>
    </tr>
  `;
}

/** @param {import("../api.js").Vendor|null} vendor */
function renderVendorDetailPanel(vendor) {
  if (!vendor) {
    return `
      <aside class="vendor-detail-panel empty" aria-label="업체 정보">
        <p>업체를 선택하세요.</p>
      </aside>
    `;
  }
  return `
    <aside class="vendor-detail-panel" aria-label="선택된 업체 정보">
      <div class="vendor-detail-header">
        ${renderVendorAvatar(vendor, "large")}
        <div class="vendor-detail-title">
          <span>업체 정보</span>
          <h3>${esc(vendor.name)}</h3>
          <p>${esc(vendor.specialty || "전문분야 미지정")}</p>
        </div>
      </div>
      ${renderVendorDetailPhoto(vendor)}

      <div class="vendor-detail-strip">
        ${renderStatusToggle(vendor)}
        ${renderPreference(vendor.rating)}
      </div>

      <dl class="vendor-detail-list">
        ${renderDetailItem("대표", vendor.ceo)}
        ${renderDetailItem("사무실", vendor.officeAddress)}
        ${renderDetailItem("회사 전화", vendor.companyPhone ?? vendor.phone)}
        ${renderDetailItem("모바일", vendor.mobilePhone)}
        ${renderDetailItem("이메일", vendor.email, vendor.email ? `mailto:${vendor.email}` : null)}
        ${renderDetailItem("전문분야", vendor.specialty)}
        ${renderDetailItem("정렬", `${vendor.sortOrder}`)}
      </dl>

      <div class="vendor-detail-note">
        <span>메모</span>
        <p>${esc(vendor.memo || "메모가 없습니다.")}</p>
      </div>

      <div class="vendor-detail-actions">
        <button class="ghost" data-action="vendor-edit" data-id="${esc(vendor.id)}">${iPencil({ size: 14 })} 수정</button>
        <button class="ghost danger" data-action="vendor-delete" data-id="${esc(vendor.id)}">${iTrash({ size: 14 })} 삭제</button>
      </div>
    </aside>
  `;
}

/** @param {import("../api.js").Vendor|null} vendor */
function renderVendorPhotoField(vendor) {
  return `
    <div class="vendor-photo-field">
      <span>업체 사진</span>
      <div class="vendor-photo-control">
        <div class="vendor-photo-preview">
          ${renderVendorPhotoPreview(vendor?.photoUrl ?? null, vendor?.name ?? "업체")}
        </div>
        <div class="vendor-photo-buttons">
          <label class="ghost small">
            <input class="vendor-photo-input" name="photoFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            <span>사진 올리기</span>
          </label>
          <button type="button" class="ghost small" data-vendor-photo-clear>사진 제거</button>
        </div>
      </div>
      <small>PNG, JPG, WebP, GIF / 2MB 이하</small>
    </div>
  `;
}

/**
 * @param {HTMLFormElement} form
 * @param {import("../api.js").Vendor|null} vendor
 */
function setupVendorPhotoInput(form, vendor) {
  form.dataset.photoUrl = vendor?.photoUrl ?? "";
  form.dataset.photoDataUrl = "";
  form.dataset.photoRemove = "false";
  const input = form.querySelector('input[name="photoFile"]');
  const clear = form.querySelector("[data-vendor-photo-clear]");
  const preview = $(".vendor-photo-preview", form);
  if (input instanceof HTMLInputElement) {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const errEl = $("#vendor-error");
      errEl.setAttribute("hidden", "");
      if (!VENDOR_PHOTO_TYPES.has(file.type)) {
        errEl.textContent = "업체 사진은 PNG, JPG, WebP, GIF만 등록할 수 있습니다.";
        errEl.removeAttribute("hidden");
        input.value = "";
        return;
      }
      if (file.size > MAX_VENDOR_PHOTO_BYTES) {
        errEl.textContent = "업체 사진은 2MB 이하로 등록해 주세요.";
        errEl.removeAttribute("hidden");
        input.value = "";
        return;
      }
      try {
        const photoUrl = await readFileAsDataUrl(file);
        form.dataset.photoUrl = photoUrl;
        form.dataset.photoDataUrl = photoUrl;
        form.dataset.photoRemove = "false";
        preview.innerHTML = renderVendorPhotoPreview(photoUrl, file.name);
      } catch {
        errEl.textContent = "업체 사진을 읽지 못했습니다.";
        errEl.removeAttribute("hidden");
      }
    });
  }
  clear?.addEventListener("click", () => {
    form.dataset.photoUrl = "";
    form.dataset.photoDataUrl = "";
    form.dataset.photoRemove = "true";
    if (input instanceof HTMLInputElement) input.value = "";
    preview.innerHTML = renderVendorPhotoPreview(null, vendor?.name ?? "업체");
  });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("사진을 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {string|null} photoUrl
 * @param {string} alt
 */
function renderVendorPhotoPreview(photoUrl, alt) {
  if (isVendorImageUrl(photoUrl)) {
    return `<img src="${esc(photoUrl)}" alt="${esc(alt)}" />`;
  }
  return `<span>사진 없음</span>`;
}

/** @param {import("../api.js").Vendor} vendor */
function renderVendorDetailPhoto(vendor) {
  if (!isVendorImageUrl(vendor.photoUrl)) {
    return `<div class="vendor-detail-photo empty">업체 사진 없음</div>`;
  }
  return `
    <figure class="vendor-detail-photo">
      <img src="${esc(vendor.photoUrl)}" alt="${esc(vendor.name)} 업체 사진" />
    </figure>
  `;
}

/**
 * @param {import("../api.js").Vendor} vendor
 * @param {string} [size]
 */
function renderVendorAvatar(vendor, size = "") {
  const accent = specialtyAccent(vendor.specialty);
  const className = ["vendor-avatar", size, isVendorImageUrl(vendor.photoUrl) ? "has-photo" : ""].filter(Boolean).join(" ");
  const content = isVendorImageUrl(vendor.photoUrl)
    ? `<img src="${esc(vendor.photoUrl)}" alt="${esc(vendor.name)}" />`
    : esc(initials(vendor.name));
  return `<span class="${className}" style="--vendor-accent: ${accent}">${content}</span>`;
}

/** @param {string|null|undefined} photoUrl */
function isVendorImageUrl(photoUrl) {
  return Boolean(photoUrl && (
    /^data:image\/(png|jpeg|webp|gif);base64,/.test(photoUrl) ||
    photoUrl.startsWith("/uploads/vendor-profiles/")
  ));
}

/** @param {import("../api.js").Vendor} vendor */
function primaryVendorPhone(vendor) {
  return vendor.mobilePhone || vendor.companyPhone || vendor.phone || null;
}

/**
 * @param {string} label
 * @param {string|null} value
 * @param {string|null} [href]
 */
function renderDetailItem(label, value, href = null) {
  const content = value ? esc(value) : "미입력";
  const className = value ? "" : "empty";
  return `
    <div>
      <dt>${esc(label)}</dt>
      <dd class="${className}">${href && value ? `<a href="${esc(href)}">${content}</a>` : content}</dd>
    </div>
  `;
}

/** @param {string|null} specialty */
function renderSpecialty(specialty) {
  if (!specialty) return `<span class="vendor-specialty empty">미지정</span>`;
  return `<span class="vendor-specialty" style="--vendor-accent: ${specialtyAccent(specialty)}"><i aria-hidden="true"></i>${esc(specialty)}</span>`;
}

/** @param {string|null} email */
function renderEmail(email) {
  if (!email) return `<span class="vendor-muted">이메일 미입력</span>`;
  return `<a class="vendor-email" href="mailto:${esc(email)}">${esc(email)}</a>`;
}

/** @param {number|null} rating */
function renderPreference(rating) {
  if (rating == null) return `<span class="vendor-preference empty">미입력</span>`;
  const score = Math.max(0, Math.min(5, Math.round(rating)));
  const meter = Array.from({ length: 5 }, (_, index) => `<i class="${index < score ? "filled" : ""}"></i>`).join("");
  return `
    <span class="vendor-preference">
      <span class="vendor-preference-meter" aria-label="나의 선호도 ${score}점">${meter}</span>
      <strong>${score}/5</strong>
    </span>
  `;
}

/** @param {import("../api.js").Vendor} vendor */
function renderStatusToggle(vendor) {
  return `
    <button class="vendor-status-toggle ${vendor.isActive ? "active" : ""}" data-action="vendor-toggle-active" data-id="${esc(vendor.id)}" title="${vendor.isActive ? "사용안함으로 변경" : "사용함으로 변경"}">
      <span class="vendor-status-dot" aria-hidden="true"></span>
      <span>${vendor.isActive ? "사용함" : "사용안함"}</span>
    </button>
  `;
}

/** @param {string} name */
function initials(name) {
  const chars = Array.from(name.trim());
  return chars.slice(0, 2).join("") || "?";
}

/** @param {string|null} specialty */
function specialtyAccent(specialty) {
  const value = specialty ?? "";
  if (value.includes("철거")) return "#2563eb";
  if (value.includes("설비")) return "#0891b2";
  if (value.includes("창호")) return "#0f766e";
  if (value.includes("도배")) return "#7c3aed";
  if (value.includes("마루")) return "#b45309";
  if (value.includes("전기")) return "#d97706";
  if (value.includes("목공")) return "#16a34a";
  if (value.includes("타일")) return "#db2777";
  return "#475569";
}
