// 워크스페이스 드래그 정렬.
// - 사진: 카드 전체를 드래그해서 두 사진을 교체
// - 라벨/행: ⋮⋮ 핸들을 드래그해서 target 앞/뒤로 삽입

import {
  reorderConsideration,
  reorderLineItem,
  reorderSidebarItem,
  swapPhotos,
} from "./workspace-modals.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {"sidebar"|"line-item"|"consideration"} DragKind */
/** @typedef {"before"|"after"} DropPosition */

let suppressClickUntil = 0;

/**
 * @param {HTMLElement} root
 * @param {WorkspaceState} state
 * @param {() => void} render
 */
export function bindWorkspaceDrag(root, state, render) {
  bindReorderDragHandles(root, state, render);
  bindPhotoDragSwap(root, state, render);
}

/** @param {MouseEvent} event */
export function shouldSuppressWorkspaceDragClick(event) {
  if (Date.now() > suppressClickUntil) return false;
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(".photo-card[data-photo-id], .drag-handle[data-drag-kind]")) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

/**
 * @param {HTMLElement} root
 * @param {WorkspaceState} state
 * @param {() => void} render
 */
function bindReorderDragHandles(root, state, render) {
  /** @type {{ kind: DragKind, id: string }|null} */
  let dragged = null;
  /** @type {HTMLElement|null} */
  let dropTarget = null;
  /** @type {DropPosition|null} */
  let dropPosition = null;

  /** @param {HTMLElement|null} item @param {DropPosition|null} position */
  const setDropTarget = (item, position) => {
    if (dropTarget === item && dropPosition === position) return;
    dropTarget?.classList.remove("is-drop-before", "is-drop-after");
    dropTarget = item;
    dropPosition = position;
    if (dropTarget && dropPosition) dropTarget.classList.add(`is-drop-${dropPosition}`);
  };

  const clearDragState = () => {
    root.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after").forEach((item) => {
      item.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    });
    dragged = null;
    dropTarget = null;
    dropPosition = null;
  };

  root.addEventListener("dragstart", (event) => {
    const handle = dragHandleFromEvent(root, event.target);
    const kind = dragKind(handle?.dataset.dragKind);
    const id = handle?.dataset.id ?? null;
    if (!handle || !kind || !id || !event.dataTransfer) return;
    const item = dragItemFromHandle(root, handle);
    dragged = { kind, id };
    if (item) setReorderDragImage(event, item);
    item?.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-interior-drag-kind", kind);
    event.dataTransfer.setData("text/plain", id);
  });

  root.addEventListener("dragover", (event) => {
    if (!dragged) return;
    const item = dropItemFromEvent(root, event.target, dragged.kind);
    const targetId = item?.dataset.id;
    if (!item || !targetId || targetId === dragged.id) {
      setDropTarget(null, null);
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropTarget(item, dropPositionFromEvent(event, item));
  });

  root.addEventListener("dragleave", (event) => {
    if (!dropTarget || event.relatedTarget instanceof Node && dropTarget.contains(event.relatedTarget)) return;
    const item = event.target instanceof Element ? event.target.closest("[data-drop-kind][data-id]") : null;
    if (item === dropTarget) setDropTarget(null, null);
  });

  root.addEventListener("drop", async (event) => {
    if (!dragged) return;
    const item = dropItemFromEvent(root, event.target, dragged.kind);
    const targetId = item?.dataset.id ?? null;
    if (!item || !targetId || targetId === dragged.id) {
      clearDragState();
      return;
    }
    event.preventDefault();
    const position = dropPositionFromEvent(event, item);
    const { kind, id } = dragged;
    suppressDragClick();
    clearDragState();
    await reorderByDragKind(state, kind, id, targetId, position, render);
  });

  root.addEventListener("dragend", () => {
    if (dragged) suppressDragClick();
    clearDragState();
  });
}

/**
 * @param {HTMLElement} root
 * @param {EventTarget|null} target
 * @returns {HTMLElement|null}
 */
function dragHandleFromEvent(root, target) {
  if (!(target instanceof Element)) return null;
  const handle = target.closest(".drag-handle[data-drag-kind][data-id]");
  return handle instanceof HTMLElement && root.contains(handle) ? handle : null;
}

/** @param {string|undefined} value @returns {DragKind|null} */
function dragKind(value) {
  return value === "sidebar" || value === "line-item" || value === "consideration" ? value : null;
}

/** @param {HTMLElement} root @param {HTMLElement} handle */
function dragItemFromHandle(root, handle) {
  const kind = handle.dataset.dragKind;
  const id = handle.dataset.id;
  if (!kind || !id) return null;
  return dropItemById(root, kind, id);
}

