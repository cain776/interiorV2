// 워크스페이스 드래그/삽입형 재정렬 액션.

import { api } from "../api.js";
import { showToast } from "./toast.js";
import {
  findConsiderationOwner,
  isWholeHomeSpaceId,
  lineItemsByPhase,
  sortByOrder,
} from "./workspace-selectors.js";

/** @typedef {import("./workspace.js").WorkspaceState} WorkspaceState */
/** @typedef {import("../api.js").Consideration} Consideration */
/** @typedef {"before"|"after"} DropPosition */

/** @param {WorkspaceState} s @param {string} sourceId @param {string} targetId @param {DropPosition} position @param {() => void} render */
export async function reorderConsideration(s, sourceId, targetId, position, render) {
  const source = findConsiderationOwner(s, sourceId);
  const target = findConsiderationOwner(s, targetId);
  if (!source || !target || sourceId === targetId) return;

  if (source.type === "phase" && target.type === "phase" && source.phase.id === target.phase.id) {
    const next = moveByDrop(source.phase.considerations, sourceId, targetId, position);
    const error = await persistPhaseConsiderations(s, source.phase.id, next);
    if (error) return showToast(error, { kind: "error" });
    s.selectedConsiderationId = sourceId;
    render();
    return;
  }

  if (source.type === "custom" && target.type === "custom" && source.key === target.key) {
    s.customConsiderationsByContext[source.key] = moveByDrop(source.items, sourceId, targetId, position);
    s.selectedConsiderationId = sourceId;
    render();
    return;
  }

  showToast("같은 고려사항 묶음 안에서만 이동할 수 있습니다.", { kind: "error" });
}

/** @param {WorkspaceState} s @param {string} sourceId @param {string} targetId @param {DropPosition} position @param {() => void} render */
export async function reorderSidebarItem(s, sourceId, targetId, position, render) {
  if (sourceId === targetId) return;
  if (s.tab === "phases") {
    const items = sortByOrder(s.bundle.phases);
    const reordered = moveByDrop(items, sourceId, targetId, position);
    if (reordered === items) return;
    const result = await api.phases.reorder(s.bundle.project.id, reordered.map((item) => item.id));
    if (!result.ok) return showToast(result.error, { kind: "error" });
    s.bundle.phases = result.data;
    s.selectedPhaseId = sourceId;
  } else {
    if (isWholeHomeSpaceId(sourceId) || isWholeHomeSpaceId(targetId)) return;
    const items = sortByOrder(s.bundle.spaces);
    const reordered = moveByDrop(items, sourceId, targetId, position);
    if (reordered === items) return;
    const result = await api.spaces.reorder(s.bundle.project.id, reordered.map((item) => item.id));
    if (!result.ok) return showToast(result.error, { kind: "error" });
    s.bundle.spaces = result.data;
    s.selectedSpaceId = sourceId;
  }
  render();
}

/** @param {WorkspaceState} s @param {string} sourceId @param {string} targetId @param {DropPosition} position @param {() => void} render */
export async function reorderLineItem(s, sourceId, targetId, position, render) {
  if (sourceId === targetId) return;
  const source = s.bundle.lineItems.find((item) => item.id === sourceId) ?? null;
  const target = s.bundle.lineItems.find((item) => item.id === targetId) ?? null;
  if (!source || !target) return;
  if (source.phaseId !== target.phaseId) {
    showToast("같은 공정 안의 위치/항목만 이동할 수 있습니다.", { kind: "error" });
    return;
  }
  const siblings = lineItemsByPhase(s, source.phaseId);
  const reordered = moveByDrop(siblings, sourceId, targetId, position);
  if (reordered === siblings) return;
  const result = await api.lineItems.reorder(source.phaseId, reordered.map((item) => item.id));
  if (!result.ok) return showToast(result.error, { kind: "error" });
  const updated = new Map(result.data.map((li) => [li.id, li]));
  s.bundle.lineItems = s.bundle.lineItems.map((li) => updated.get(li.id) ?? li);
  s.selectedLineItemId = sourceId;
  render();
}

/** @param {WorkspaceState} s @param {string} phaseId @param {Consideration[]} considerations */
async function persistPhaseConsiderations(s, phaseId, considerations) {
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

/**
 * @template {{ id: string }} T
 * @param {T[]} items
 * @param {string} sourceId
 * @param {string} targetId
 * @param {DropPosition} position
 * @returns {T[]}
 */
function moveByDrop(items, sourceId, targetId, position) {
  if (sourceId === targetId) return items;
  const source = items.find((item) => item.id === sourceId);
  if (!source || !items.some((item) => item.id === targetId)) return items;
  const withoutSource = items.filter((item) => item.id !== sourceId);
  const targetIndex = withoutSource.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return items;
  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  return [
    ...withoutSource.slice(0, insertAt),
    source,
    ...withoutSource.slice(insertAt),
  ];
}
