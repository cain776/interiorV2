// 좌/중앙 영역 모달: 고려사항, 공정, 공간, 항목 + 사이드바 reorder.

import { $, esc } from "../dom.js";
import { api } from "../api.js";
import { openModal, closeModal, confirmModal } from "./modal.js";
import { showToast } from "./toast.js";
import { nullable, nullableNumber, newId } from "./workspace-format.js";
import {
  currentPhase,
  currentSpace,
  selectedLineItem,
  lineItemsByPhase,
  visibleConsiderations,
  findConsiderationOwner,
  sortByOrder,
  moveInList,
  isWholeHomeSpaceId,
  lineItemSkuLabel,
} from "./workspace-selectors.js";
import { openEntityModal } from "./workspace-modal-helper.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").Consideration} Consideration */

// ===== 고려사항 =====

/** @type {Record<"normal"|"important"|"critical", string>} */
const CONSIDERATION_PRIORITY_LABEL = {
  normal: "일반",
  important: "중요",
  critical: "긴급",
};

/** @type {Array<"normal"|"important"|"critical">} */
const CONSIDERATION_PRIORITY_OPTIONS = ["normal", "important", "critical"];

/** @param {unknown} value @returns {"normal"|"important"|"critical"} */
function considerationPriority(value) {
  const text = String(value ?? "normal");
  return text === "important" || text === "critical" ? text : "normal";
}

/** @param {"normal"|"important"|"critical"|undefined} selected */
function priorityOptions(selected) {
  const selectedValue = selected ?? "normal";
  return CONSIDERATION_PRIORITY_OPTIONS
    .map((value) => `<option value="${esc(value)}" ${value === selectedValue ? "selected" : ""}>${esc(CONSIDERATION_PRIORITY_LABEL[value])}</option>`)
    .join("");
}

/** @param {WorkspaceState} s @param {string|null|undefined} selected */
function spaceOptions(s, selected) {
  const selectedValue = selected ?? "";
  return [
    `<option value="" ${selectedValue ? "" : "selected"}>전체 / 공간 미지정</option>`,
    ...s.bundle.spaces.map((space) => `<option value="${esc(space.id)}" ${space.id === selectedValue ? "selected" : ""}>${esc(space.name)}</option>`),
  ].join("");
}

/** @param {WorkspaceState} s @param {string|null|undefined} selected */
function lineItemOptions(s, selected) {
  const selectedValue = selected ?? "";
  return [
    `<option value="" ${selectedValue ? "" : "selected"}>연결 안 함</option>`,
    ...sortByOrder(s.bundle.lineItems).map((item) => {
      const label = lineItemSkuLabel(s, item) || item.label;
      return `<option value="${esc(item.id)}" data-space-id="${esc(item.spaceId ?? "")}" data-phase-id="${esc(item.phaseId)}" ${item.id === selectedValue ? "selected" : ""}>${esc(label)}</option>`;
    }),
  ].join("");
}

/**
 * @typedef ConsiderationModalDefaults
 * @property {string} initialSpaceId
 * @property {string} initialPhaseId
 * @property {string} initialLineItemId
 */

/**
 * 모달 진입 시 미리 채울 select 기본값 산출.
 * 현재 선택된 line item / phase / space 가 있으면 그걸 우선시.
 * @param {WorkspaceState} s @param {Consideration|null} current
 * @returns {ConsiderationModalDefaults}
 */
function resolveConsiderationDefaults(s, current) {
  const owner = current ? findConsiderationOwner(s, current.id) : null;
  const selectedItem = selectedLineItem(s);
  const linkedItem = current?.lineItemId
    ? s.bundle.lineItems.find((item) => item.id === current.lineItemId) ?? null
    : selectedItem;
  const initialSpaceId = current?.spaceId
    ?? linkedItem?.spaceId
    ?? (s.tab === "spaces" && !isWholeHomeSpaceId(s.selectedSpaceId) ? s.selectedSpaceId : "")
    ?? "";
  const initialPhaseId = owner?.type === "phase"
    ? owner.phase.id
    : linkedItem?.phaseId ?? currentPhase(s)?.id ?? s.bundle.phases[0]?.id ?? "";
  const initialLineItemId = current?.lineItemId ?? selectedItem?.id ?? "";
  return { initialSpaceId, initialPhaseId, initialLineItemId };
}