/**
 * @param {HTMLElement} root
 * @param {EventTarget|null} target
 * @param {DragKind} kind
 */
function dropItemFromEvent(root, target, kind) {
  if (!(target instanceof Element)) return null;
  const item = target.closest(`[data-drop-kind="${kind}"][data-id]`);
  return item instanceof HTMLElement && root.contains(item) ? item : null;
}

/** @param {HTMLElement} root @param {string} kind @param {string} id */
function dropItemById(root, kind, id) {
  const items = root.querySelectorAll(`[data-drop-kind="${kind}"][data-id]`);
  return /** @type {HTMLElement|null} */ (
    [...items].find((item) => item instanceof HTMLElement && item.dataset.id === id) ?? null
  );
}

/** @param {DragEvent} event @param {HTMLElement} item @returns {DropPosition} */
function dropPositionFromEvent(event, item) {
  const rect = item.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/** @param {DragEvent} event @param {HTMLElement} item */
function setReorderDragImage(event, item) {
  if (!event.dataTransfer) return;
  const rect = item.getBoundingClientRect();
  const offsetX = clamp(event.clientX - rect.left, 0, rect.width);
  const offsetY = clamp(event.clientY - rect.top, 0, rect.height);
  event.dataTransfer.setDragImage(item, offsetX, offsetY);
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {WorkspaceState} state
 * @param {DragKind} kind
 * @param {string} sourceId
 * @param {string} targetId
 * @param {DropPosition} position
 * @param {() => void} render
 */
async function reorderByDragKind(state, kind, sourceId, targetId, position, render) {
  if (kind === "sidebar") return reorderSidebarItem(state, sourceId, targetId, position, render);
  if (kind === "line-item") return reorderLineItem(state, sourceId, targetId, position, render);
  return reorderConsideration(state, sourceId, targetId, position, render);
}

/**
 * @param {HTMLElement} root
 * @param {WorkspaceState} state
 * @param {() => void} render
 */
function bindPhotoDragSwap(root, state, render) {
  /** @type {string|null} */
  let draggedPhotoId = null;
  /** @type {HTMLElement|null} */
  let dropTarget = null;

  /** @param {HTMLElement|null} card */
  const setDropTarget = (card) => {
    if (dropTarget === card) return;
    dropTarget?.classList.remove("is-drop-target");
    dropTarget = card;
    dropTarget?.classList.add("is-drop-target");
  };

  const clearDragState = () => {
    root.querySelectorAll(".photo-card.is-dragging, .photo-card.is-drop-target").forEach((card) => {
      card.classList.remove("is-dragging", "is-drop-target");
    });
    draggedPhotoId = null;
    dropTarget = null;
  };

  root.addEventListener("dragstart", (event) => {
    const card = photoCardFromEvent(root, event.target);
    const photoId = card?.dataset.photoId;
    if (!card || !photoId || !event.dataTransfer) return;
    draggedPhotoId = photoId;
    state.selectedPhotoId = photoId;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", photoId);
  });

  root.addEventListener("dragover", (event) => {
    const card = photoCardFromEvent(root, event.target);
    const targetId = card?.dataset.photoId;
    if (!draggedPhotoId || !card || !targetId || targetId === draggedPhotoId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropTarget(card);
  });

  root.addEventListener("dragleave", (event) => {
    if (!dropTarget || event.relatedTarget instanceof Node && dropTarget.contains(event.relatedTarget)) return;
    const card = photoCardFromEvent(root, event.target);
    if (card === dropTarget) setDropTarget(null);
  });

  root.addEventListener("drop", async (event) => {
    const card = photoCardFromEvent(root, event.target);
    const targetId = card?.dataset.photoId;
    const sourceId = draggedPhotoId ?? event.dataTransfer?.getData("text/plain") ?? null;
    if (!sourceId || !targetId || sourceId === targetId) {
      clearDragState();
      return;
    }
    event.preventDefault();
    suppressDragClick();
    clearDragState();
    await swapPhotos(state, sourceId, targetId, render);
  });

  root.addEventListener("dragend", () => {
    suppressDragClick();
    clearDragState();
  });
}

/**
 * @param {HTMLElement} root
 * @param {EventTarget|null} target
 * @returns {HTMLElement|null}
 */
function photoCardFromEvent(root, target) {
  if (!(target instanceof Element)) return null;
  const card = target.closest(".photo-card[data-photo-id]");
  return card instanceof HTMLElement && root.contains(card) ? card : null;
}

function suppressDragClick() {
  suppressClickUntil = Date.now() + 250;
}
