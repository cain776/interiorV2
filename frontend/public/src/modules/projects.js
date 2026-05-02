import { $, html, esc } from "../dom.js";
import { api } from "../api.js";
import { openModal, closeModal } from "./modal.js";
import { showToast } from "./toast.js";

const STATUS_LABEL = {
  planning: "기획",
  in_progress: "진행중",
  done: "완료",
  archived: "보관",
};

/**
 * @param {HTMLElement} root
 * @param {(projectId: string) => void} onOpen
 * @param {(projectId: string) => void} [onOpenSpaces]
 * @param {(projectId: string) => void} [onOpenModels]
 * @param {(projectId: string) => void} [onOpenReviewMaterials]
 */
export async function renderProjectsPage(
  root,
  onOpen,
  onOpenSpaces,
  onOpenModels,
  onOpenReviewMaterials,
) {
  root.innerHTML = html`
    <section class="page projects-page">
      <header class="page-header">
        <h2>내 프로젝트</h2>
        <button data-action="project-create" class="primary">+ 새 프로젝트</button>
      </header>
      <div id="projects-list">
        <p class="muted">불러오는 중…</p>
      </div>
    </section>
  `;

  const listRoot = $("#projects-list", root);
  const refresh = () => refreshProjectsList(listRoot);
  bindProjectsPageActions(root, refresh, onOpen, onOpenSpaces, onOpenModels, onOpenReviewMaterials);
  await refresh();
}

/** @param {HTMLElement} listRoot */
async function refreshProjectsList(listRoot) {
  listRoot.innerHTML = html`<p class="muted">불러오는 중…</p>`;
  const result = await api.projects.list();
  if (!result.ok) {
    listRoot.innerHTML = html`<p class="error">${result.error}</p>`;
    return;
  }
  if (result.data.length === 0) {
    listRoot.innerHTML = html`
      <div class="empty-state">
        <p>아직 프로젝트가 없습니다.</p>
        <button data-action="project-create" class="primary">첫 프로젝트 만들기</button>
      </div>
    `;
    return;
  }
  listRoot.innerHTML = `<div class="grid project-grid">${result.data.map(renderProjectCard).join("")}</div>`;
}

/** @param {import("../api.js").Project} p */
function renderProjectCard(p) {
  return `
    <article class="card project-card" data-action="project-open" data-id="${esc(p.id)}">
      <header>
        <h3>${esc(p.name)}</h3>
        <span class="status status-${esc(p.status)}">${esc(STATUS_LABEL[p.status] ?? p.status)}</span>
      </header>
      ${p.address ? `<p class="muted">${esc(p.address)}</p>` : ""}
      <dl class="kv">
        ${p.sizeKr ? `<div><dt>평형</dt><dd>${esc(p.sizeKr)}평</dd></div>` : ""}
        ${p.totalBudget != null ? `<div><dt>예산</dt><dd>${esc(formatKrw(p.totalBudget))}</dd></div>` : ""}
        ${p.startDate ? `<div><dt>일정</dt><dd>${esc(p.startDate)} ~ ${esc(p.endDate ?? "")}</dd></div>` : ""}
      </dl>
      <div class="project-card-actions">
        <button type="button" class="compact-btn" data-action="project-open" data-id="${esc(p.id)}">견적 관리</button>
        <button type="button" class="compact-btn" data-action="project-open-spaces" data-id="${esc(p.id)}">공간 관리</button>
        <button type="button" class="compact-btn" data-action="project-open-models" data-id="${esc(p.id)}">3D 모델</button>
        <button type="button" class="compact-btn" data-action="project-open-review" data-id="${esc(p.id)}">참고자료</button>
      </div>
    </article>
  `;
}

