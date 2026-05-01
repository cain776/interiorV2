import { $, html, esc } from "../dom.js";
import { api } from "../api.js";
import { openModal, closeModal, confirmModal } from "./modal.js";
import { showToast } from "./toast.js";
import { iTrash } from "./icons.js";

/** @param {HTMLElement} root */
export async function renderVendorsPage(root) {
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

  async function refresh() {
    listRoot.innerHTML = html`<p class="muted">불러오는 중…</p>`;
    const result = await api.vendors.list();
    if (!result.ok) {
      listRoot.innerHTML = html`<p class="error">${result.error}</p>`;
      return;
    }
    if (result.data.length === 0) {
      listRoot.innerHTML = html`
        <div class="empty-state">
          <p>등록된 업체가 없습니다.</p>
          <button data-action="vendor-create" class="primary">첫 업체 등록</button>
        </div>
      `;
      return;
    }
    listRoot.innerHTML = renderVendorDirectory(result.data);
  }

  root.onclick = async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest("[data-action]");
    if (!(trigger instanceof HTMLElement)) return;
    const action = trigger.dataset.action;

    if (action === "vendor-create") {
      openCreateVendorModal(refresh);
    } else if (action === "vendor-delete") {
      const id = trigger.dataset.id;
      if (!id) return;
      if (!(await confirmModal("이 업체를 삭제하시겠습니까?"))) return;
      const result = await api.vendors.remove(id);
      if (!result.ok) {
        showToast(result.error, { kind: "error" });
        return;
      }
      showToast("삭제되었습니다.", { kind: "success" });
      await refresh();
    }
  };

  await refresh();
}

/** @param {() => Promise<void>} onCreated */
function openCreateVendorModal(onCreated) {
  openModal(buildVendorCreateFormHtml());
  const form = /** @type {HTMLFormElement} */ ($("#vendor-create-form"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitVendorCreate(form, onCreated);
  });
}

function buildVendorCreateFormHtml() {
  return html`
    <h3>새 업체</h3>
    <form id="vendor-create-form" class="form">
      <label><span>업체명 *</span><input name="name" required /></label>
      <div class="row">
        <label><span>전문분야</span><input name="specialty" placeholder="예: 도배, 마루" /></label>
        <label><span>평점 (0~5)</span><input name="rating" type="number" min="0" max="5" step="1" /></label>
      </div>
      <div class="row">
        <label><span>대표</span><input name="ceo" /></label>
        <label><span>전화</span><input name="phone" /></label>
      </div>
      <label><span>이메일</span><input name="email" type="email" /></label>
      <label><span>메모</span><textarea name="memo" rows="3"></textarea></label>
      <p class="error" id="vendor-error" hidden></p>
      <div class="form-actions">
        <button type="button" data-action="modal-close" class="ghost">취소</button>
        <button type="submit" class="primary">등록</button>
      </div>
    </form>
  `;
}

/** @param {HTMLFormElement} form @param {() => Promise<void>} onCreated */
async function submitVendorCreate(form, onCreated) {
  const fd = new FormData(form);
  const errEl = $("#vendor-error");
  errEl.setAttribute("hidden", "");
  const ratingStr = String(fd.get("rating") ?? "").trim();
  const rating = ratingStr === "" ? null : Number.parseInt(ratingStr, 10);
  const payload = {
    name: String(fd.get("name") ?? "").trim(),
    specialty: nullable(fd.get("specialty")),
    ceo: nullable(fd.get("ceo")),
    phone: nullable(fd.get("phone")),
    email: nullable(fd.get("email")),
    memo: nullable(fd.get("memo")),
    rating,
  };
  const result = await api.vendors.create(payload);
  if (!result.ok) {
    errEl.textContent = result.error;
    errEl.removeAttribute("hidden");
    return;
  }
  closeModal();
  showToast("업체가 등록되었습니다.", { kind: "success" });
  await onCreated();
}

/** @param {FormDataEntryValue | null} v */
function nullable(v) {
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** @param {import("../api.js").Vendor[]} vendors */
function renderVendorDirectory(vendors) {
  const specialties = new Set(vendors.map((v) => v.specialty).filter(Boolean));
  const rated = vendors.filter((v) => v.rating != null);
  const avgRating =
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
          <span>전문분야</span>
          <strong>${specialties.size}</strong>
        </div>
        <div class="vendor-stat">
          <span>평가 완료</span>
          <strong>${rated.length}</strong>
        </div>
        <div class="vendor-stat">
          <span>평균 평점</span>
          <strong>${avgRating}</strong>
        </div>
      </div>

      <div class="vendor-table-card">
        <table class="data-table vendor-table">
          <colgroup>
            <col class="vendor-col-name" />
            <col class="vendor-col-specialty" />
            <col class="vendor-col-contact" />
            <col class="vendor-col-email" />
            <col class="vendor-col-rating" />
            <col class="vendor-col-action" />
          </colgroup>
          <thead>
            <tr>
              <th>업체</th>
              <th>전문분야</th>
              <th>담당/전화</th>
              <th>이메일</th>
              <th>평점</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${vendors.map(renderVendorRow).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/** @param {import("../api.js").Vendor} vendor */
function renderVendorRow(vendor) {
  const accent = specialtyAccent(vendor.specialty);
  const subtitle = vendor.memo || (vendor.specialty ? `${vendor.specialty} 전문 업체` : "업체 정보 관리 중");

  return `
    <tr>
      <td>
        <div class="vendor-profile">
          <span class="vendor-avatar" style="--vendor-accent: ${accent}">${esc(initials(vendor.name))}</span>
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
          <span>${esc(vendor.phone || "전화 미입력")}</span>
        </div>
      </td>
      <td>${renderEmail(vendor.email)}</td>
      <td>${renderRating(vendor.rating)}</td>
      <td class="vendor-actions">
        <button class="ghost small vendor-delete-btn" data-action="vendor-delete" data-id="${esc(vendor.id)}" title="업체 삭제">
          ${iTrash({ size: 14 })}
          <span>삭제</span>
        </button>
      </td>
    </tr>
  `;
}

/** @param {string|null} specialty */
function renderSpecialty(specialty) {
  if (!specialty) return `<span class="vendor-specialty empty">미지정</span>`;
  return `<span class="vendor-specialty" style="--vendor-accent: ${specialtyAccent(specialty)}">${esc(specialty)}</span>`;
}

/** @param {string|null} email */
function renderEmail(email) {
  if (!email) return `<span class="vendor-muted">이메일 미입력</span>`;
  return `<a class="vendor-email" href="mailto:${esc(email)}">${esc(email)}</a>`;
}

/** @param {number|null} rating */
function renderRating(rating) {
  if (rating == null) return `<span class="vendor-rating empty">미평가</span>`;
  const score = Math.max(0, Math.min(5, Math.round(rating)));
  return `
    <span class="vendor-rating">
      <span class="vendor-stars" aria-label="평점 ${score}점">
        <span class="filled">${"★".repeat(score)}</span><span class="empty">${"★".repeat(5 - score)}</span>
      </span>
      <strong>${score}.0</strong>
    </span>
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
