// 프로젝트 참고자료 모달.
// V1 의 검토자료 관리 흐름을 바닐라 JS 모달로 옮긴다.

import { $, esc } from "../dom.js";
import { api } from "../api.js";
import { openModal } from "./modal.js";
import { showToast } from "./toast.js";
import {
  iArrowDown,
  iArrowUp,
  iClipboardList,
  iExternalLink,
  iPencil,
  iPlus,
  iTrash,
} from "./icons.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").ReviewMaterial} ReviewMaterial */

/**
 * @param {WorkspaceState} state
 * @param {() => void} renderWorkspace
 */
export function openReviewMaterialsModal(state, renderWorkspace) {
  state.menuOpen = false;
  renderWorkspace();

  /** @type {string|null} */
  let editingId = null;
  let editorOpen = false;
  let busy = false;
  /** @type {string|null} */
  let draggedId = null;
  /** @type {HTMLElement|null} */
  let dropTarget = null;
  /** @type {"before"|"after"|null} */
  let dropPosition = null;
  let suppressClickUntil = 0;

  const render = () => {
    const materials = sortedMaterials(state.bundle.reviewMaterials);
    const editingMaterial = editingId
      ? materials.find((material) => material.id === editingId) ?? null
      : null;

    openModal(
      `
        <h3>참고자료</h3>
        <div class="review-materials-dialog">
          <div class="review-materials-summary">
            <strong>${materials.length}개 자료</strong>
            <span>텍스트와 링크로 프로젝트 참고자료를 관리합니다.</span>
          </div>
          ${editorOpen ? renderEditor(editingMaterial) : ""}
          <div class="review-materials-list">
            ${materials.length > 0 ? materials.map((material, index) => renderMaterial(material, index, materials.length, busy)).join("") : renderEmpty()}
          </div>
          <div class="review-materials-footer">
            <button type="button" class="ghost" data-action="modal-close">닫기</button>
            <button type="button" class="primary" data-rm-action="add" ${busy ? "disabled" : ""}>${iPlus({ size: 13 })}<span>링크 추가</span></button>
          </div>
        </div>
      `,
      { iconHtml: iClipboardList({ size: 14 }) },
    );
    bindModalEvents();
  };

  function bindModalEvents() {
    const card = $("#modal-card");
    card.onclick = (event) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest("[data-rm-action]");
      if (!(trigger instanceof HTMLElement) || !card.contains(trigger)) return;
      event.preventDefault();
      void handleReviewMaterialAction(trigger);
    };

    const form = card.querySelector("#review-material-form");
    if (form instanceof HTMLFormElement) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitEditor(form);
      });
    }
    bindDragEvents(card);
  }

  /** @param {HTMLElement} trigger */
  async function handleReviewMaterialAction(trigger) {
    if (busy) return;
    const action = trigger.dataset.rmAction;
    const id = trigger.dataset.id ?? null;
    if (action === "add") {
      editingId = null;
      editorOpen = true;
      render();
      return;
    }
    if (action === "edit" && id) {
      editingId = id;
      editorOpen = true;
      render();
      return;
    }
    if (action === "cancel-editor") {
      editingId = null;
      editorOpen = false;
      render();
      return;
    }
    if (action === "open" && id) {
      const material = state.bundle.reviewMaterials.find((item) => item.id === id);
      if (material) window.open(material.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "move" && id) {
      await moveMaterial(id, trigger.dataset.direction);
      return;
    }
    if (action === "delete" && id) {
      await deleteMaterial(id);
    }
  }

  /** @param {HTMLFormElement} form */
  async function submitEditor(form) {
    if (busy) return;
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "").trim();
    const url = String(fd.get("url") ?? "").trim();
    const sourceInput = String(fd.get("source") ?? "").trim();
    const memoInput = String(fd.get("memo") ?? "").trim();

    if (!title || !url) {
      showFormError("자료명과 링크를 입력해주세요.");
      return;
    }
    if (!isValidUrl(url)) {
      showFormError("링크 형식을 확인해주세요.");
      return;
    }

    const payload = {
      title,
      url,
      source: sourceInput || sourceFromUrl(url),
      memo: memoInput || null,
    };

    busy = true;
    const result = editingId
      ? await api.reviewMaterials.update(editingId, payload)
      : await api.reviewMaterials.create(state.bundle.project.id, payload);
    busy = false;

    if (!result.ok) {
      showFormError(result.error);
      return;
    }

    if (editingId) {
      state.bundle.reviewMaterials = sortedMaterials(
        state.bundle.reviewMaterials.map((material) =>
          material.id === result.data.id ? result.data : material,
        ),
      );
      showToast("참고자료를 수정했습니다.", { kind: "success" });
    } else {
      state.bundle.reviewMaterials = sortedMaterials([...state.bundle.reviewMaterials, result.data]);
      showToast("참고자료를 추가했습니다.", { kind: "success" });
    }

    editingId = null;
    editorOpen = false;
    render();
  }

  /**
   * @param {string} id
   * @param {string|undefined} direction
   */
  async function moveMaterial(id, direction) {
    if (direction !== "up" && direction !== "down") return;
    const current = sortedMaterials(state.bundle.reviewMaterials);
    const index = current.findIndex((material) => material.id === id);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;

    const moved = [...current];
    [moved[index], moved[nextIndex]] = [moved[nextIndex], moved[index]];
    state.bundle.reviewMaterials = moved.map((material, order) => ({
      ...material,
      sortOrder: order,
    }));
    busy = true;
    render();
    const result = await api.reviewMaterials.reorder(state.bundle.project.id, moved.map((material) => material.id));
    busy = false;
    if (!result.ok) {
      state.bundle.reviewMaterials = current;
      showToast(result.error, { kind: "error" });
      render();
      return;
    }
    state.bundle.reviewMaterials = result.data;
    render();
  }

  /**
   * @param {string} sourceId
   * @param {string} targetId
   * @param {"before"|"after"} position
   */
  async function moveMaterialByDrop(sourceId, targetId, position) {
    const current = sortedMaterials(state.bundle.reviewMaterials);
    const moved = moveByDrop(current, sourceId, targetId, position);
    if (moved === current) return;

    state.bundle.reviewMaterials = moved.map((material, order) => ({
      ...material,
      sortOrder: order,
    }));
    busy = true;
    render();
    const result = await api.reviewMaterials.reorder(state.bundle.project.id, moved.map((material) => material.id));
    busy = false;
    if (!result.ok) {
      state.bundle.reviewMaterials = current;
      showToast(result.error, { kind: "error" });
      render();
      return;
    }
    state.bundle.reviewMaterials = result.data;
    render();
  }

  /** @param {string} id */
  async function deleteMaterial(id) {
    if (!window.confirm("참고자료를 삭제할까요?")) return;
    busy = true;
    const result = await api.reviewMaterials.remove(id);
    busy = false;
    if (!result.ok) {
      showToast(result.error, { kind: "error" });
      render();
      return;
    }
    state.bundle.reviewMaterials = state.bundle.reviewMaterials.filter((material) => material.id !== id);
    if (editingId === id) {
      editingId = null;
      editorOpen = false;
    }
    showToast("참고자료를 삭제했습니다.", { kind: "success" });
    render();
  }

  /** @param {string} message */
  function showFormError(message) {
    const errorEl = $("#review-material-error");
    errorEl.textContent = message;
    errorEl.removeAttribute("hidden");
  }

  /** @param {HTMLElement} card */
  function bindDragEvents(card) {
    card.ondragstart = (event) => {
      if (busy) return;
      const handle = dragHandleFromEvent(card, event.target);
      const id = handle?.dataset.id ?? null;
      if (!handle || !id || !event.dataTransfer) return;
      const item = materialItemById(card, id);
      draggedId = id;
      item?.classList.add("is-dragging");
      if (item) setDragImage(event, item);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    };

    card.ondragover = (event) => {
      if (!draggedId) return;
      const item = materialItemFromEvent(card, event.target);
      const targetId = item?.dataset.id ?? null;
      if (!item || !targetId || targetId === draggedId) {
        setDropTarget(null, null);
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setDropTarget(item, dropPositionFromEvent(event, item));
    };

    card.ondragleave = (event) => {
      if (!dropTarget || event.relatedTarget instanceof Node && dropTarget.contains(event.relatedTarget)) return;
      const item = materialItemFromEvent(card, event.target);
      if (item === dropTarget) setDropTarget(null, null);
    };

    card.ondrop = (event) => {
      const sourceId = draggedId ?? event.dataTransfer?.getData("text/plain") ?? null;
      const item = materialItemFromEvent(card, event.target);
      const targetId = item?.dataset.id ?? null;
      if (!sourceId || !item || !targetId || sourceId === targetId) {
        clearDragState(card);
        return;
      }
      event.preventDefault();
      const position = dropPositionFromEvent(event, item);
      suppressDragClick();
      clearDragState(card);
      void moveMaterialByDrop(sourceId, targetId, position);
    };

    card.ondragend = () => {
      if (draggedId) suppressDragClick();
      clearDragState(card);
    };
  }

  /**
   * @param {HTMLElement|null} item
   * @param {"before"|"after"|null} position
   */
  function setDropTarget(item, position) {
    if (dropTarget === item && dropPosition === position) return;
    dropTarget?.classList.remove("is-drop-before", "is-drop-after");
    dropTarget = item;
    dropPosition = position;
    if (dropTarget && dropPosition) dropTarget.classList.add(`is-drop-${dropPosition}`);
  }

  /** @param {HTMLElement} card */
  function clearDragState(card) {
    card.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after").forEach((item) => {
      item.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    });
    draggedId = null;
    dropTarget = null;
    dropPosition = null;
  }

  function suppressDragClick() {
    suppressClickUntil = Date.now() + 250;
  }

  render();
}