/** @param {WorkspaceState} s @param {Consideration|null} current @param {ConsiderationModalDefaults} d */
function buildConsiderationModalHtml(s, current, d) {
  return `
    <h3>${current ? "고려사항 수정" : "고려사항 추가"}</h3>
    <form id="consideration-form" class="form compact-form">
      <label><span>내용 *</span><input name="label" required value="${esc(current?.label ?? "")}" placeholder="예: 실측 재확인" /></label>
      <label><span>공간</span><select name="spaceId">${spaceOptions(s, d.initialSpaceId)}</select></label>
      <label><span>위치 / 항목</span><select name="lineItemId">${lineItemOptions(s, d.initialLineItemId)}</select></label>
      <label><span>공정 *</span><select name="phaseId" required>${s.bundle.phases.map((phase) => `<option value="${esc(phase.id)}" ${phase.id === d.initialPhaseId ? "selected" : ""}>${esc(phase.name)}</option>`).join("")}</select></label>
      <label><span>중요도</span><select name="priority">${priorityOptions(current?.priority ?? "normal")}</select></label>
      <label><span>메모</span><textarea name="note" rows="3">${esc(current?.note ?? "")}</textarea></label>
      <p class="error" id="consideration-error" hidden></p>
      <div class="form-actions"><button type="button" data-action="modal-close" class="ghost">취소</button><button type="submit" class="primary">${current ? "수정" : "추가"}</button></div>
    </form>
  `;
}

/**
 * lineItem ↔ space ↔ phase select 의 의존 동기화.
 * @param {HTMLFormElement} form
 */
function bindConsiderationFormSelects(form) {
  const spaceSelect = /** @type {HTMLSelectElement | null} */ (form.querySelector("select[name='spaceId']"));
  const lineItemSelect = /** @type {HTMLSelectElement | null} */ (form.querySelector("select[name='lineItemId']"));
  const phaseSelect = /** @type {HTMLSelectElement | null} */ (form.querySelector("select[name='phaseId']"));
  lineItemSelect?.addEventListener("change", () => {
    const option = lineItemSelect.selectedOptions[0];
    if (!option) return;
    if (spaceSelect) spaceSelect.value = option.dataset.spaceId ?? "";
    if (phaseSelect && option.dataset.phaseId) phaseSelect.value = option.dataset.phaseId;
  });
  spaceSelect?.addEventListener("change", () => {
    const option = lineItemSelect?.selectedOptions[0];
    if (lineItemSelect && option && option.value && option.dataset.spaceId !== spaceSelect.value) {
      lineItemSelect.value = "";
    }
  });
}

/** @param {WorkspaceState} s @param {string|null} id @param {() => void} render */
export function openConsiderationModal(s, id, render) {
  const current = id ? visibleConsiderations(s).find((item) => item.id === id) ?? null : null;
  const defaults = resolveConsiderationDefaults(s, current);
  openModal(buildConsiderationModalHtml(s, current, defaults));
  const form = /** @type {HTMLFormElement} */ ($("#consideration-form"));
  bindConsiderationFormSelects(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const lineItemId = nullable(fd.get("lineItemId"));
    const lineItem = lineItemId ? s.bundle.lineItems.find((item) => item.id === lineItemId) ?? null : null;
    const targetPhaseId = lineItem?.phaseId ?? String(fd.get("phaseId") || defaults.initialPhaseId);
    const payload = {
      label: String(fd.get("label") ?? "").trim(),
      note: nullable(fd.get("note")),
      spaceId: lineItem?.spaceId ?? nullable(fd.get("spaceId")),
      lineItemId,
      priority: considerationPriority(fd.get("priority")),
    };
    if (!payload.label) return;
    if (!targetPhaseId) return showConsiderationError("공정을 선택해 주세요.");
    const error = current
      ? await updateConsideration(s, current.id, payload, render, targetPhaseId)
      : await addConsideration(s, payload, targetPhaseId, render);
    if (error) return showConsiderationError(error);
    closeModal();
  });
}