/**
 * 화면 단위 액션 바인딩. root 재사용 시 핸들러 중복 등록을 막기 위해 onclick 덮어쓰기.
 * @param {HTMLElement} root @param {() => Promise<void>} refresh
 * @param {(projectId: string) => void} onOpen
 * @param {((projectId: string) => void) | undefined} onOpenSpaces
 * @param {((projectId: string) => void) | undefined} onOpenModels
 * @param {((projectId: string) => void) | undefined} onOpenReviewMaterials
 */
function bindProjectsPageActions(
  root,
  refresh,
  onOpen,
  onOpenSpaces,
  onOpenModels,
  onOpenReviewMaterials,
) {
  root.onclick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest("[data-action]");
    if (!(trigger instanceof HTMLElement)) return;
    const action = trigger.dataset.action;

    if (action === "project-create") {
      openCreateModal(refresh);
    } else if (action === "project-open") {
      const id = trigger.dataset.id;
      if (id) onOpen(id);
    } else if (action === "project-open-spaces") {
      const id = trigger.dataset.id;
      if (id) (onOpenSpaces ?? onOpen)(id);
    } else if (action === "project-open-models") {
      const id = trigger.dataset.id;
      if (id) (onOpenModels ?? onOpenSpaces ?? onOpen)(id);
    } else if (action === "project-open-review") {
      const id = trigger.dataset.id;
      if (id) (onOpenReviewMaterials ?? onOpen)(id);
    }
  };
}

/** @param {() => Promise<void>} onCreated */
function openCreateModal(onCreated) {
  openModal(buildProjectCreateFormHtml());
  const form = /** @type {HTMLFormElement} */ ($("#project-create-form"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitProjectCreate(form, onCreated);
  });
}

function buildProjectCreateFormHtml() {
  return html`
    <h3>새 프로젝트</h3>
    <form id="project-create-form" class="form">
      <label><span>이름 *</span><input name="name" required /></label>
      <label><span>주소</span><input name="address" /></label>
      <div class="row">
        <label><span>평형 (평)</span><input name="sizeKr" type="number" step="0.01" /></label>
        <label><span>총 예산 (원)</span><input name="totalBudget" type="number" step="100000" /></label>
      </div>
      <div class="row">
        <label><span>시작일</span><input name="startDate" type="date" /></label>
        <label><span>종료일</span><input name="endDate" type="date" /></label>
      </div>
      <p class="error" id="project-error" hidden></p>
      <div class="form-actions">
        <button type="button" data-action="modal-close" class="ghost">취소</button>
        <button type="submit" class="primary">만들기</button>
      </div>
    </form>
  `;
}

/** @param {HTMLFormElement} form @param {() => Promise<void>} onCreated */
async function submitProjectCreate(form, onCreated) {
  const fd = new FormData(form);
  const errEl = $("#project-error");
  errEl.setAttribute("hidden", "");
  const payload = {
    name: String(fd.get("name") ?? "").trim(),
    address: nullable(String(fd.get("address") ?? "")),
    sizeKr: nullableNumber(fd.get("sizeKr")),
    totalBudget: nullableInt(fd.get("totalBudget")),
    startDate: nullable(String(fd.get("startDate") ?? "")),
    endDate: nullable(String(fd.get("endDate") ?? "")),
  };
  const result = await api.projects.create(payload);
  if (!result.ok) {
    errEl.textContent = result.error;
    errEl.removeAttribute("hidden");
    return;
  }
  closeModal();
  showToast("프로젝트가 생성되었습니다.", { kind: "success" });
  await onCreated();
}

/** @param {string} v */
function nullable(v) {
  const t = v.trim();
  return t.length === 0 ? null : t;
}
/** @param {FormDataEntryValue | null} v */
function nullableNumber(v) {
  if (v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** @param {FormDataEntryValue | null} v */
function nullableInt(v) {
  const n = nullableNumber(v);
  return n === null ? null : Math.round(n);
}

/** @param {number} amount */
function formatKrw(amount) {
  return amount.toLocaleString("ko-KR") + "원";
}