/** @param {ReviewMaterial[]} materials */
function sortedMaterials(materials) {
  return [...materials].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

/** @param {ReviewMaterial|null} material */
function renderEditor(material) {
  const isEdit = Boolean(material);
  return `
    <form id="review-material-form" class="review-material-editor">
      <div class="review-material-editor-title">
        ${isEdit ? iPencil({ size: 14 }) : iPlus({ size: 14 })}
        <span>${isEdit ? "참고자료 수정" : "참고자료 추가"}</span>
      </div>
      <label>
        <span>자료명</span>
        <input name="title" value="${esc(material?.title ?? "")}" maxlength="300" required placeholder="네이버 블로그 참고자료" />
      </label>
      <label>
        <span>링크</span>
        <input name="url" value="${esc(material?.url ?? "")}" maxlength="2000" required placeholder="https://blog.naver.com/..." />
      </label>
      <div class="row">
        <label>
          <span>출처</span>
          <input name="source" value="${esc(material?.source ?? "")}" maxlength="100" placeholder="blog.naver.com" />
        </label>
        <label>
          <span>메모</span>
          <input name="memo" value="${esc(material?.memo ?? "")}" maxlength="5000" />
        </label>
      </div>
      <p class="error" id="review-material-error" hidden></p>
      <div class="review-material-editor-actions">
        <button type="button" class="ghost" data-rm-action="cancel-editor">취소</button>
        <button type="submit" class="primary">${isEdit ? iPencil({ size: 13 }) : iPlus({ size: 13 })}<span>${isEdit ? "수정" : "추가"}</span></button>
      </div>
    </form>
  `;
}

/**
 * @param {ReviewMaterial} material
 * @param {number} index
 * @param {number} count
 * @param {boolean} busy
 */
function renderMaterial(material, index, count, busy) {
  return `
    <article class="review-material-item" data-drop-kind="review-material" data-id="${esc(material.id)}">
      <button type="button" class="review-material-drag" draggable="${busy ? "false" : "true"}" data-id="${esc(material.id)}" ${busy ? "disabled" : ""} title="드래그해서 순서 변경" aria-label="${esc(material.title)} 순서 변경">
        ${iExternalLink({ size: 15 })}
      </button>
      <button type="button" class="review-material-main" data-rm-action="open" data-id="${esc(material.id)}" title="새 창에서 열기">
        <span class="review-material-copy">
          <strong>${esc(material.title)}</strong>
          <span class="review-material-url">${esc(material.url)}</span>
        </span>
      </button>
      <div class="review-material-actions">
        <button type="button" class="icon-btn" data-rm-action="move" data-direction="up" data-id="${esc(material.id)}" ${index === 0 || busy ? "disabled" : ""} title="위로">${iArrowUp({ size: 14 })}</button>
        <button type="button" class="icon-btn" data-rm-action="move" data-direction="down" data-id="${esc(material.id)}" ${index === count - 1 || busy ? "disabled" : ""} title="아래로">${iArrowDown({ size: 14 })}</button>
        <button type="button" class="icon-btn" data-rm-action="edit" data-id="${esc(material.id)}" ${busy ? "disabled" : ""} title="수정">${iPencil({ size: 14 })}</button>
        <button type="button" class="icon-btn danger" data-rm-action="delete" data-id="${esc(material.id)}" ${busy ? "disabled" : ""} title="삭제">${iTrash({ size: 14 })}</button>
      </div>
    </article>
  `;
}

function renderEmpty() {
  return `<div class="review-materials-empty">등록된 참고자료가 없습니다.</div>`;
}

/**
 * @param {HTMLElement} root
 * @param {EventTarget|null} target
 * @returns {HTMLElement|null}
 */
function dragHandleFromEvent(root, target) {
  if (!(target instanceof Element)) return null;
  const handle = target.closest(".review-material-drag[data-id]");
  return handle instanceof HTMLElement && root.contains(handle) ? handle : null;
}

/**
 * @param {HTMLElement} root
 * @param {EventTarget|null} target
 * @returns {HTMLElement|null}
 */
function materialItemFromEvent(root, target) {
  if (!(target instanceof Element)) return null;
  const item = target.closest('.review-material-item[data-drop-kind="review-material"][data-id]');
  return item instanceof HTMLElement && root.contains(item) ? item : null;
}

/**
 * @param {HTMLElement} root
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function materialItemById(root, id) {
  const items = root.querySelectorAll('.review-material-item[data-drop-kind="review-material"][data-id]');
  return /** @type {HTMLElement|null} */ (
    [...items].find((item) => item instanceof HTMLElement && item.dataset.id === id) ?? null
  );
}