/** @param {string} message */
function showConsiderationError(message) {
  const errEl = $("#consideration-error");
  errEl.textContent = message;
  errEl.removeAttribute("hidden");
}

/** @param {WorkspaceState} s @param {{label:string,note:string|null,spaceId:string|null,lineItemId:string|null,priority:"normal"|"important"|"critical"}} payload @param {string} phaseId @param {() => void} render */
async function addConsideration(s, payload, phaseId, render) {
  /** @type {Consideration} */
  const item = { id: newId("consideration"), label: payload.label, note: payload.note, spaceId: payload.spaceId, lineItemId: payload.lineItemId, priority: payload.priority, source: "custom", checked: false };
  const targetPhase = s.bundle.phases.find((phase) => phase.id === phaseId) ?? null;

  if (targetPhase) {
    return savePhaseConsiderations(s, targetPhase.id, [...targetPhase.considerations, item], render);
  }

  return "저장할 공정을 찾을 수 없습니다.";
}

/** @param {WorkspaceState} s @param {string} id @param {Partial<Consideration>} patch @param {() => void} render @param {string} [targetPhaseId] */
export async function updateConsideration(s, id, patch, render, targetPhaseId) {
  const owner = findConsiderationOwner(s, id);
  if (!owner) return "수정할 고려사항을 찾을 수 없습니다.";
  if (owner.type === "phase") {
    if (targetPhaseId && targetPhaseId !== owner.phase.id) {
      const targetPhase = s.bundle.phases.find((phase) => phase.id === targetPhaseId) ?? null;
      if (!targetPhase) return "이동할 공정을 찾을 수 없습니다.";
      const current = owner.phase.considerations[owner.index];
      const nextItem = { ...current, ...patch };
      const removeError = await persistPhaseConsiderations(s, owner.phase.id, owner.phase.considerations.filter((item) => item.id !== id));
      if (removeError) return removeError;
      const latestTarget = s.bundle.phases.find((phase) => phase.id === targetPhaseId) ?? targetPhase;
      const addError = await persistPhaseConsiderations(s, targetPhaseId, [...latestTarget.considerations, nextItem]);
      if (addError) return addError;
      render();
      return undefined;
    }
    const next = owner.phase.considerations.map((item) => (item.id === id ? { ...item, ...patch } : item));
    return savePhaseConsiderations(s, owner.phase.id, next, render);
  }
  if (targetPhaseId) {
    const targetPhase = s.bundle.phases.find((phase) => phase.id === targetPhaseId) ?? null;
    if (!targetPhase) return "이동할 공정을 찾을 수 없습니다.";
    const current = owner.items[owner.index];
    const nextItem = { ...current, ...patch };
    const error = await persistPhaseConsiderations(s, targetPhaseId, [...targetPhase.considerations, nextItem]);
    if (error) return error;
    s.customConsiderationsByContext[owner.key] = owner.items.filter((item) => item.id !== id);
    render();
    return undefined;
  }
  s.customConsiderationsByContext[owner.key] = owner.items.map((item) => (item.id === id ? { ...item, ...patch } : item));
  render();
  return undefined;
}

/** @param {WorkspaceState} s @param {string} id @param {string|undefined} direction @param {() => void} render */
export async function moveConsideration(s, id, direction, render) {
  if (direction !== "up" && direction !== "down") return;
  const owner = findConsiderationOwner(s, id);
  if (!owner) return;
  if (owner.type === "phase") {
    await savePhaseConsiderations(s, owner.phase.id, moveInList(owner.phase.considerations, owner.index, direction), render);
    return;
  }
  s.customConsiderationsByContext[owner.key] = moveInList(owner.items, owner.index, direction);
  render();
}

/** @param {WorkspaceState} s @param {string} id @param {() => void} render */
export async function deleteConsideration(s, id, render) {
  if (!(await confirmModal("고려사항을 삭제할까요?"))) return;
  const owner = findConsiderationOwner(s, id);
  if (!owner) return;
  if (owner.type === "phase") {
    await savePhaseConsiderations(s, owner.phase.id, owner.phase.considerations.filter((item) => item.id !== id), render);
    return;
  }
  s.customConsiderationsByContext[owner.key] = owner.items.filter((item) => item.id !== id);
  render();
}

/** @param {WorkspaceState} s @param {string} phaseId @param {Consideration[]} considerations @param {() => void} render */
async function savePhaseConsiderations(s, phaseId, considerations, render) {
  const error = await persistPhaseConsiderations(s, phaseId, considerations);
  if (error) return error;
  render();
  return undefined;
}

/** @param {WorkspaceState} s @param {string} phaseId @param {Consideration[]} considerations */
async function persistPhaseConsiderations(s, phaseId, considerations) {
  // 백엔드 schema 가 additionalProperties: false 라 객체에 미정의 필드가 섞여 있으면
  // PATCH 가 400 으로 거부됨. 보내기 전에 알려진 필드만 추출.
  const sanitized = considerations.map((c) => ({
    id: c.id,
    label: c.label,
    source: c.source,
    checked: c.checked,
    note: c.note ?? null,
    spaceId: c.spaceId ?? null,
    lineItemId: c.lineItemId ?? null,
    priority: c.priority ?? "normal",
  }));
  const result = await api.phases.update(phaseId, { considerations: sanitized });
  if (!result.ok) return result.error;
  s.bundle.phases = s.bundle.phases.map((phase) => (phase.id === phaseId ? result.data : phase));
  return undefined;
}

// ===== 공정 / 공간 + 사이드바 reorder =====

/** @param {WorkspaceState} s @param {boolean} isEdit @param {() => Promise<void>} reload */
export function openPhaseModal(s, isEdit, reload) {
  const phase = isEdit ? currentPhase(s) : null;
  if (isEdit && !phase) return;
  openEntityModal({
    title: isEdit ? "공정 수정" : "공정 추가",
    fields: `<label><span>공정명 *</span><input name="name" required value="${esc(phase?.name ?? "")}" placeholder="예: 조명" /></label>`,
    submitText: isEdit ? "수정" : "추가",
    onSubmit: async (fd) => {
      const name = String(fd.get("name") ?? "").trim();
      if (!name) return "공정명은 필수입니다.";
      const result = isEdit && phase ? await api.phases.update(phase.id, { name }) : await api.phases.create(s.bundle.project.id, { name, considerations: [] });
      if (!result.ok) return result.error;
      await reload();
      return undefined;
    },
  });
}