/** @param {DragEvent} event @param {HTMLElement} item */
function setDragImage(event, item) {
  if (!event.dataTransfer) return;
  const rect = item.getBoundingClientRect();
  const offsetX = clamp(event.clientX - rect.left, 0, rect.width);
  const offsetY = clamp(event.clientY - rect.top, 0, rect.height);
  event.dataTransfer.setDragImage(item, offsetX, offsetY);
}

/** @param {DragEvent} event @param {HTMLElement} item @returns {"before"|"after"} */
function dropPositionFromEvent(event, item) {
  const rect = item.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * @param {ReviewMaterial[]} items
 * @param {string} sourceId
 * @param {string} targetId
 * @param {"before"|"after"} position
 */
function moveByDrop(items, sourceId, targetId, position) {
  const source = items.find((item) => item.id === sourceId);
  if (!source || sourceId === targetId) return items;
  const withoutSource = items.filter((item) => item.id !== sourceId);
  const targetIndex = withoutSource.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return items;
  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  const next = [...withoutSource];
  next.splice(insertIndex, 0, source);
  return sameOrder(items, next) ? items : next;
}

/**
 * @param {ReviewMaterial[]} a
 * @param {ReviewMaterial[]} b
 */
function sameOrder(a, b) {
  return a.length === b.length && a.every((item, index) => item.id === b[index]?.id);
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** @param {string} url */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} url */
function sourceFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