/** @param {WorkspaceState} s @param {() => Promise<void>} reload */
export async function deleteSelectedPhase(s, reload) {
  const phase = currentPhase(s);
  if (!phase) return;
  if (!(await confirmModal("공정을 삭제할까요? 하위 항목과 견적도 함께 삭제됩니다."))) return;
  const result = await api.phases.remove(phase.id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast("공정이 삭제되었습니다.", { kind: "success" });
  await reload();
}

/** @param {WorkspaceState} s @param {boolean} isEdit @param {() => Promise<void>} reload */
export function openSpaceModal(s, isEdit, reload) {
  const space = isEdit ? currentSpace(s) : null;
  if (isEdit && isWholeHomeSpaceId(space?.id)) return;
  if (isEdit && !space) return;
  openEntityModal({
    title: isEdit ? "공간 수정" : "공간 추가",
    fields: `
      <label><span>공간명 *</span><input name="name" required value="${esc(space?.name ?? "")}" placeholder="예: 드레스룸" /></label>
      <label><span>면적 (㎡)</span><input name="areaSqm" type="number" min="0" step="0.01" value="${esc(space?.areaSqm ?? "")}" /></label>
    `,
    submitText: isEdit ? "수정" : "추가",
    onSubmit: async (fd) => {
      const name = String(fd.get("name") ?? "").trim();
      if (!name) return "공간명은 필수입니다.";
      const result = isEdit && space
        ? await api.spaces.update(space.id, { name, areaSqm: nullableNumber(fd.get("areaSqm")) })
        : await api.spaces.create(s.bundle.project.id, { name, areaSqm: nullableNumber(fd.get("areaSqm")) });
      if (!result.ok) return result.error;
      await reload();
      return undefined;
    },
  });
}

/** @param {WorkspaceState} s @param {() => Promise<void>} reload */
export async function deleteSelectedSpace(s, reload) {
  const space = currentSpace(s);
  if (!space) return;
  if (isWholeHomeSpaceId(space.id)) return;
  if (!(await confirmModal("공간을 삭제할까요? 항목의 공간 연결은 해제됩니다."))) return;
  const result = await api.spaces.remove(space.id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast("공간이 삭제되었습니다.", { kind: "success" });
  await reload();
}

/** @param {WorkspaceState} s @param {string|undefined} direction @param {() => void} render */
export async function moveSidebar(s, direction, render) {
  if (direction !== "up" && direction !== "down") return;
  if (s.tab === "phases") {
    const items = sortByOrder(s.bundle.phases);
    const index = items.findIndex((item) => item.id === s.selectedPhaseId);
    const result = await api.phases.reorder(s.bundle.project.id, moveInList(items, index, direction).map((item) => item.id));
    if (!result.ok) return showToast(result.error, { kind: "error" });
    s.bundle.phases = result.data;
  } else {
    if (isWholeHomeSpaceId(s.selectedSpaceId)) return;
    const items = sortByOrder(s.bundle.spaces);
    const index = items.findIndex((item) => item.id === s.selectedSpaceId);
    const result = await api.spaces.reorder(s.bundle.project.id, moveInList(items, index, direction).map((item) => item.id));
    if (!result.ok) return showToast(result.error, { kind: "error" });
    s.bundle.spaces = result.data;
  }
  render();
}

// ===== 위치 / 항목 =====

const DETAIL_LOCATION_OPTIONS = [
  "공통",
  "바닥",
  "벽",
  "벽/바닥",
  "천장",
  "창호",
  "문",
  "설비",
  "전기",
  "가구",
];

const WORK_ITEM_OPTIONS = [
  "타일",
  "마루",
  "방수",
  "방수/타일",
  "도배",
  "필름",
  "도장",
  "창호교체",
  "고정창",
  "분합문",
  "터닝도어",
  "방충망",
  "위생기구",
  "가구",
  "수납/가구",
  "식기",
  "식기세척기",
  "도기",
  "상판",
  "싱크볼",
  "식탁",
  "가전",
  "후드",
  "후드/덕트",
  "조명",
  "전기",
  "급배수",
  "배관",
  "가스라인",
  "보일러/세탁라인",
  "철거",
  "마감",
  "단차마감",
  "중문",
  "문/문틀",
  "파티션",
  "빨래건조대",
  "천장",
  "기타",
];

/** @param {string[]} values @param {string|null|undefined} selected @param {string} emptyLabel */
function selectOptions(values, selected, emptyLabel) {
  const selectedValue = selected ?? "";
  const all = selectedValue && !values.includes(selectedValue) ? [selectedValue, ...values] : values;
  return [
    `<option value="">${esc(emptyLabel)}</option>`,
    ...all.map((value) => `<option value="${esc(value)}" ${value === selectedValue ? "selected" : ""}>${esc(value)}</option>`),
  ].join("");
}

/** @param {WorkspaceState} s @param {boolean} isEdit @param {() => Promise<void>} reload */
export function openLineItemModal(s, isEdit, reload) {
  const item = isEdit ? selectedLineItem(s) : null;
  if (isEdit && !item) return;
  const phaseId = item?.phaseId ?? currentPhase(s)?.id ?? s.bundle.phases[0]?.id ?? "";
  const wholeHomeSelected = s.tab === "spaces" && isWholeHomeSpaceId(s.selectedSpaceId);
  const spaceId = item?.spaceId ?? (s.tab === "spaces" && !wholeHomeSelected ? s.selectedSpaceId ?? "" : "");
  const spaceOptions = [
    `<option value="" ${spaceId ? "" : "selected"}>전체 / 공간 미지정</option>`,
    ...s.bundle.spaces.map((sp) => `<option value="${esc(sp.id)}" ${sp.id === spaceId ? "selected" : ""}>${esc(sp.name)}</option>`),
  ].join("");
  openEntityModal({
    title: isEdit ? "위치 / 항목 수정" : "위치 / 항목 추가",
    size: "compact",
    fields: `
      <label><span>표시명</span><input name="label" value="${esc(item?.label ?? "")}" placeholder="예: 현관 바닥 타일" /></label>
      <label><span>위치</span><select name="spaceId">${spaceOptions}</select></label>
      <label><span>세부 위치</span><select name="locationLabel">${selectOptions(DETAIL_LOCATION_OPTIONS, item?.locationLabel, "선택 안 함")}</select></label>
      <label><span>항목</span><select name="workItemLabel">${selectOptions(WORK_ITEM_OPTIONS, item?.workItemLabel, "선택 안 함")}</select></label>
      <label><span>공정 *</span><select name="phaseId">${s.bundle.phases.map((p) => `<option value="${esc(p.id)}" ${p.id === phaseId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <label><span>메모</span><textarea name="memo" rows="3" placeholder="실측, 옵션, 주의사항">${esc(item?.memo ?? "")}</textarea></label>
    `,
    submitText: isEdit ? "수정" : "추가",
    onSubmit: async (fd) => {
      const locationLabel = nullable(fd.get("locationLabel"));
      const workItemLabel = nullable(fd.get("workItemLabel"));
      const nextSpaceId = nullable(fd.get("spaceId"));
      const nextPhaseId = String(fd.get("phaseId") || phaseId);
      const spaceName = nextSpaceId
        ? s.bundle.spaces.find((sp) => sp.id === nextSpaceId)?.name ?? null
        : "전체";
      const label = String(fd.get("label") ?? "").trim()
        || [spaceName, locationLabel, workItemLabel].filter(Boolean).join(" ")
        || "";
      if (!label) return "표시명 또는 위치/항목 중 하나는 필요합니다.";
      const payload = {
        phaseId: nextPhaseId,
        label,
        spaceId: nextSpaceId,
        locationLabel,
        workItemLabel,
        memo: nullable(fd.get("memo")),
      };
      const result = isEdit && item
        ? await api.lineItems.update(item.id, payload)
        : await api.lineItems.create(nextPhaseId, payload);
      if (!result.ok) return result.error;
      await reload();
      return undefined;
    },
  });
}

/** @param {WorkspaceState} s @param {() => Promise<void>} reload */
export async function deleteSelectedLineItem(s, reload) {
  const item = selectedLineItem(s);
  if (!item) return;
  if (!(await confirmModal("위치/항목과 관련 견적을 모두 삭제할까요?"))) return;
  const result = await api.lineItems.remove(item.id);
  if (!result.ok) return showToast(result.error, { kind: "error" });
  showToast("항목이 삭제되었습니다.", { kind: "success" });
  await reload();
}

/** @param {WorkspaceState} s @param {string|undefined} direction @param {() => void} render */
export async function moveLineItem(s, direction, render) {
  if (direction !== "up" && direction !== "down") return;
  const item = selectedLineItem(s);
  if (!item) return;
  const siblings = lineItemsByPhase(s, item.phaseId);
  const moved = moveInList(siblings, siblings.findIndex((li) => li.id === item.id), direction);
  const result = await api.lineItems.reorder(item.phaseId, moved.map((li) => li.id));
  if (!result.ok) return showToast(result.error, { kind: "error" });
  const updated = new Map(result.data.map((li) => [li.id, li]));
  s.bundle.lineItems = s.bundle.lineItems.map((li) => updated.get(li.id) ?? li);
  render();
}
